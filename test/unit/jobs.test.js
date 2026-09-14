'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildJobs, orphanMarkIds, markedLayerIds } = require('../../core/jobs');
const { enumerate } = require('../../core/variation');

function cat(id, valueIds, labelFormat = '{c}{v}', folder = false) {
  return { id, name: id, color: 'red', labelFormat, folder, values: valueIds.map(v => ({ id: v, name: v.slice(1), label: v.slice(1) })) };
}
const categories = [cat('A', ['a0', 'a1']), cat('B', ['b0', 'b1'])];
const layers = [
  { id: 10, name: 'G', kind: 'group', visible: false, depth: 0, parentId: null, color: 'none' },
  { id: 11, name: 'inG', kind: 'layer', visible: true, depth: 1, parentId: 10, color: 'none' },
  { id: 20, name: 'A0', kind: 'layer', visible: true, depth: 0, parentId: null, color: 'none' },
  { id: 21, name: 'A1B1', kind: 'layer', visible: true, depth: 0, parentId: null, color: 'none' },
  { id: 30, name: 'plain', kind: 'layer', visible: true, depth: 0, parentId: null, color: 'none' },
];
function doc(marks, extra) {
  return Object.assign({ baseName: 'fx', delimiter: '_', categories, marks, excluded: [] }, extra);
}

test('jobs contain only marked layers, split into on/off per variation', () => {
  const d = doc({ '20': { A: ['a0'] }, '21': { A: ['a1'], B: ['b1'] } });
  const { jobs, conflicts, warnings } = buildJobs(d, layers, enumerate(categories));
  assert.equal(conflicts.length, 0);
  assert.equal(warnings.length, 0);
  assert.deepEqual(jobs.map(j => j.relativePath), ['fx_A0_B0.png', 'fx_A0_B1.png', 'fx_A1_B0.png', 'fx_A1_B1.png']);
  assert.deepEqual(jobs[0], { on: [20], off: [21], relativePath: 'fx_A0_B0.png' });
  assert.deepEqual(jobs[3], { on: [21], off: [20], relativePath: 'fx_A1_B1.png' });
});

test('duplicate relative paths are reported as conflicts', () => {
  const cats = [cat('A', ['a0', 'a1'])];
  cats[0].values[1].label = '0';
  const d = { baseName: 'fx', delimiter: '_', categories: cats, marks: {}, excluded: [] };
  const { jobs, conflicts } = buildJobs(d, layers, enumerate(cats));
  assert.equal(jobs.length, 2);
  assert.deepEqual(conflicts, ['fx_A0.png']);
});

test('orphan marks (layer id not in document) produce warnings and are skipped', () => {
  const d = doc({ '999': { A: ['a0'] }, '20': { A: ['a0'] } });
  const { jobs, warnings } = buildJobs(d, layers, enumerate(categories));
  assert.deepEqual(warnings, [{ type: 'orphan', layerId: 999 }]);
  assert.deepEqual(jobs[0].on, [20]);
  assert.deepEqual(orphanMarkIds(d.marks, layers), [999]);
});

test('stale category/value references produce warnings', () => {
  const d = doc({ '20': { Z: ['z0'], A: ['a0', 'gone'] } });
  const { warnings } = buildJobs(d, layers, enumerate(categories));
  assert.deepEqual(warnings, [
    { type: 'stale', layerId: 20, detail: { categoryId: 'Z', valueId: null } },
    { type: 'stale', layerId: 20, detail: { categoryId: 'A', valueId: 'gone' } },
  ]);
});

test('marked layer under an unmarked hidden group warns parentHidden', () => {
  const d = doc({ '11': { A: ['a0'] } });
  const { warnings } = buildJobs(d, layers, enumerate(categories));
  assert.deepEqual(warnings, [{ type: 'parentHidden', layerId: 11, detail: { groupId: 10 } }]);
});

test('marked hidden group does not warn for children', () => {
  const d = doc({ '10': { A: ['a1'] }, '11': { B: ['b0'] } });
  const { warnings, jobs } = buildJobs(d, layers, enumerate(categories));
  assert.equal(warnings.length, 0);
  // {A:a0,B:b0}: G(A=a1) 꺼짐, inG(B=b0) 켜짐 — 부모가 꺼져 있어도 판정은 각자 한다 (포토샵이 자식을 가린다)
  assert.deepEqual(jobs[0], { on: [11], off: [10], relativePath: 'fx_A0_B0.png' });
  assert.deepEqual(jobs[2], { on: [10, 11], off: [], relativePath: 'fx_A1_B0.png' });
});

test('markedLayerIds returns existing marked ids as numbers', () => {
  assert.deepEqual(markedLayerIds({ '20': { A: ['a0'] }, '999': { A: ['a0'] }, '11': {} }, layers), [11, 20]);
});
