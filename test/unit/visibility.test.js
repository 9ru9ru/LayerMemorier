'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { judge, markIssues } = require('../../core/visibility');

function cat(id, valueIds) {
  return { id, name: id, color: 'red', labelFormat: '{v}', folder: false, values: valueIds.map(v => ({ id: v, name: v, label: v })) };
}
const cats = [cat('A', ['a0', 'a1']), cat('B', ['b0', 'b1'])];

test('empty mark is null (untouched)', () => {
  assert.equal(judge({}, { A: 'a0', B: 'b0' }, cats), null);
  assert.equal(judge(undefined, { A: 'a0', B: 'b0' }, cats), null);
});

test('all marked categories must contain the variation value', () => {
  const mark = { A: ['a0'], B: ['b0', 'b1'] };
  assert.equal(judge(mark, { A: 'a0', B: 'b1' }, cats), true);
  assert.equal(judge(mark, { A: 'a1', B: 'b1' }, cats), false);
});

test('single category mark ignores other categories', () => {
  assert.equal(judge({ B: ['b1'] }, { A: 'a1', B: 'b1' }, cats), true);
  assert.equal(judge({ B: ['b1'] }, { A: 'a1', B: 'b0' }, cats), false);
});

test('mark referencing a missing category is ignored; only missing -> null', () => {
  assert.equal(judge({ Z: ['z0'], A: ['a1'] }, { A: 'a1', B: 'b0' }, cats), true);
  assert.equal(judge({ Z: ['z0'] }, { A: 'a1', B: 'b0' }, cats), null);
});

test('unknown value ids count as not present', () => {
  assert.equal(judge({ A: ['zzz'] }, { A: 'a0', B: 'b0' }, cats), false);
  assert.equal(judge({ A: ['zzz', 'a0'] }, { A: 'a0', B: 'b0' }, cats), true);
});

test('markIssues lists stale categories and values', () => {
  assert.deepEqual(markIssues({ Z: ['z0'], A: ['a0', 'nope'] }, cats), [
    { categoryId: 'Z', valueId: null },
    { categoryId: 'A', valueId: 'nope' },
  ]);
  assert.deepEqual(markIssues({ A: ['a0'] }, cats), []);
});
