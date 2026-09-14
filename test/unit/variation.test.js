'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { enumerate, isExcluded } = require('../../core/variation');

function cat(id, valueIds) {
  return { id, name: id, color: 'red', labelFormat: '{v}', folder: false, values: valueIds.map(v => ({ id: v, name: v, label: v })) };
}

test('cartesian product, last category changes fastest', () => {
  const cats = [cat('A', ['a0', 'a1']), cat('B', ['b0', 'b1', 'b2'])];
  const out = enumerate(cats);
  assert.deepEqual(out, [
    { A: 'a0', B: 'b0' }, { A: 'a0', B: 'b1' }, { A: 'a0', B: 'b2' },
    { A: 'a1', B: 'b0' }, { A: 'a1', B: 'b1' }, { A: 'a1', B: 'b2' },
  ]);
});

test('no categories yields one empty variation', () => {
  assert.deepEqual(enumerate([]), [{}]);
});

test('a category with zero values yields nothing', () => {
  assert.deepEqual(enumerate([cat('A', ['a0']), cat('B', [])]), []);
});

test('excluded partial combos are removed', () => {
  const cats = [cat('A', ['a0', 'a1']), cat('B', ['b0', 'b1'])];
  const out = enumerate(cats, { excluded: [{ A: 'a1', B: 'b0' }, { B: 'b1' }] });
  assert.deepEqual(out, [{ A: 'a0', B: 'b0' }]);
});

test('include filter restricts values per category', () => {
  const cats = [cat('A', ['a0', 'a1']), cat('B', ['b0', 'b1', 'b2'])];
  const out = enumerate(cats, { include: { B: ['b2', 'b0'] } });
  assert.deepEqual(out, [
    { A: 'a0', B: 'b0' }, { A: 'a0', B: 'b2' },
    { A: 'a1', B: 'b0' }, { A: 'a1', B: 'b2' },
  ]);
});

test('include with unknown value ids is ignored, empty include list means none', () => {
  const cats = [cat('A', ['a0', 'a1'])];
  assert.deepEqual(enumerate(cats, { include: { A: ['zzz', 'a1'] } }), [{ A: 'a1' }]);
  assert.deepEqual(enumerate(cats, { include: { A: [] } }), []);
});

test('isExcluded matches only when every pair matches', () => {
  assert.equal(isExcluded({ A: 'a1', B: 'b0' }, [{ A: 'a1', B: 'b0' }]), true);
  assert.equal(isExcluded({ A: 'a1', B: 'b1' }, [{ A: 'a1', B: 'b0' }]), false);
  assert.equal(isExcluded({ A: 'a1', B: 'b1' }, [{ A: 'a1' }]), true);
  assert.equal(isExcluded({ A: 'a1' }, [{}]), false);
  assert.equal(isExcluded({ A: 'a1' }, []), false);
});
