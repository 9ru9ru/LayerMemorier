'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { pairs, copy } = require('../../core/bulk-copy');
const { onLayerIds } = require('../../core/combos');
const { enumerate } = require('../../core/variation');

const cat = (id, values) => ({ id, name: id, color: 'red', labelFormat: '{v}', folder: false, values: values.map(v => ({ id: v, name: v, label: v })) });
const categories = [cat('A', ['A1', 'A2']), cat('B', ['B1', 'B2', 'B3']), cat('C', ['C1', 'C2'])];
const ALL = { A: ['A1', 'A2'], B: ['B1', 'B2', 'B3'], C: ['C1', 'C2'] };
const key = v => `${v.A} ${v.B} ${v.C}`;

// 모든 배리에이션에 자기만의 레이어 하나: 어디서 복사됐는지 바로 보인다.
function authored(when) {
  let id = 0;
  return enumerate(categories).filter(v => Object.keys(when).every(k => v[k] === when[k])).map(v => ({ when: v, layers: [++id, 100 + id] }));
}
const snapshot = combos => new Map(enumerate(categories).map(v => [key(v), onLayerIds(combos, v)]));

test('one fixed category copies 6 pairs, keeping the values of the others', () => {
  assert.deepEqual(pairs(categories, { A: 'A1' }, { A: ['A2'] }).map(p => `${key(p.from)} > ${key(p.to)}`), [
    'A1 B1 C1 > A2 B1 C1', 'A1 B1 C2 > A2 B1 C2',
    'A1 B2 C1 > A2 B2 C1', 'A1 B2 C2 > A2 B2 C2',
    'A1 B3 C1 > A2 B3 C1', 'A1 B3 C2 > A2 B3 C2',
  ]);
});

test('the pair counts of the issue table: 2, 10 and 11, never the source itself', () => {
  const count = (source, targets) => pairs(categories, source, targets).length;
  assert.equal(count({ A: 'A1' }, { A: ['A2'] }), 6);
  assert.equal(count({ A: 'A1', B: 'B1' }, { A: ['A2'], B: ['B2'] }), 2);
  assert.equal(count({ A: 'A1', B: 'B1' }, { A: ALL.A, B: ALL.B }), 10);
  assert.equal(count({ A: 'A1', B: 'B1', C: 'C1' }, ALL), 11);
  assert.deepEqual(pairs(categories, { A: 'A1', B: 'B1' }, { A: ['A2'], B: ['B2'] }).map(p => `${key(p.from)} > ${key(p.to)}`),
    ['A1 B1 C1 > A2 B2 C1', 'A1 B1 C2 > A2 B2 C2']);
  assert.equal(count({ A: 'A1' }, { A: ['A1'] }), 0, 'copying onto itself is nothing');
  assert.equal(count({}, {}), 0, 'no fixed category is nothing');
});

for (const [name, when, source, targets, n] of [
  ['one category', { A: 'A1' }, { A: 'A1' }, { A: ['A2'] }, 6],
  ['two categories, one target', { A: 'A1', B: 'B1' }, { A: 'A1', B: 'B1' }, { A: ['A2'], B: ['B2'] }, 2],
  ['two categories, every target', { A: 'A1', B: 'B1' }, { A: 'A1', B: 'B1' }, { A: ALL.A, B: ALL.B }, 10],
  ['three categories, every target', { A: 'A1', B: 'B1', C: 'C1' }, { A: 'A1', B: 'B1', C: 'C1' }, ALL, 11],
]) {
  test(`${name}: every target equals its source and nothing else changes`, () => {
    const combos = authored(when);
    const before = snapshot(combos);
    const r = copy(combos, categories, source, targets);
    assert.equal(r.copied, n);
    const after = snapshot(r.combos);
    const expected = new Map(before);
    for (const p of pairs(categories, source, targets)) expected.set(key(p.to), onLayerIds(combos, p.from));
    assert.deepEqual(after, expected);
  });
}

