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
// 눈은 복제본에서만 바꾼다. 원본은 눈·히스토리·저장 상태 모두 그대로여야 한다 (#12, #13).
function assertOriginalUntouched(ps) {
  assert.deepEqual(historyNow(ps), ps.before, 'history list and current state untouched');
  assert.equal(ps.doc.saved, true, 'still marked as saved');
  assert.ok(shown(ps).every(e => e[2] === 'lm_preview_src'), 'eyes change only on the copy');
  assert.equal(ps.app.activeDocument, ps.doc, 'the document is active again');
}

test('host.jsx stays ES3 + ASCII', () => {
  const src = fs.readFileSync(HOST, 'utf8');
  assert.ok(!/[^\x00-\x7f]/.test(src), 'non-ASCII character');
  assert.ok(!/=>|\blet\s|\bconst\s/.test(src.replace(/\/\/.*$/gm, '')), 'ES5+ syntax');
  new vm.Script(src); // 문법 오류면 throw
});

test('getDocInfo reports the size in pixels whatever the ruler units are, and leaves the ruler as it was', () => {
  const { LM, ps } = loadHost({ width: 12000, height: 13500 });
  ps.app.preferences.rulerUnits = 'PERCENT';
  const info = JSON.parse(LM.getDocInfo());
  assert.deepEqual([info.width, info.height], [12000, 13500]);
  assert.equal(ps.app.preferences.rulerUnits, 'PERCENT');
});

test('renderPreview applies visibility on a copy, downsizes to maxSize, saves, and leaves the document untouched', () => {
  const { LM, ps } = loadHost({ width: 12000, height: 13500 });
  const r = call(LM, 'renderPreview', { doc: ps.docRef, on: [1, 2], off: [3], maxSize: 1024 });
  assert.ok(!r.error, r.error);
  assert.equal(r.height, 1024);
  assert.equal(r.width, Math.round(12000 * 1024 / 13500));
  assert.match(r.path, /LayerMemorier\/preview_\d+\.png$/);
  assertOriginalUntouched(ps);
  assert.deepEqual(shown(ps).map(e => e[0]), ['Shw ', 'Hd  ']);
  assert.equal(ps.closedDuplicates, 1);
  assert.equal(ps.closedCopies, 1);
});

test('renderPreview keeps a small document at its size', () => {
  const { LM, ps } = loadHost({ width: 800, height: 600 });
  const r = call(LM, 'renderPreview', { doc: ps.docRef, on: [1], off: [], maxSize: 1024 });
  assert.deepEqual([r.width, r.height], [800, 600]);
  assert.ok(!ps.log.some(e => e[0] === 'resize'));
});

test('renderPreview downsizes the lower qualities with bilinear and the top quality with Bicubic Sharper', () => {
  for (const [maxSize, method] of [[256, 'BILINEAR'], [512, 'BILINEAR'], [1024, 'BICUBICSHARPER']]) {
    const { LM, ps } = loadHost({ width: 12000, height: 13500 });
    const r = call(LM, 'renderPreview', { doc: ps.docRef, on: [1], off: [], maxSize });
    assert.ok(!r.error, r.error);
    assert.equal(r.height, maxSize);
    assert.equal(ps.log.find(e => e[0] === 'resize')[3], method, `maxSize ${maxSize}`);
  }
});

// ---- 빠른 그리기: 레이어별 그림 ----

const layerArgs = (ps, extra) => Object.assign({
  doc: ps.docRef, all: [1, 2, 3], maxSize: 1350, budgetMs: 60000,
  units: [{ key: 'k1', on: [1] }, { key: 'k2', on: [2, 3] }],
}, extra);

test('renderLayerPictures hides everything once on one copy, shows each unit alone, saves it, and leaves the document untouched', () => {
  const { LM, ps } = loadHost({ width: 12000, height: 13500 });
  const r = call(LM, 'renderLayerPictures', layerArgs(ps));
  assert.ok(!r.error, r.error);
  assert.deepEqual(r.done.map(d => d.key), ['k1', 'k2']);
  for (const d of r.done) assert.match(d.path, /LayerMemorier\/preview_layer_\d+_\d+\.png$/);
  assert.equal(new Set(r.done.map(d => d.path)).size, 2, 'one file per unit');
  assert.deepEqual(shown(ps).map(e => e[0]), ['Hd  ', 'Shw ', 'Hd  ', 'Shw ', 'Hd  '], 'each unit is shown, then hidden again');
  assert.equal(ps.closedDuplicates, 2);
  assert.equal(ps.closedCopies, 1, 'one copy per call');
  assert.equal(ps.log.filter(e => e[0] === 'resize').length, 2);
  assertOriginalUntouched(ps);
});

