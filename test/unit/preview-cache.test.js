'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCache, createScheduler, clampSplit } = require('../../core/preview-cache');

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