test('a written target stays as it is by default, and overwrite replaces it', () => {
  const combos = authored({ A: 'A1' }).concat({ when: { A: 'A2', B: 'B1', C: 'C1' }, layers: [50] });
  const kept = copy(combos, categories, { A: 'A1' }, { A: ['A2'] });
  assert.deepEqual([kept.copied, kept.skippedFilled, kept.overwritten], [5, 1, 0]);
  assert.deepEqual(onLayerIds(kept.combos, { A: 'A2', B: 'B1', C: 'C1' }), [50]);
  const over = copy(combos, categories, { A: 'A1' }, { A: ['A2'] }, { overwrite: true });
  assert.deepEqual([over.copied, over.skippedFilled, over.overwritten], [6, 0, 1]);
  assert.deepEqual(onLayerIds(over.combos, { A: 'A2', B: 'B1', C: 'C1' }), onLayerIds(combos, { A: 'A1', B: 'B1', C: 'C1' }));
});

test('an empty source is skipped and leaves its target alone, even with overwrite', () => {
  const combos = [{ when: { A: 'A1', B: 'B1', C: 'C1' }, layers: [1] }, { when: { A: 'A2', B: 'B1', C: 'C2' }, layers: [9] }];
  const r = copy(combos, categories, { A: 'A1' }, { A: ['A2'] }, { overwrite: true });
  assert.deepEqual([r.copied, r.skippedEmpty], [1, 5]);
  assert.deepEqual(onLayerIds(r.combos, { A: 'A2', B: 'B1', C: 'C2' }), [9]);
});

test('variations in the always-excluded list are neither source nor target', () => {
  const combos = authored({ A: 'A1' });
  const r = copy(combos, categories, { A: 'A1' }, { A: ['A2'] }, { excluded: [{ A: 'A2', B: 'B1' }, { A: 'A1', B: 'B3', C: 'C2' }] });
  assert.deepEqual([r.copied, r.skippedExcluded], [3, 3]);
  assert.deepEqual(onLayerIds(r.combos, { A: 'A2', B: 'B1', C: 'C1' }), []);
  assert.deepEqual(onLayerIds(r.combos, { A: 'A2', B: 'B3', C: 'C2' }), []);
});

test('a target already equal to its source counts as the same, not as overwritten', () => {
  const combos = [{ when: { A: 'A1', B: 'B1', C: 'C1' }, layers: [1, 2] }, { when: { A: 'A2', B: 'B1', C: 'C1' }, layers: [2, 1] }];
  const r = copy(combos, categories, { A: 'A1' }, { A: ['A2'] }, { overwrite: true });
  assert.deepEqual([r.copied, r.overwritten, r.skippedSame], [0, 0, 1]);
});

test('layers deleted from the document are not copied', () => {
  const combos = [{ when: { A: 'A1', B: 'B1', C: 'C1' }, layers: [1, 2] }, { when: { A: 'A1', B: 'B1', C: 'C2' }, layers: [2] }];
  const r = copy(combos, categories, { A: 'A1' }, { A: ['A2'] }, { layerIds: [1] });
  assert.deepEqual(onLayerIds(r.combos, { A: 'A2', B: 'B1', C: 'C1' }), [1]);
  assert.deepEqual(onLayerIds(r.combos, { A: 'A2', B: 'B1', C: 'C2' }), []);
  assert.equal(r.skippedEmpty, 5);
});

test('wide entries mixed in: overwriting a target splits them and no other variation changes', () => {
  const combos = [{ when: {}, layers: [7] }, { when: { A: 'A1', B: 'B1' }, layers: [8] }];
  const before = snapshot(combos);
  const r = copy(combos, categories, { A: 'A2', B: 'B1', C: 'C1' }, { A: ['A1'], B: ['B1'], C: ['C1'] }, { overwrite: true });
  assert.equal(r.copied, 1);
  const after = snapshot(r.combos);
  assert.deepEqual(after.get('A1 B1 C1'), [7], 'target equals its source');
  after.delete('A1 B1 C1');
  before.delete('A1 B1 C1');
  assert.deepEqual(after, before);
});

test('the source list is read before copying and the input is not changed', () => {
  const combos = authored({ A: 'A1' });
  const frozen = JSON.stringify(combos);
  copy(combos, categories, { A: 'A1' }, { A: ['A2'] }, { overwrite: true });
  assert.equal(JSON.stringify(combos), frozen);
});
