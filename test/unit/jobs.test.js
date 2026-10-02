'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildJobs } = require('../../core/jobs');
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
