'use strict';
// 패널 렌더·동작 스모크 테스트 (test/helpers/panel-vm.js). 호스트 호출은 LMHost.call 을 덮어써서 본다.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPanel } = require('../helpers/panel-vm');

function setupDoc(ctx, { categories, combos, layers }) {
  ctx.LMState.docInfo = { name: 'a.psd', path: 'C:/a.psd' };
  ctx.LMState.docKey = 'C:/a.psd';
  ctx.LMState.docData = Object.assign(ctx.LMApp.newDocData('a'), { categories, combos });
  ctx.LMState.docData.output = ctx.LMCore.output.normalize(undefined);
  ctx.LMState.layers = layers;
}
const L = (id, parentId, kind = 'layer') => ({ id, name: 'L' + id, kind, visible: true, depth: parentId == null ? 0 : 1, parentId, color: 'none' });
// vm 안에서 만든 배열은 프로토타입이 달라 deepStrictEqual이 거부한다. 이 realm의 배열로 바꿔 비교한다.
const arr = a => Array.from(a);
const cat = (id, vals) => ({ id, name: id, color: 'red', labelFormat: '{c}{v}', folder: false, values: vals.map(v => ({ id: v, name: v, label: v })) });

test('export tab names a category without values when there are 0 variations', () => {
  const { ctx, el } = loadPanel();
  setupDoc(ctx, { categories: [cat('누드', ['기본']), cat('야스', [])], combos: [], layers: [L(1, null)] });
  const e = el(900);
  ctx.LMUI.export.render(e);
  assert.match(e.innerHTML, /값 없는 카테고리: 야스/);
});

test('export tab names a category fully unchecked in "이번만 내보낼 값"', () => {
  const { ctx, el } = loadPanel();
  setupDoc(ctx, { categories: [cat('옷', ['a', 'b'])], combos: [], layers: [L(1, null)] });
  ctx.LMState.include = { 옷: [] };
  const e = el(900);
  ctx.LMUI.export.render(e);
  assert.match(e.innerHTML, /모두 끈 카테고리: 옷/);
});

test('export tab shows the unused-layer warning', () => {
  const { ctx, el } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a'])], combos: [{ when: {}, layers: [2] }], layers: [L(1, null, 'group'), L(2, 1), L(3, null)] });
  const e = el(900);
  ctx.LMUI.export.render(e);
  assert.match(e.innerHTML, /체크되지 않은 레이어 1개/);
  assert.doesNotMatch(e.innerHTML, /empty-reason/);
});

test('ctrl on a group checkbox targets the group and all descendants', () => {
  const { ctx } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a'])], combos: [], layers: [L(1, null, 'group'), L(2, 1, 'group'), L(3, 2), L(4, null)] });
  assert.deepEqual(arr(ctx.LMUI.layers.checkboxTargets(1, true)), [1, 2, 3]);
  assert.deepEqual(arr(ctx.LMUI.layers.checkboxTargets(1, false)), [1]);
  ctx.LMState.selectedIds = [1, 4];
  assert.deepEqual(arr(ctx.LMUI.layers.checkboxTargets(4, true)), [1, 4, 2, 3]);
});

test('photoshop preview turns every non-checked layer off, independent of PSD state', async () => {
  const { ctx } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a'])], combos: [{ when: {}, layers: [3] }], layers: [L(1, null, 'group'), L(2, 1, 'group'), L(3, 2), L(4, null)] });
  const calls = [];
  ctx.LMHost.call = async (fn, arg) => { calls.push([fn, arg]); return fn === 'getLayers' ? ctx.LMState.layers.map(l => Object.assign({}, l)) : { ok: true }; };
  await ctx.LMPreview.enable();
  const vis = calls.find(c => c[0] === 'applyVisibility')[1];
  assert.deepEqual(arr(vis.on), [1, 2, 3]);
  assert.deepEqual(arr(vis.off), [4]);
  assert.equal(ctx.LMState.layers.find(l => l.id === 4).visible, false);
});

test('export begins with every layer id so the whole document is restored afterwards', async () => {
  const { ctx } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a'])], combos: [{ when: {}, layers: [3] }], layers: [L(1, null, 'group'), L(3, 1), L(4, null)] });
  ctx.LMState.docData.destination = 'C:/out';
  const calls = [];
  ctx.LMHost.call = async (fn, arg) => { calls.push([fn, arg]); return fn === 'exportOne' ? { path: arg.path } : { ok: true }; };
  ctx.LMApp.refresh = async () => {};
  await ctx.LMUI.export.run();
  assert.deepEqual(arr(calls.find(c => c[0] === 'exportBegin')[1].layerIds), [1, 3, 4]);
  const job = calls.find(c => c[0] === 'exportOne')[1];
  assert.deepEqual([arr(job.on), arr(job.off)], [[1, 3], [4]]);
});
