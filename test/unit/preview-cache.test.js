'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCache, createScheduler, clampSplit, clampPercent, previewSize } = require('../../core/preview-cache');

test('cache evicts the least recently used entry beyond the limit', () => {
  const c = createCache(2);
  c.set('a', 1); c.set('b', 2);
  assert.equal(c.get('a'), 1); // a is now most recent
  c.set('c', 3);
  assert.equal(c.get('b'), null);
  assert.equal(c.get('a'), 1);
  assert.equal(c.get('c'), 3);
  assert.equal(c.size, 2);
  c.delete('a'); assert.equal(c.get('a'), null);
  c.clear(); assert.equal(c.size, 0);
});

test('scheduler runs one job at a time and keeps only the latest pending request', async () => {
  const ran = [];
  let release;
  const s = createScheduler(async job => { ran.push(job); if (job === 1) await new Promise(r => { release = r; }); });
  const done = s.request(1);
  assert.equal(s.busy, true);
  s.request(2); s.request(3); s.request(4);
  release();
  await done;
  assert.deepEqual(ran, [1, 4]);
  assert.equal(s.busy, false);
});

test('scheduler survives a throwing worker and keeps going', async () => {
  const ran = [];
  let release;
  const s = createScheduler(async job => {
    ran.push(job);
    if (job === 1) { await new Promise(r => { release = r; }); throw new Error('boom'); }
  });
  const done = s.request(1);
  s.request(2);
  release();
  await done;
  assert.deepEqual(ran, [1, 2]);
  await s.request(3);
  assert.deepEqual(ran, [1, 2, 3]);
});

test('clampSplit keeps both sides above their minimum and never returns NaN', () => {
  assert.equal(clampSplit(0.4, 1000, 160, 320), 0.4);
  assert.equal(clampSplit(0.9, 1000, 160, 320), 0.68);
  assert.equal(clampSplit(0.05, 1000, 160, 320), 0.16);
  assert.equal(clampSplit(NaN, 1000, 160, 320), 0.4);
  assert.equal(clampSplit(0.4, 0, 160, 320), 0.4);
  const narrow = clampSplit(0.4, 300, 160, 320); // 둘 다 못 지킴 → 그림 최소 우선
  assert.ok(narrow > 0 && narrow <= 1);
  assert.equal(Math.round(narrow * 300), 160);
});

test('clampPercent keeps a whole number from 1 to 100, and gives null when there is no number', () => {
  for (const [input, want] of [['25', 25], [25.4, 25], [0, 1], [-5, 1], ['250', 100], ['', null], ['  ', null], ['abc', null], [null, null], [undefined, null]]) {
    assert.equal(clampPercent(input), want, JSON.stringify(input));
  }
});

test('previewSize scales the long side by percent, stays within 8192px, and never reaches 0', () => {
  for (const [percent, w, h, want] of [
    [10, 12000, 13500, { maxSize: 1350, width: 1200, height: 1350 }],
    [100, 12000, 13500, { maxSize: 8192, width: 7282, height: 8192 }],
    [100, 800, 600, { maxSize: 800, width: 800, height: 600 }],
    [1, 800, 600, { maxSize: 8, width: 8, height: 6 }],
    [1, 50, 20, { maxSize: 1, width: 1, height: 1 }],
  ]) {
    assert.deepEqual(previewSize(percent, w, h), want, `${percent}% of ${w}x${h}`);
  }
});
