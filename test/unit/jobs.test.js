'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildJobs, folderSummary } = require('../../core/jobs');
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
function doc(combos, extra) {
  return Object.assign({ baseName: 'fx', delimiter: '_', categories, combos, excluded: [] }, extra);
}

test('on = checked layers + ancestors, off = every other layer in the document', () => {
  const d = doc([{ when: { A: 'a0' }, layers: [20] }, { when: { A: 'a1', B: 'b1' }, layers: [21] }]);
  const { jobs, conflicts } = buildJobs(d, layers, enumerate(categories));
  assert.equal(conflicts.length, 0);
  assert.deepEqual(jobs.map(j => j.relativePath), ['fx_A0_B0.png', 'fx_A0_B1.png', 'fx_A1_B0.png', 'fx_A1_B1.png']);
  assert.deepEqual(jobs[0], { on: [20], off: [10, 11, 21, 30], relativePath: 'fx_A0_B0.png' });
  assert.deepEqual(jobs[3], { on: [21], off: [10, 11, 20, 30], relativePath: 'fx_A1_B1.png' });
});

test('a layer in A0_B1 and A1_B0 only is off in A0_B0 and A1_B1', () => {
  const d = doc([{ when: { A: 'a0', B: 'b1' }, layers: [21] }, { when: { A: 'a1', B: 'b0' }, layers: [21] }]);
  const { jobs } = buildJobs(d, layers, enumerate(categories));
  assert.deepEqual(jobs.map(j => j.on), [[], [21], [21], []]);
  assert.deepEqual(jobs.map(j => j.off), [[10, 11, 20, 21, 30], [10, 11, 20, 30], [10, 11, 20, 30], [10, 11, 20, 21, 30]]);
});

test('the "all combos" entry turns its layers on everywhere', () => {
  const d = doc([{ when: {}, layers: [30] }, { when: { B: 'b1' }, layers: [20] }]);
  const { jobs } = buildJobs(d, layers, enumerate(categories));
  assert.deepEqual(jobs.map(j => j.on), [[30], [20, 30], [30], [20, 30]]);
});

test('duplicate relative paths are reported as conflicts', () => {
  const cats = [cat('A', ['a0', 'a1'])];
  cats[0].values[1].label = '0';
  const d = { baseName: 'fx', delimiter: '_', categories: cats, combos: [], excluded: [] };
  const { jobs, conflicts } = buildJobs(d, layers, enumerate(cats));
  assert.equal(jobs.length, 2);
  assert.deepEqual(conflicts, ['fx_A0.png']);
});

test('orphan layers (not in document) produce warnings and are skipped', () => {
  const d = doc([{ when: { A: 'a0' }, layers: [999, 20] }]);
  const { jobs, warnings } = buildJobs(d, layers, enumerate(categories));
  assert.deepEqual(warnings.filter(w => w.type !== 'unused'), [{ type: 'orphan', layerId: 999 }]);
  assert.deepEqual(jobs[0].on, [20]);
  assert.deepEqual(jobs[2].off, [10, 11, 20, 21, 30]);
});

test('combos referring to missing categories/values warn stale and never match', () => {
  const d = doc([{ when: { Z: 'z0' }, layers: [20] }, { when: { A: 'gone' }, layers: [21] }]);
  const { jobs, warnings } = buildJobs(d, layers, enumerate(categories));
  assert.deepEqual(warnings.filter(w => w.type !== 'unused'), [
    { type: 'stale', detail: { when: { Z: 'z0' } } },
    { type: 'stale', detail: { when: { A: 'gone' } } },
  ]);
  for (const j of jobs) { assert.deepEqual(j.on, []); assert.deepEqual(j.off, [10, 11, 20, 21, 30]); }
});

test('a child checked under a hidden group turns the group on too (no parentHidden warning)', () => {
  const d = doc([{ when: { A: 'a0' }, layers: [11] }]);
  const { jobs, warnings } = buildJobs(d, layers, enumerate(categories));
  assert.deepEqual(jobs[0].on, [10, 11]);
  assert.deepEqual(jobs[2].on, []);
  assert.ok(!warnings.some(w => w.type === 'parentHidden'));
});

test('a checked group without checked children is on but its children stay off', () => {
  const d = doc([{ when: {}, layers: [10] }]);
  const { jobs } = buildJobs(d, layers, enumerate(categories));
  assert.deepEqual(jobs[0], { on: [10], off: [11, 20, 21, 30], relativePath: 'fx_A0_B0.png' });
});

test('layers never checked anywhere produce one unused warning with the count', () => {
  const d = doc([{ when: { A: 'a0' }, layers: [20] }]);
  const { warnings } = buildJobs(d, layers, enumerate(categories));
  assert.deepEqual(warnings, [{ type: 'unused', detail: { count: 4 } }]);
});

test('#5 a layer only in a stale combo is counted in the unused warning', () => {
  const d = doc([{ when: { A: 'gone' }, layers: [30] }, { when: {}, layers: [11, 20, 21] }]);
  const { warnings } = buildJobs(d, layers, enumerate(categories));
  assert.deepEqual(warnings.filter(w => w.type === 'unused'), [{ type: 'unused', detail: { count: 1 } }]);
});

// ---- 폴더 구성 미리보기 (#15) ----

test('folder summary groups the example of the issue: two levels with a count on the last', () => {
  const paths = [];
  for (const a of ['A1', 'A2']) for (const b of ['B1', 'B2', 'B3']) for (const c of ['C1', 'C2']) paths.push(`char_${a}/char_${a}_${b}/char_${a}_${b}_${c}.png`);
  const { rows, rootFiles } = folderSummary(paths);
  assert.equal(rootFiles, 0);
  assert.deepEqual(rows.map(r => [r.depth, r.name, r.count]), [
    [0, 'char_A1', 0], [1, 'char_A1_B1', 2], [1, 'char_A1_B2', 2], [1, 'char_A1_B3', 2],
    [0, 'char_A2', 0], [1, 'char_A2_B1', 2], [1, 'char_A2_B2', 2], [1, 'char_A2_B3', 2],
  ]);
});

test('folder summary without folders says how many files sit in the output folder', () => {
  assert.deepEqual(folderSummary(['a.png', 'b.png']), { rows: [], rootFiles: 2 });
  assert.deepEqual(folderSummary([]), { rows: [], rootFiles: 0 });
});

test('folder summary counts files beside subfolders, keeps a folder together, and ignores letter case like Windows', () => {
  const { rows, rootFiles } = folderSummary(['A/x.png', 'B/y.png', 'A/C/z.png', 'a/w.png', 'r.png']);
  assert.equal(rootFiles, 1);
  assert.deepEqual(rows.map(r => [r.depth, r.name, r.count]), [[0, 'A', 2], [1, 'C', 1], [0, 'B', 1]]);
});

test('folder summary follows the folder checks and the real paths of buildJobs', () => {
  const cats = [cat('A', ['a0', 'a1'], '{c}{v}', true), cat('B', ['b0', 'b1'], '{v}', false)];
  const d = doc([], { categories: cats });
  const paths = buildJobs(d, layers, enumerate(cats, { include: { A: ['a1'] } })).jobs.map(j => j.relativePath);
  const { rows } = folderSummary(paths);
  assert.deepEqual(rows.map(r => [r.name, r.count]), [['fx_A1', 2]]);
});
