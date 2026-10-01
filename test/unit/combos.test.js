'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../core/combos');

function cat(id, valueIds) {
  return { id, name: id, color: 'red', labelFormat: '{v}', folder: false, values: valueIds.map(v => ({ id: v, name: v.slice(1), label: v.slice(1) })) };
}
const cats = [cat('A', ['a0', 'a1']), cat('B', ['b0', 'b1', 'b2']), cat('N', ['n1', 'n2'])];
const layers = [10, 11, 20, 21, 30].map(id => ({ id, name: 'L' + id, kind: 'layer', visible: true, depth: 0, parentId: null, color: 'none' }));
const deepFreeze = o => { Object.values(o).forEach(v => { if (v && typeof v === 'object') deepFreeze(v); }); return Object.freeze(o); };

test('matches: empty when matches everything, keys must all agree', () => {
  assert.equal(C.matches({}, { A: 'a0', B: 'b0' }), true);
  assert.equal(C.matches({ A: 'a0' }, { A: 'a0', B: 'b2' }), true);
  assert.equal(C.matches({ A: 'a0', B: 'b2' }, { A: 'a0', B: 'b1' }), false);
  assert.equal(C.matches({ Z: 'z0' }, { A: 'a0', B: 'b0' }), false, 'missing category never matches');
  assert.equal(C.matches({ A: 'gone' }, { A: 'a0', B: 'b0' }), false, 'missing value never matches');
});

test('covers / sameWhen ignore key order', () => {
  assert.equal(C.covers({ A: 'a0' }, { B: 'b2', A: 'a0' }), true);
  assert.equal(C.covers({ A: 'a0', B: 'b2' }, { A: 'a0' }), false);
  assert.equal(C.sameWhen({ A: 'a0', B: 'b2' }, { B: 'b2', A: 'a0' }), true);
  assert.equal(C.sameWhen({ A: 'a0' }, { A: 'a0', B: 'b2' }), false);
  assert.equal(C.sameWhen({}, {}), true);
});

test('onLayerIds is the union of matching entries', () => {
  const combos = [
    { when: { A: 'a0' }, layers: [20] },
    { when: { A: 'a0', B: 'b2' }, layers: [21, 20] },
    { when: { A: 'a1', B: 'b0' }, layers: [21] },
    { when: {}, layers: [30] },
  ];
  assert.deepEqual(C.onLayerIds(combos, { A: 'a0', B: 'b2', N: 'n1' }), [20, 21, 30]);
  assert.deepEqual(C.onLayerIds(combos, { A: 'a0', B: 'b0', N: 'n1' }), [20, 30]);
  assert.deepEqual(C.onLayerIds(combos, { A: 'a1', B: 'b0', N: 'n2' }), [21, 30]);
  assert.deepEqual(C.onLayerIds(combos, { A: 'a1', B: 'b2', N: 'n2' }), [30]);
});

test('managed / orphan layer ids', () => {
  const combos = [{ when: { A: 'a0' }, layers: [21, 999] }, { when: { B: 'b0' }, layers: [10, 21] }];
  assert.deepEqual(C.managedLayerIds(combos, layers), [10, 21]);
  assert.deepEqual(C.orphanLayerIds(combos, layers), [999]);
  assert.deepEqual(C.pruneOrphans(combos, layers), [{ when: { A: 'a0' }, layers: [21] }, { when: { B: 'b0' }, layers: [10, 21] }]);
  assert.deepEqual(C.pruneOrphans([{ when: {}, layers: [999] }], layers), [], 'entry left empty is removed');
});

test('toggle adds to the exact entry, creates it, never duplicates, drops empty entries', () => {
  const start = deepFreeze([{ when: { A: 'a0' }, layers: [20] }]);
  let c = C.toggle(start, { A: 'a0' }, [21, 20], true);
  assert.deepEqual(c, [{ when: { A: 'a0' }, layers: [20, 21] }]);
  c = C.toggle(c, { B: 'b2', A: 'a0' }, [30], true);
  assert.deepEqual(c, [{ when: { A: 'a0' }, layers: [20, 21] }, { when: { B: 'b2', A: 'a0' }, layers: [30] }]);
  c = C.toggle(c, { A: 'a0', B: 'b2' }, [30], false);
  assert.deepEqual(c, [{ when: { A: 'a0' }, layers: [20, 21] }]);
  assert.deepEqual(C.toggle(c, { N: 'n1' }, [10], false), c, 'removing from a missing entry changes nothing');
  assert.deepEqual(start, [{ when: { A: 'a0' }, layers: [20] }], 'input untouched');
});

test('toggle copies the when object it stores', () => {
  const when = { A: 'a1' };
  const c = C.toggle([], when, [10], true);
  when.B = 'b0';
  assert.deepEqual(c[0].when, { A: 'a1' });
});

