'use strict';
// host.jsx 단위 테스트 (포토샵 없이 test/helpers/host-stub.js 로). 실제 포토샵 동작은 e2e에서 본다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');
const { loadHost, HOST } = require('../helpers/host-stub');

const call = (LM, fn, arg) => JSON.parse(LM[fn](JSON.stringify(arg)));
const shown = ps => ps.log.filter(e => e[0] === 'Shw ' || e[0] === 'Hd  ');
const historyNow = ps => ({ states: ps.history.states.slice(), index: ps.history.index });

test('host.jsx stays ES3 + ASCII', () => {
  const src = fs.readFileSync(HOST, 'utf8');
  assert.ok(!/[^\x00-\x7f]/.test(src), 'non-ASCII character');
  assert.ok(!/=>|\blet\s|\bconst\s/.test(src.replace(/\/\/.*$/gm, '')), 'ES5+ syntax');
  new vm.Script(src); // 문법 오류면 throw
});

test('renderPreview applies visibility, downsizes to maxSize, saves, then restores history', () => {
  const { LM, ps } = loadHost({ width: 12000, height: 13500 });
  const r = call(LM, 'renderPreview', { doc: ps.docRef, on: [1, 2], off: [3], maxSize: 1024 });
  assert.ok(!r.error, r.error);
  assert.equal(r.height, 1024);
  assert.equal(r.width, Math.round(12000 * 1024 / 13500));
  assert.match(r.path, /LayerMemorier\/preview_\d+\.png$/);
  assert.deepEqual(historyNow(ps), ps.before, 'history list and current state untouched (no redo step left)');
  assert.deepEqual(shown(ps).map(e => e[0]), ['Shw ', 'Hd  ']);
  assert.equal(ps.closedDuplicates, 1);
});

test('renderPreview keeps a small document at its size', () => {
  const { LM, ps } = loadHost({ width: 800, height: 600 });
  const r = call(LM, 'renderPreview', { doc: ps.docRef, on: [1], off: [], maxSize: 1024 });
  assert.deepEqual([r.width, r.height], [800, 600]);
  assert.ok(!ps.log.some(e => e[0] === 'resize'));
});

test('renderPreview refuses when redo states exist and touches nothing', () => {
  const { LM, ps } = loadHost({ width: 100, height: 100, history: { states: ['Open', 'Brush', 'Brush', 'Move', 'Brush'], index: 2 } });
  const r = call(LM, 'renderPreview', { doc: ps.docRef, on: [1], off: [2], maxSize: 1024 });
  assert.match(r.error, /LM_REDO_PENDING/);
  assert.equal(shown(ps).length, 0);
  assert.ok(!ps.log.some(e => e[0] === 'historyState'));
});

test('renderPreview restores history even when saving fails', () => {
  const { LM, ps } = loadHost({ width: 100, height: 100, failSave: true });
  const r = call(LM, 'renderPreview', { doc: ps.docRef, on: [1], off: [2], maxSize: 1024 });
  assert.ok(r.error);
  assert.deepEqual(historyNow(ps), ps.before);
  assert.equal(ps.closedDuplicates, 1);
});

test('renderPreview clears old preview files once, on the first call', () => {
  const { LM, ps } = loadHost({ width: 100, height: 100 });
  ps.folders.add('C:/Temp/LayerMemorier');
  ps.files.add('C:/Temp/LayerMemorier/preview_1.png');
  ps.files.add('C:/Temp/LayerMemorier/keep.txt');
  const r1 = call(LM, 'renderPreview', { doc: ps.docRef, on: [1], off: [], maxSize: 1024 });
  assert.ok(!ps.files.has('C:/Temp/LayerMemorier/preview_1.png'));
  assert.ok(ps.files.has('C:/Temp/LayerMemorier/keep.txt'));
  call(LM, 'renderPreview', { doc: ps.docRef, on: [1], off: [], maxSize: 1024 });
  assert.ok(ps.files.has(r1.path), 'second call must not delete the first preview');
});

test('renderPreview can run many times in a row (its own step never counts as redo)', () => {
  const { LM, ps } = loadHost({ width: 100, height: 100 });
  for (let i = 0; i < 3; i++) {
    const r = call(LM, 'renderPreview', { doc: ps.docRef, on: [1], off: [2], maxSize: 1024 });
    assert.ok(!r.error, `call ${i + 1}: ${r.error}`);
  }
  assert.deepEqual(historyNow(ps), ps.before);
});

test('renderPreview falls back to stepping back when deleting its step fails, and the next call still works', () => {
  const { LM, ps } = loadHost({ width: 100, height: 100, failDelete: true });
  const r1 = call(LM, 'renderPreview', { doc: ps.docRef, on: [1], off: [2], maxSize: 1024 });
  assert.ok(!r1.error, r1.error);
  assert.equal(ps.history.index, ps.before.index, 'current state is the one before the preview');
  const r2 = call(LM, 'renderPreview', { doc: ps.docRef, on: [1], off: [2], maxSize: 1024 });
  assert.ok(!r2.error, 'a left-over greyed preview step is not a user redo step: ' + r2.error);
});

test('renderPreview never deletes the artist\'s own step when it made no step itself', () => {
  const { LM, ps } = loadHost({ width: 100, height: 100 });
  const r = call(LM, 'renderPreview', { doc: ps.docRef, on: [], off: [], maxSize: 1024 });
  assert.ok(!r.error, r.error);
  assert.deepEqual(historyNow(ps), ps.before);
});