test('renderLayerPictures saves into the folder the panel names, creating it, and leaves the temp folder alone', () => {
  const { LM, ps } = loadHost();
  const r = call(LM, 'renderLayerPictures', layerArgs(ps, { folder: 'C:/data/LayerMemorier/preview-cache/abc' }));
  assert.ok(!r.error, r.error);
  for (const d of r.done) assert.match(d.path, /^C:\/data\/LayerMemorier\/preview-cache\/abc\/preview_layer_/);
  assert.ok(ps.folders.has('C:/data/LayerMemorier/preview-cache/abc'));
});

test('getHistoryMark has no file stamp for a document that was never saved', () => {
  const { LM, ps } = loadHost({ saved: false });
  delete ps.doc.fullName;
  const m = JSON.parse(LM.getHistoryMark());
  assert.equal(m.stamp, null);
  assert.equal(m.saved, false);
});

test('eventIds includes the save event, so the panel can note a saved document', () => {
  const { LM } = loadHost();
  assert.equal(JSON.parse(LM.eventIds()).save, 'save');
});

test('renderLayerPictures stops at the time budget but always finishes one unit', () => {
  const { LM, ps } = loadHost();
  const r = call(LM, 'renderLayerPictures', layerArgs(ps, { budgetMs: 0 }));
  assert.deepEqual(r.done.map(d => d.key), ['k1']);
  assertOriginalUntouched(ps);
});

test('renderLayerPictures draws while redo states exist, and keeps them', () => {
  const { LM, ps } = loadHost({ history: { states: ['Open', 'Brush', 'Brush'], index: 1 } });
  const r = call(LM, 'renderLayerPictures', layerArgs(ps));
  assert.ok(!r.error, r.error);
  assertOriginalUntouched(ps);
});

test('renderLayerPictures refuses when another document is active, instead of switching back to it', () => {
  const { LM, ps } = loadHost();
  const r = call(LM, 'renderLayerPictures', layerArgs(ps, { doc: { name: 'b.psb', path: 'C:\\art\\b.psb' } }));
  assert.match(r.error, /active document changed/);
  assert.deepEqual(shown(ps), []);
});

test('renderLayerPictures closes its copies and leaves the document untouched when saving a unit fails', () => {
  const { LM, ps } = loadHost({ failSave: true });
  const r = call(LM, 'renderLayerPictures', layerArgs(ps));
  assert.match(r.error, /save failed/);
  assertOriginalUntouched(ps);
  assert.equal(ps.closedDuplicates, 1);
  assert.equal(ps.closedCopies, 1);
});

test('getFileStamp reads the stamp by path, in the same form as getHistoryMark, and null without a file', () => {
  const { LM, ps } = loadHost();
  ps.files.add('C:/art/a.psb');
  ps.stamps['C:/art/a.psb'] = [5000, 777];
  assert.deepEqual(call(LM, 'getFileStamp', { path: 'C:/art/a.psb' }), { stamp: JSON.parse(LM.getHistoryMark()).stamp });
  assert.deepEqual(call(LM, 'getFileStamp', { path: 'C:/art/gone.psb' }), { stamp: null });
});

test('getHistoryMark names the current state, with no id when Photoshop has none', () => {
  const { LM } = loadHost({ history: { states: ['Open', 'Brush'], index: 1 } });
  assert.deepEqual(JSON.parse(LM.getHistoryMark()), { id: 1001, index: 2, count: 2, name: 'Brush', saved: true, stamp: '5000:777' });
  const none = loadHost({ history: { states: ['Open', 'Brush'], index: 1, noId: true } });
  assert.deepEqual(JSON.parse(none.LM.getHistoryMark()), { id: null, index: 2, count: 2, name: 'Brush', saved: true, stamp: '5000:777' });
});

test('renderPreview draws while redo states exist, and keeps them', () => {
  const { LM, ps } = loadHost({ width: 100, height: 100, history: { states: ['Open', 'Brush', 'Brush', 'Move', 'Brush'], index: 2 } });
  const r = call(LM, 'renderPreview', { doc: ps.docRef, on: [1], off: [2], maxSize: 1024 });
  assert.ok(!r.error, r.error);
  assertOriginalUntouched(ps);
  assert.ok(!ps.log.some(e => e[0] === 'historyState'));
});

test('renderPreview closes its copies and leaves the document untouched when saving fails', () => {
  const { LM, ps } = loadHost({ width: 100, height: 100, failSave: true });
  const r = call(LM, 'renderPreview', { doc: ps.docRef, on: [1], off: [2], maxSize: 1024 });
  assert.ok(r.error);
  assertOriginalUntouched(ps);
  assert.equal(ps.closedDuplicates, 1);
  assert.equal(ps.closedCopies, 1);
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

test('renderPreview can run many times in a row', () => {
  const { LM, ps } = loadHost({ width: 100, height: 100 });
  for (let i = 0; i < 3; i++) {
    const r = call(LM, 'renderPreview', { doc: ps.docRef, on: [1], off: [2], maxSize: 1024 });
    assert.ok(!r.error, `call ${i + 1}: ${r.error}`);
  }
  assertOriginalUntouched(ps);
});