test('removeLayers / countWithLayers', () => {
  const combos = deepFreeze([{ when: { A: 'a0' }, layers: [20, 21] }, { when: { B: 'b0' }, layers: [21] }, { when: { N: 'n1' }, layers: [30] }]);
  assert.equal(C.countWithLayers(combos, [21]), 2);
  assert.equal(C.countWithLayers(combos, [21, 30]), 3);
  assert.equal(C.countWithLayers(combos, [11]), 0);
  assert.deepEqual(C.removeLayers(combos, [21]), [{ when: { A: 'a0' }, layers: [20] }, { when: { N: 'n1' }, layers: [30] }]);
});

test('removeFor / countFor by category or by value', () => {
  const combos = deepFreeze([{ when: { A: 'a0' }, layers: [20] }, { when: { A: 'a1', B: 'b0' }, layers: [21] }, { when: { B: 'b0' }, layers: [10] }, { when: {}, layers: [30] }]);
  assert.equal(C.countFor(combos, 'A', null), 2);
  assert.equal(C.countFor(combos, 'B', 'b0'), 2);
  assert.equal(C.countFor(combos, 'B', 'b1'), 0);
  assert.deepEqual(C.removeFor(combos, 'A', null), [{ when: { B: 'b0' }, layers: [10] }, { when: {}, layers: [30] }]);
  assert.deepEqual(C.removeFor(combos, 'B', 'b0'), [{ when: { A: 'a0' }, layers: [20] }, { when: {}, layers: [30] }]);
});

test('layerState: checked, inherited from the narrowest broader entry, none', () => {
  const combos = [
    { when: {}, layers: [10] },
    { when: { A: 'a0' }, layers: [10, 20] },
    { when: { B: 'b2' }, layers: [20] },
    { when: { A: 'a0', B: 'b2' }, layers: [21] },
    { when: { A: 'a0', B: 'b2', N: 'n1' }, layers: [30] },
  ];
  const S = { A: 'a0', B: 'b2' };
  assert.deepEqual(C.layerState(combos, S, 21), { state: 'checked', from: null });
  assert.deepEqual(C.layerState(combos, S, 10), { state: 'inherited', from: { A: 'a0' } }, 'A0 is narrower than {}');
  assert.deepEqual(C.layerState(combos, S, 20), { state: 'inherited', from: { A: 'a0' } }, 'same size: earlier entry wins');
  assert.deepEqual(C.layerState(combos, S, 30), { state: 'none', from: null }, 'narrower entries do not count');
  assert.deepEqual(C.layerState(combos, S, 11), { state: 'none', from: null });
  assert.deepEqual(C.layerState(combos, {}, 10), { state: 'checked', from: null });
  assert.deepEqual(C.layerState(combos, { A: 'a1' }, 10), { state: 'inherited', from: {} });
});

test('isStale / comboName', () => {
  assert.equal(C.isStale({ A: 'a0', B: 'b2' }, cats), false);
  assert.equal(C.isStale({ Z: 'z0' }, cats), true);
  assert.equal(C.isStale({ A: 'gone' }, cats), true);
  assert.equal(C.comboName({ B: 'b2', A: 'a0' }, cats), 'A0_B2', 'category order, not key order');
  assert.equal(C.comboName({}, cats), '모든 조합');
  assert.equal(C.comboName({ A: 'gone', N: 'n2' }, cats), 'A?_N2');
  assert.equal(C.comboName({ Z: 'z0', A: 'a1' }, cats), 'A1_?');
});

test('sortCombos: category order, "all" before values, then value order; stable', () => {
  const combos = [
    { when: { A: 'a1' }, layers: [1] },
    { when: { A: 'a0', B: 'b2' }, layers: [2] },
    { when: { B: 'b0' }, layers: [3] },
    { when: { A: 'a0' }, layers: [4] },
    { when: {}, layers: [5] },
    { when: { N: 'n2' }, layers: [6] },
  ];
  assert.deepEqual(C.sortCombos(combos, cats).map(c => C.comboName(c.when, cats)), ['모든 조합', 'N2', 'B0', 'A0', 'A0_B2', 'A1']);
  assert.deepEqual(combos[0].when, { A: 'a1' }, 'input order untouched');
});

test('combosOfLayer returns sorted entries containing the layer', () => {
  const combos = [{ when: { A: 'a1' }, layers: [20] }, { when: { B: 'b0' }, layers: [20, 21] }, { when: { A: 'a0' }, layers: [21] }];
  assert.deepEqual(C.combosOfLayer(combos, 20, cats).map(c => C.comboName(c.when, cats)), ['B0', 'A1']);
  assert.deepEqual(C.combosOfLayer(combos, 30, cats), []);
});

test('previewVariation fills "all" categories with their first value', () => {
  assert.deepEqual(C.previewVariation({ B: 'b2' }, cats), { A: 'a0', B: 'b2', N: 'n1' });
  assert.deepEqual(C.previewVariation({}, cats), { A: 'a0', B: 'b0', N: 'n1' });
  assert.equal(C.previewVariation({}, cats.concat(cat('E', []))), null, 'empty category: no preview');
});
