'use strict';
// 패널 렌더·동작 스모크 테스트 (test/helpers/panel-vm.js). 호스트 호출은 LMHost.call 을 덮어써서 본다.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPanel } = require('../helpers/panel-vm');

function setupDoc(ctx, { categories, combos, layers }) {
  ctx.LMState.docInfo = { name: 'a.psd', path: 'C:/a.psd', width: 10000, height: 8000 };
  ctx.LMState.docKey = 'C:/a.psd';
  ctx.LMState.docData = Object.assign(ctx.LMApp.newDocData('a'), { categories, combos });
  ctx.LMState.docData.output = ctx.LMCore.output.normalize(undefined);
  ctx.LMState.layers = layers;
  ctx.LMState.tab = 'layers'; // 패널 미리보기는 레이어 탭이 보일 때만 그린다 (#6)
  ctx.LMState.renderedTab = 'layers'; // 이미 레이어 탭을 보고 있는 상태
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

// ---- 패널 미리보기 (independent preview spec §4.2·§4.4) ----

test('layer tab renders without the preview pane when the toggle is off (default)', () => {
  const { ctx, el } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a'])], combos: [], layers: [L(1, null)] });
  const e = el(900);
  ctx.LMUI.layers.render(e);
  assert.doesNotMatch(e.innerHTML, /pv-pane/);
  assert.match(e.innerHTML, /패널 미리보기/);
});

test('layer tab still renders the pane when localStorage throws', () => {
  const { ctx, el } = loadPanel({ storage: 'throw' });
  setupDoc(ctx, { categories: [cat('A', ['a'])], combos: [], layers: [L(1, null)] });
  ctx.LMHost.call = async () => ({ path: 'C:/t/p.png', width: 1, height: 1, ms: 1 });
  ctx.LMPanelPreview.setOn(true);
  const e = el(900);
  ctx.LMUI.layers.render(e);
  assert.match(e.innerHTML, /pv-pane/);
  assert.match(e.innerHTML, /lm-split"/);
});

test('a narrow layer tab still puts the pane on the left (never stacked)', () => {
  const { ctx, el } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a'])], combos: [], layers: [L(1, null)] });
  ctx.LMHost.call = async () => ({ path: 'C:/t/p.png', width: 1, height: 1, ms: 1 });
  ctx.LMPanelPreview.setOn(true);
  for (const w of [580, 400, 320]) {
    const e = el(w, 900);
    ctx.LMUI.layers.render(e);
    assert.match(e.innerHTML, /class="lm-split"/, `${w}px: side by side`);
    assert.doesNotMatch(e.innerHTML, /stack/, `${w}px: not stacked`);
    const basis = Number(/flex:0 0 ([\d.]+)%/.exec(e.innerHTML)[1]);
    assert.ok(basis > 0 && basis < 100, `${w}px: pane width ${basis}%`);
  }
});

test('turning the panel preview on renders once, then serves the same combo from cache', async () => {
  const { ctx } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a0', 'a1'])], combos: [{ when: { A: 'a1' }, layers: [2] }], layers: [L(1, null), L(2, null)] });
  const calls = [];
  ctx.LMHost.call = async (fn, arg) => { calls.push([fn, arg]); return { path: 'C:/t/preview_' + calls.length + '.png', width: 10, height: 10, ms: 1 }; };
  ctx.LMPanelPreview.setOn(true);
  await ctx.LMPanelPreview.request(false);
  ctx.LMState.combo = { A: 'a1' };
  await ctx.LMPanelPreview.request(false);
  ctx.LMState.combo = {};
  await ctx.LMPanelPreview.request(false);
  const renders = calls.filter(c => c[0] === 'renderPreview');
  assert.equal(renders.length, 2);
  assert.deepEqual(arr(renders[1][1].on), [2]);
  assert.deepEqual(arr(renders[1][1].off), [1]);
  assert.equal(renders[0][1].maxSize, 1500, 'default 15% of the 10000px long side');
  assert.match(ctx.LMPanelPreview.paneHtml(), /file:\/\/\/C:\/t\/preview_1\.png/);
});

test('"다시 그리기" (force) re-renders the current combo even when cached', async () => {
  const { ctx } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a'])], combos: [], layers: [L(1, null)] });
  let n = 0;
  ctx.LMHost.call = async () => ({ path: 'C:/t/p' + (++n) + '.png', width: 1, height: 1, ms: 1 });
  ctx.LMPanelPreview.setOn(true);
  await ctx.LMPanelPreview.request(false);
  await ctx.LMPanelPreview.request(true);
  assert.equal(n, 2);
});

test('the panel preview does nothing while off or while exporting', async () => {
  const { ctx } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a'])], combos: [], layers: [L(1, null)] });
  let n = 0;
  ctx.LMHost.call = async () => ({ path: 'C:/t/p' + (++n) + '.png', width: 1, height: 1, ms: 1 });
  await ctx.LMPanelPreview.request(false);
  assert.equal(n, 0);
  ctx.LMPanelPreview.setOn(true);
  ctx.LMState.exporting = true;
  await ctx.LMPanelPreview.request(false);
  assert.equal(n, 0);
});

test('redo-pending error shows the Korean message', async () => {
  const { ctx } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a'])], combos: [], layers: [L(1, null)] });
  ctx.LMHost.call = async () => { throw new Error('renderPreview: LM_REDO_PENDING'); };
  ctx.LMPanelPreview.setOn(true);
  await ctx.LMPanelPreview.request(false);
  assert.match(ctx.LMPanelPreview.paneHtml(), /다시 실행할 단계가 있어/);
});

test('a category without values shows a message instead of rendering', async () => {
  const { ctx } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', [])], combos: [], layers: [L(1, null)] });
  let n = 0;
  ctx.LMHost.call = async () => { n++; return {}; };
  ctx.LMPanelPreview.setOn(true);
  await ctx.LMPanelPreview.request(false);
  assert.equal(n, 0);
  assert.match(ctx.LMPanelPreview.paneHtml(), /값이 없는 카테고리가 있어/);
});

test('refresh with the same layer structure does not re-render; a structure change does', async () => {
  const { ctx } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a'])], combos: [], layers: [L(1, null)] });
  let n = 0;
  ctx.LMHost.call = async () => ({ path: 'C:/t/p' + (++n) + '.png', width: 1, height: 1, ms: 1 });
  ctx.LMPanelPreview.setOn(true);
  await ctx.LMPanelPreview.onRefresh(true);
  await ctx.LMPanelPreview.onRefresh(false);
  assert.equal(n, 1);
  ctx.LMState.layers = [L(1, null), L(2, null)];
  await ctx.LMPanelPreview.onRefresh(false);
  assert.equal(n, 2);
});

test('the toggle and split ratio are remembered in localStorage', () => {
  const first = loadPanel();
  first.ctx.LMPanelPreview.setOn(true);
  first.ctx.LMPanelPreview.setRatio(0.55);
  assert.equal(first.ctx.localStorage.getItem('lm.panelPreview'), '1');
  assert.equal(first.ctx.localStorage.getItem('lm.previewSplit'), '0.55');
  assert.equal(first.ctx.LMPanelPreview.ratio(), 0.55);
});

// ---- 패널 미리보기 화질 ----

// 그리기 호출의 maxSize를 모으고, 호출마다 다른 파일을 돌려준다.
function captureRenders(ctx, ms = 1) {
  const sizes = [];
  ctx.LMHost.call = async (fn, arg) => {
    if (fn === 'renderPreview') sizes.push(arg.maxSize);
    return { path: 'C:/t/p' + sizes.length + '.png', width: 1, height: 1, ms };
  };
  return sizes;
}

test('the preview renders at the picked percent of the original long side', async () => {
  const { ctx } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a'])], combos: [], layers: [L(1, null)] });
  const sizes = captureRenders(ctx);
  ctx.LMPanelPreview.setOn(true);
  ctx.LMPanelPreview.setPercent(25);
  await ctx.LMPanelPreview.request(false);
  assert.deepEqual(sizes, [2500]);
});

test('changing the percent redraws the same combo, and going back to a drawn percent comes from the cache', async () => {
  const { ctx } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a'])], combos: [], layers: [L(1, null)] });
  const sizes = captureRenders(ctx);
  ctx.LMPanelPreview.setOn(true);
  await ctx.LMPanelPreview.request(false);
  ctx.LMPanelPreview.setPercent(5);
  await ctx.LMPanelPreview.request(false);
  assert.match(ctx.LMPanelPreview.paneHtml(), /p2\.png/);
  ctx.LMPanelPreview.setPercent(15);
  await ctx.LMPanelPreview.request(false);
  assert.deepEqual(sizes, [1500, 500]);
  assert.match(ctx.LMPanelPreview.paneHtml(), /p1\.png/);
});

test('the percent is remembered in localStorage, and a stored value that is not a number falls back to 15%', async () => {
  const { ctx } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a'])], combos: [], layers: [L(1, null)] });
  const sizes = captureRenders(ctx);
  ctx.LMPanelPreview.setOn(true);
  ctx.LMPanelPreview.setPercent(25);
  assert.equal(ctx.localStorage.getItem('lm.previewFixedPercent'), '25');
  ctx.localStorage.setItem('lm.previewFixedPercent', 'abc');
  await ctx.LMPanelPreview.request(false);
  assert.deepEqual(sizes, [1500]);
});

test('a percent chosen with the old slider does not carry over: quality starts at the fixed 15%', async () => {
  const { ctx } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a'])], combos: [], layers: [L(1, null)] });
  const sizes = captureRenders(ctx);
  ctx.localStorage.setItem('lm.previewPercent', '60');
  ctx.LMPanelPreview.setOn(true);
  await ctx.LMPanelPreview.request(false);
  assert.deepEqual(sizes, [1500]);
});

test('the percent still applies for the session when localStorage throws', async () => {
  const { ctx } = loadPanel({ storage: 'throw' });
  setupDoc(ctx, { categories: [cat('A', ['a'])], combos: [], layers: [L(1, null)] });
  const sizes = captureRenders(ctx);
  ctx.LMPanelPreview.setOn(true);
  ctx.LMPanelPreview.setPercent(5);
  await ctx.LMPanelPreview.request(false);
  assert.deepEqual(sizes, [500]);
});

test('the layer tab shows the quality number, without a slider, only while the panel preview is on, with the result size', () => {
  const { ctx, el } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a'])], combos: [], layers: [L(1, null)] });
  ctx.LMHost.call = async () => ({ path: 'C:/t/p.png', width: 1, height: 1, ms: 1 });
  const off = el(900);
  ctx.LMUI.layers.render(off);
  assert.doesNotMatch(off.innerHTML, /pv-quality/);
  ctx.LMPanelPreview.setOn(true);
  ctx.LMPanelPreview.setPercent(25);
  const on = el(900);
  ctx.LMUI.layers.render(on);
  assert.match(on.innerHTML, /type="number"[^>]*value="25"/);
  assert.doesNotMatch(on.innerHTML, /type="range"/);
  assert.match(on.innerHTML, /2500×2000px/);
});

// 화질 칸을 흉내 낸다. 리스너는 target.closest로 칸 묶음을 찾고 querySelector로 크기 표시를 고친다.
function qualityBox() {
  const fields = { num: { value: '15' }, px: { textContent: '' } };
  const box = { querySelector: s => (s.includes('num') ? fields.num : fields.px) };
  fields.num.closest = s => (s.includes('pv-quality') ? box : s === '#tab-layers' ? {} : null);
  return fields;
}
async function fireDoc(ctx, type, target) {
  for (const fn of ctx.docListeners[type] || []) fn({ target });
  await new Promise(r => setTimeout(r, 0));
}

test('typing a percent only updates the shown size, and finishing the input renders once', async () => {
  const { ctx } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a'])], combos: [], layers: [L(1, null)] });
  const sizes = captureRenders(ctx);
  ctx.LMPanelPreview.setOn(true);
  const f = qualityBox();
  for (const v of ['2', '20']) {
    f.num.value = v;
    await fireDoc(ctx, 'input', f.num);
  }
  assert.deepEqual(sizes, [], 'no render while typing');
  assert.equal(f.num.value, '20', 'typing is not rewritten mid-way');
  assert.equal(f.px.textContent, '2000×1600px');
  await fireDoc(ctx, 'change', f.num);
  assert.deepEqual(sizes, [2000]);
  assert.equal(ctx.localStorage.getItem('lm.previewFixedPercent'), '20');
});

test('a typed percent is clamped when committed, and a blank one restores the current value without a new render', async () => {
  const { ctx } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a'])], combos: [], layers: [L(1, null)] });
  const sizes = captureRenders(ctx);
  ctx.LMPanelPreview.setOn(true);
  const f = qualityBox();
  f.num.value = '250';
  await fireDoc(ctx, 'input', f.num);
  assert.equal(f.num.value, '250', 'typing is not rewritten mid-way');
  await fireDoc(ctx, 'change', f.num);
  assert.equal(f.num.value, 100);
  assert.deepEqual(sizes, [8192], '100% of 10000px, capped at the save limit');
  f.num.value = '';
  await fireDoc(ctx, 'input', f.num);
  await fireDoc(ctx, 'change', f.num);
  assert.equal(f.num.value, 100);
  assert.deepEqual(sizes, [8192]);
});

test('the pane shows how long the last render took, but no time for a picture from the cache', async () => {
  const { ctx } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a0', 'a1'])], combos: [{ when: { A: 'a1' }, layers: [2] }], layers: [L(1, null), L(2, null)] });
  captureRenders(ctx, 1500);
  ctx.LMPanelPreview.setOn(true);
  await ctx.LMPanelPreview.request(false);
  assert.match(ctx.LMPanelPreview.paneHtml(), /1\.5초/);
  ctx.LMState.combo = { A: 'a1' };
  await ctx.LMPanelPreview.request(false);
  ctx.LMState.combo = {};
  await ctx.LMPanelPreview.request(false);
  assert.doesNotMatch(ctx.LMPanelPreview.paneHtml(), /\d초/);
});

test('with the panel preview off, a combo change and a document refresh never render', async () => {
  const { ctx } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a0', 'a1'])], combos: [], layers: [L(1, null)] });
  const sizes = captureRenders(ctx);
  ctx.LMState.combo = { A: 'a1' };
  await ctx.LMUI.layers.afterComboChange();
  await ctx.LMPanelPreview.onRefresh(true);
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(sizes, []);
});

// ---- 빠른 그리기: 레이어별 그림을 패널에서 합친다 ----

// 호스트 흉내: 레이어 그림 호출을 모으고, 한 번에 batch개까지만 끝낸다. 히스토리 표시는 mark로 바꿀 수 있다.
function fastHost(ctx, { batch = 100 } = {}) {
  const host = { calls: [], units: [], folders: [], mark: { id: 1, index: 5, count: 5, name: 'Brush' } };
  ctx.LMHost.call = async (fn, arg) => {
    if (fn === 'getHistoryMark') return host.mark;
    if (fn === 'getLayers') return ctx.LMState.layers;
    if (fn === 'getDocInfo') return ctx.LMState.docInfo;
    if (fn === 'getOpenDocKeys') return [ctx.LMState.docKey];
    if (fn === 'getSelectedLayerIds') return ctx.LMState.selectedIds;
    if (fn === 'readDocData') return ctx.LMState.docData;
    host.calls.push(fn);
    if (fn !== 'renderLayerPictures') return { path: 'C:/t/exact.png', width: 1, height: 1, ms: 1 };
    const todo = Array.from(arg.units).slice(0, batch);
    host.units.push(todo.map(u => Array.from(u.on)));
    host.folders.push(arg.folder);
    const dir = arg.folder || 'C:/t';
    const done = todo.map(u => ({ key: u.key, path: dir + '/u' + Array.from(u.on).join('_') + '.png' }));
    if (arg.folder) for (const d of done) ctx.cepFiles[d.path] = '';
    return { done, before: host.mark, after: host.mark, ms: 500 };
  };
  return host;
}
const lastDraw = ctx => {
  const log = Array.from(ctx.drawLog);
  const i = log.map(e => e[0]).lastIndexOf('clear');
  return log.slice(i + 1).map(e => [/u([\d_]+)\.png/.exec(e[0])[1], e[1]]);
};
const settle = () => new Promise(r => setTimeout(r, 80));
const fastDoc = (ctx, on) => {
  const M = (id, mode) => Object.assign(L(id, null), { mode, clipped: false });
  setupDoc(ctx, { categories: [cat('A', ['a'])], combos: [{ when: {}, layers: on }], layers: [M(3, 'multiply'), M(2, 'normal'), M(1, 'normal')] });
  ctx.LMPanelPreview.setOn(true);
  ctx.LMPanelPreview.setFast(true);
};

test('fast mode is off by default and then uses the exact render', async () => {
  const { ctx } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a'])], combos: [], layers: [L(1, null)] });
  const host = fastHost(ctx);
  ctx.LMPanelPreview.setOn(true);
  assert.equal(ctx.LMPanelPreview.isFast(), false);
  await ctx.LMPanelPreview.request(false);
  assert.deepEqual(host.calls, ['renderPreview']);
});

test('fast mode extracts only the layers that are on, and composites them bottom first with their blend modes', async () => {
  const { ctx } = loadPanel();
  fastDoc(ctx, [1, 3]);
  const host = fastHost(ctx);
  await ctx.LMPanelPreview.request(false);
  await settle();
  assert.deepEqual(host.calls, ['renderLayerPictures']);
  assert.deepEqual(Array.from(host.units[0], u => Array.from(u)), [[1], [3]]);
  assert.deepEqual(lastDraw(ctx), [['1', 'source-over'], ['3', 'multiply']]);
});

test('fast mode sends every layer id for the hide-all, plus the size from the quality percent', async () => {
  const { ctx } = loadPanel();
  fastDoc(ctx, [1]);
  let arg = null;
  const host = fastHost(ctx);
  const call = ctx.LMHost.call;
  ctx.LMHost.call = (fn, a) => { if (fn === 'renderLayerPictures') arg = a; return call(fn, a); };
  ctx.LMPanelPreview.setPercent(25);
  await ctx.LMPanelPreview.request(false);
  await settle();
  assert.deepEqual(Array.from(arg.all), [3, 2, 1]);
  assert.equal(arg.maxSize, 2500);
  assert.ok(host.calls.length);
});

test('checking one more layer extracts only that layer, and unchecking asks Photoshop for no picture', async () => {
  const { ctx } = loadPanel();
  fastDoc(ctx, [1]);
  const host = fastHost(ctx);
  await ctx.LMPanelPreview.request(false);
  await settle();
  ctx.LMState.docData.combos = [{ when: {}, layers: [1, 2] }];
  await ctx.LMPanelPreview.request(false);
  await settle();
  assert.deepEqual(host.units.map(b => b.map(u => Array.from(u))), [[[1]], [[2]]]);
  assert.deepEqual(lastDraw(ctx), [['1', 'source-over'], ['2', 'source-over']]);
  ctx.LMState.docData.combos = [{ when: {}, layers: [1] }];
  await ctx.LMPanelPreview.request(false);
  await settle();
  assert.equal(host.units.length, 2, 'no new extraction');
  assert.deepEqual(lastDraw(ctx), [['1', 'source-over']]);
});

test('extraction continues over several host calls until every layer is ready, showing progress', async () => {
  const { ctx } = loadPanel();
  fastDoc(ctx, [1, 2, 3]);
  const host = fastHost(ctx, { batch: 1 });
  const seen = [];
  const call = ctx.LMHost.call;
  ctx.LMHost.call = async (fn, a) => { if (fn === 'renderLayerPictures') seen.push(ctx.LMPanelPreview.paneHtml()); return call(fn, a); };
  await ctx.LMPanelPreview.request(false);
  await settle();
  assert.equal(host.calls.length, 3);
  assert.match(seen[0], /0\/3/);
  assert.match(seen[2], /2\/3/);
  assert.deepEqual(lastDraw(ctx).map(e => e[0]), ['1', '2', '3']);
  assert.doesNotMatch(ctx.LMPanelPreview.paneHtml(), /\/3/);
});

test('a host that finishes nothing does not make the panel loop forever', async () => {
  const { ctx } = loadPanel();
  fastDoc(ctx, [1]);
  const host = fastHost(ctx);
  const call = ctx.LMHost.call;
  ctx.LMHost.call = async (fn, a) => { const r = await call(fn, a); return fn === 'renderLayerPictures' ? { done: [], before: r.before, after: r.after, ms: 1 } : r; };
  await ctx.LMPanelPreview.request(false);
  await settle();
  assert.equal(host.calls.length, 1);
});

test('redraw extracts the layers of the current combo again', async () => {
  const { ctx } = loadPanel();
  fastDoc(ctx, [1, 2]);
  const host = fastHost(ctx);
  await ctx.LMPanelPreview.request(false);
  await settle();
  await ctx.LMPanelPreview.request(true);
  await settle();
  assert.deepEqual(host.units.map(b => b.length), [2, 2]);
});

test('after an edit only the selected layer is extracted again', async () => {
  const { ctx } = loadPanel();
  fastDoc(ctx, [1, 2]);
  const host = fastHost(ctx);
  ctx.LMState.selectedIds = [2];
  await ctx.LMPanelPreview.request(false);
  await settle();
  host.mark = { id: 2, index: 6, count: 6, name: 'Brush' };
  await ctx.LMPanelPreview.request(false);
  await settle();
  assert.deepEqual(host.units.map(b => b.map(u => Array.from(u))), [[[1], [2]], [[2]]]);
});

test('a layer edited before the selection moved is extracted again too', async () => {
  const { ctx } = loadPanel();
  fastDoc(ctx, [1, 2]);
  const host = fastHost(ctx);
  ctx.LMState.selectedIds = [2];
  await ctx.LMPanelPreview.request(false);
  await settle();
  host.mark = { id: 2, index: 6, count: 6, name: 'Brush' };
  ctx.LMState.selectedIds = [1];
  await ctx.LMPanelPreview.request(false);
  await settle();
  assert.deepEqual(host.units[1].map(u => Array.from(u)), [[1], [2]]);
});

test('going back in history extracts every layer again, because any layer may have changed', async () => {
  const { ctx } = loadPanel();
  fastDoc(ctx, [1, 2]);
  const host = fastHost(ctx);
  ctx.LMState.selectedIds = [];
  await ctx.LMPanelPreview.request(false);
  await settle();
  host.mark = { id: 9, index: 3, count: 5, name: 'Move' };
  await ctx.LMPanelPreview.request(false);
  await settle();
  assert.deepEqual(host.units[1].map(u => Array.from(u)), [[1], [2]]);
});

test('the history step shift caused by extraction itself does not count as an edit', async () => {
  const { ctx } = loadPanel();
  fastDoc(ctx, [1]);
  const host = fastHost(ctx);
  await ctx.LMPanelPreview.request(false);
  await settle();
  const call = ctx.LMHost.call;
  ctx.LMHost.call = async (fn, a) => {
    const r = await call(fn, a);
    if (fn !== 'renderLayerPictures') return r;
    const after = { id: null, index: 3, count: 3, name: 'Brush' };
    host.mark = after;
    return Object.assign(r, { after });
  };
  host.mark = { id: null, index: 5, count: 5, name: 'Brush' };
  ctx.LMState.docData.combos = [{ when: {}, layers: [1, 2] }];
  await ctx.LMPanelPreview.request(false);
  await settle();
  const extractions = host.units.length;
  await ctx.LMPanelPreview.request(false);
  await settle();
  assert.equal(host.units.length, extractions);
});

test('coming back to the panel picks up an edit once, without asking again on every mouse move', async () => {
  const { ctx } = loadPanel();
  fastDoc(ctx, [1]);
  const host = fastHost(ctx);
  ctx.LMState.selectedIds = [1];
  await ctx.LMPanelPreview.request(false);
  await settle();
  host.mark = { id: 2, index: 6, count: 6, name: 'Brush' };
  await ctx.LMPanelPreview.onHover();
  await settle();
  assert.equal(host.units.length, 2, 'the edited layer is extracted again');
  host.mark = { id: 3, index: 7, count: 7, name: 'Brush' };
  await ctx.LMPanelPreview.onHover();
  await settle();
  assert.equal(host.units.length, 2, 'too soon after the last check');
});

test('when another document became active the panel stops extracting and refreshes', async () => {
  const { ctx } = loadPanel();
  fastDoc(ctx, [1, 2]);
  const host = fastHost(ctx);
  const seen = [];
  const call = ctx.LMHost.call;
  ctx.LMHost.call = async (fn, a) => {
    seen.push(fn);
    if (fn === 'renderLayerPictures') throw new Error('renderLayerPictures: active document changed: panel expected "a" but Photoshop has "b"');
    return call(fn, a);
  };
  await ctx.LMPanelPreview.onRefresh(false);
  await settle();
  assert.equal(seen.filter(f => f === 'renderLayerPictures').length, 1);
  assert.ok(seen.includes('getDocInfo'), 'refreshed');
  assert.doesNotMatch(ctx.LMPanelPreview.paneHtml(), /active document/);
  assert.equal(host.units.length, 0);
});

// ---- 빠른 그리기: 전체 준비 ----

const manyLayers = n => Array.from({ length: n }, (_, i) => Object.assign(L(n - i, null), { mode: 'normal', clipped: false }));

test('prepare-all extracts every layer, and checking any of them afterwards asks Photoshop for no picture', async () => {
  const { ctx } = loadPanel();
  fastDoc(ctx, [1]);
  const host = fastHost(ctx);
  await ctx.LMPanelPreview.prepareAll();
  const all = host.units.flat().map(u => Array.from(u)[0]).sort();
  assert.deepEqual(all, [1, 2, 3]);
  const before = host.units.length;
  ctx.LMState.docData.combos = [{ when: {}, layers: [2, 3] }];
  await ctx.LMPanelPreview.request(false);
  await settle();
  assert.equal(host.units.length, before);
  assert.deepEqual(lastDraw(ctx), [['2', 'source-over'], ['3', 'multiply']]);
});

test('prepare-all also covers the clipping pictures the existing combos need', async () => {
  const { ctx } = loadPanel();
  const C = (id, clipped) => Object.assign(L(id, null), { mode: 'normal', clipped });
  setupDoc(ctx, { categories: [cat('A', ['a'])], combos: [{ when: {}, layers: [1, 2] }], layers: [C(2, true), C(1, false)] });
  ctx.LMPanelPreview.setOn(true);
  ctx.LMPanelPreview.setFast(true);
  const host = fastHost(ctx);
  await ctx.LMPanelPreview.prepareAll();
  assert.ok(host.units.flat().some(u => Array.from(u).join() === '1,2'));
});

test('pressing prepare-all again extracts only what is missing', async () => {
  const { ctx } = loadPanel();
  fastDoc(ctx, [1]);
  const host = fastHost(ctx);
  await ctx.LMPanelPreview.prepareAll();
  const before = host.units.length;
  await ctx.LMPanelPreview.prepareAll();
  assert.equal(host.units.length, before);
});

test('prepare-all holds thousands of pictures without loading them all into memory', async () => {
  const { ctx } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a'])], combos: [{ when: {}, layers: [1] }], layers: manyLayers(600) });
  ctx.LMPanelPreview.setOn(true);
  ctx.LMPanelPreview.setFast(true);
  const host = fastHost(ctx);
  let images = 0;
  const RealImage = ctx.Image;
  ctx.Image = function () { images++; return new RealImage(); };
  await ctx.LMPanelPreview.prepareAll();
  await settle();
  assert.ok(images < 10, `only the shown pictures are loaded, got ${images}`);
  const before = host.units.length;
  ctx.LMState.docData.combos = [{ when: {}, layers: [1, 2, 600] }];
  await ctx.LMPanelPreview.request(false);
  await settle();
  assert.equal(host.units.length, before, 'none of the 600 pictures was forgotten');
});

test('cancelling prepare-all stops after the running batch and keeps what is done', async () => {
  const { ctx } = loadPanel();
  fastDoc(ctx, [1]);
  const host = fastHost(ctx, { batch: 1 });
  const done = ctx.LMPanelPreview.prepareAll();
  assert.equal(ctx.LMPanelPreview.isPreparing(), true);
  await new Promise(r => setTimeout(r, 0));
  ctx.LMPanelPreview.cancelPrepare();
  assert.equal(ctx.LMPanelPreview.isPreparing(), false);
  await done;
  await settle();
  assert.equal(host.units.length, 1);
  await ctx.LMPanelPreview.prepareAll();
  assert.equal(host.units.length, 3, 'the next run extracts only the other two');
});

test('pressing prepare-all right after an edit extracts only the edited layer, even when no mouse move noticed it', async () => {
  const { ctx } = loadPanel();
  fastDoc(ctx, [1]);
  const host = fastHost(ctx);
  ctx.LMState.selectedIds = [2];
  await ctx.LMPanelPreview.prepareAll();
  const before = host.units.length;
  host.mark = { id: 2, index: 6, count: 6, name: 'Brush' };
  await ctx.LMPanelPreview.prepareAll();
  assert.deepEqual(host.units.slice(before).map(b => b.map(u => Array.from(u))), [[[2]]]);
});

test('an edited layer that is off now is extracted again only when it is checked', async () => {
  const { ctx } = loadPanel();
  fastDoc(ctx, [1]);
  const host = fastHost(ctx);
  ctx.LMState.selectedIds = [2];
  await ctx.LMPanelPreview.prepareAll();
  const before = host.units.length;
  host.mark = { id: 2, index: 6, count: 6, name: 'Brush' };
  await ctx.LMPanelPreview.request(false);
  await settle();
  assert.equal(host.units.length, before, 'layer 2 is off, so nothing to draw yet');
  ctx.LMState.docData.combos = [{ when: {}, layers: [1, 2] }];
  await ctx.LMPanelPreview.request(false);
  await settle();
  assert.deepEqual(host.units.slice(before).map(b => b.map(u => Array.from(u))), [[[2]]]);
});

test('a failure stops prepare-all with a message on the status line', async () => {
  const { ctx } = loadPanel();
  fastDoc(ctx, [1]);
  const host = fastHost(ctx);
  const seen = [];
  const call = ctx.LMHost.call;
  ctx.LMHost.call = async (fn, a) => {
    if (fn === 'renderLayerPictures') { seen.push(fn); throw new Error('renderLayerPictures: LM_REDO_PENDING'); }
    return call(fn, a);
  };
  const status = [];
  ctx.LMApp.status = m => status.push(m);
  await ctx.LMPanelPreview.prepareAll();
  assert.equal(seen.length, 1);
  assert.equal(ctx.LMPanelPreview.isPreparing(), false);
  assert.ok(status.some(m => /다시 실행할 단계/.test(m)), status.join('|'));
  assert.equal(host.units.length, 0);
});

test('prepare-all stops when another document becomes active', async () => {
  const { ctx } = loadPanel();
  fastDoc(ctx, [1]);
  fastHost(ctx, { batch: 1 });
  const done = ctx.LMPanelPreview.prepareAll();
  await new Promise(r => setTimeout(r, 0));
  await ctx.LMPanelPreview.onRefresh(true);
  await done;
  assert.equal(ctx.LMPanelPreview.isPreparing(), false);
});

test('the layer tab shows the prepare button with fast mode, and cancel while it runs', async () => {
  const { ctx, el } = loadPanel();
  fastDoc(ctx, [1]);
  fastHost(ctx, { batch: 1 });
  const idle = el(900);
  ctx.LMUI.layers.render(idle);
  assert.match(idle.innerHTML, /class="primary pv-prepare" data-action="pv-prepare-all"[^>]*>레이어 준비</);
  const done = ctx.LMPanelPreview.prepareAll();
  const running = el(900);
  ctx.LMUI.layers.render(running);
  assert.match(running.innerHTML, /data-action="pv-prepare-cancel"/);
  assert.doesNotMatch(running.innerHTML, /data-action="pv-prepare-all"/);
  ctx.LMPanelPreview.cancelPrepare();
  await done;
  ctx.LMPanelPreview.setFast(false);
  const exact = el(900);
  ctx.LMUI.layers.render(exact);
  assert.doesNotMatch(exact.innerHTML, /pv-prepare/);
});

test('going to another document and back keeps the pictures of the first one', async () => {
  const { ctx } = loadPanel();
  fastDoc(ctx, [1]);
  const host = fastHost(ctx);
  await ctx.LMPanelPreview.request(false);
  await settle();
  ctx.LMState.docKey = 'C:/b.psd';
  ctx.LMState.docInfo = { name: 'b.psd', path: 'C:/b.psd', width: 10000, height: 8000 };
  await ctx.LMPanelPreview.onRefresh(true);
  await settle();
  assert.equal(host.units.length, 2, 'layer ids repeat across documents, so the other document extracts its own');
  ctx.LMState.docKey = 'C:/a.psd';
  ctx.LMState.docInfo = { name: 'a.psd', path: 'C:/a.psd', width: 10000, height: 8000 };
  await ctx.LMPanelPreview.onRefresh(true);
  await settle();
  assert.equal(host.units.length, 2, 'back on the first document nothing is extracted again');
});

// ---- 빠른 그리기: 디스크 보관 ----

const clean = (id, stamp) => ({ id, index: id, count: id, name: 'Brush', saved: true, stamp });
const unsaved = (id, stamp) => ({ id, index: id, count: id, name: 'Brush', saved: false, stamp });

async function preparedPanel(files, mark) {
  const { ctx } = loadPanel({ files });
  fastDoc(ctx, [1]);
  const host = fastHost(ctx);
  host.mark = mark;
  await ctx.LMPanelPreview.prepareAll();
  await settle();
  return { ctx, host };
}

async function reopened(files, mark) {
  const { ctx } = loadPanel({ files });
  fastDoc(ctx, [1]);
  const host = fastHost(ctx);
  host.mark = mark;
  await ctx.LMPanelPreview.request(false);
  await settle();
  return { ctx, host };
}

test('pictures are saved under the user data folder for a document with a file', async () => {
  const files = {};
  const { host } = await preparedPanel(files, clean(1, 'S'));
  assert.ok(host.folders.every(f => /\/LayerMemorier\/preview-cache\/[0-9a-z]+$/.test(f)), host.folders.join());
  assert.ok(Object.keys(files).some(f => f.endsWith('/index.json')));
});

test('reopening an unchanged file uses the saved pictures, with no extraction at all', async () => {
  const files = {};
  await preparedPanel(files, clean(1, 'S'));
  const { ctx, host } = await reopened(files, clean(1, 'S'));
  assert.equal(host.calls.length, 0);
  assert.deepEqual(lastDraw(ctx), [['1', 'source-over']]);
  ctx.LMState.docData.combos = [{ when: {}, layers: [1, 2, 3] }];
  await ctx.LMPanelPreview.request(false);
  await settle();
  assert.equal(host.calls.length, 0, 'every prepared layer is there');
});

test('a file changed while closed shows the old pictures at once, then extracts the shown layers again', async () => {
  const files = {};
  await preparedPanel(files, clean(1, 'S'));
  const { ctx, host } = await reopened(files, clean(1, 'S2'));
  assert.deepEqual(host.units.map(b => b.map(u => Array.from(u))), [[[1]]], 'only the layer on screen, not everything');
  assert.deepEqual(lastDraw(ctx).map(e => e[0]), ['1']);
});

test('closing without saving an edit does not trust the saved pictures on the next open', async () => {
  const files = {};
  const first = await preparedPanel(files, clean(1, 'S'));
  first.host.mark = unsaved(2, 'S');
  await first.ctx.LMPanelPreview.request(false);
  await settle();
  const { host } = await reopened(files, clean(1, 'S'));
  assert.equal(host.units.length, 1);
});

test('saving a check-only change keeps the pictures valid for the next open', async () => {
  const files = {};
  const first = await preparedPanel(files, clean(1, 'S'));
  first.host.mark = clean(1, 'S2'); // 같은 히스토리, 저장해서 파일만 달라졌다
  await first.ctx.LMPanelPreview.onSaved();
  const { host } = await reopened(files, clean(1, 'S2'));
  assert.equal(host.calls.length, 0);
});

test('saving after an edit keeps every picture but the edited layer', async () => {
  const files = {};
  const first = await preparedPanel(files, clean(1, 'S'));
  first.ctx.LMState.selectedIds = [1];
  await first.ctx.LMPanelPreview.request(false);
  await settle();
  first.ctx.LMState.selectedIds = [2];
  first.host.mark = clean(2, 'S2');
  await first.ctx.LMPanelPreview.onSaved();
  await settle();
  const { ctx, host } = await reopened(files, clean(1, 'S2'));
  assert.equal(host.calls.length, 0, 'layer 1 on screen was not the edited one');
  ctx.LMState.docData.combos = [{ when: {}, layers: [1, 2, 3] }];
  await ctx.LMPanelPreview.request(false);
  await settle();
  const again = host.units.flat().map(u => Array.from(u)[0]).sort();
  assert.ok(again.includes(2), `edited layer extracted again, got ${again}`);
  assert.ok(!again.includes(3), `untouched layer kept, got ${again}`);
});

test('reopening the panel over the same unsaved state keeps the pictures', async () => {
  const files = {};
  const first = await preparedPanel(files, clean(1, 'S'));
  first.host.mark = unsaved(2, 'S');
  await first.ctx.LMPanelPreview.request(false);
  await settle();
  const { host } = await reopened(files, unsaved(2, 'S'));
  assert.equal(host.calls.length, 0);
});

test('files the index no longer uses are deleted, and a saved picture whose file is gone is extracted again', async () => {
  const files = {};
  const { host } = await preparedPanel(files, clean(1, 'S'));
  const dir = host.folders[0];
  files[dir + '/preview_layer_old.png'] = '';
  delete files[dir + '/u1.png'];
  const second = await reopened(files, clean(1, 'S'));
  await settle();
  assert.ok(!(dir + '/preview_layer_old.png' in files), 'unused file swept');
  assert.ok(dir + '/index.json' in files, 'index kept');
  assert.ok(dir + '/u2.png' in files, 'used picture kept');
  assert.deepEqual(second.host.units.map(b => b.map(u => Array.from(u))), [[[1]]]);
});

test('pictures of another quality are not reused, and a broken index counts as no index', async () => {
  const files = {};
  const { host } = await preparedPanel(files, clean(1, 'S'));
  const dir = host.folders[0];
  const { ctx } = loadPanel({ files });
  fastDoc(ctx, [1]);
  ctx.LMPanelPreview.setPercent(30);
  const h2 = fastHost(ctx);
  h2.mark = clean(1, 'S');
  await ctx.LMPanelPreview.request(false);
  await settle();
  assert.equal(h2.units.length, 1);
  files[dir + '/index.json'] = '{ not json';
  const third = await reopened(files, clean(1, 'S'));
  assert.equal(third.host.units.length, 1);
});

test('a document that was never saved extracts to the temp folder and writes no index', async () => {
  const files = {};
  const { ctx } = loadPanel({ files });
  fastDoc(ctx, [1]);
  ctx.LMState.docInfo = { name: 'new', path: null, width: 10000, height: 8000 };
  ctx.LMState.docKey = 'new';
  const host = fastHost(ctx);
  host.mark = unsaved(1, null);
  await ctx.LMPanelPreview.prepareAll();
  await settle();
  assert.ok(host.calls.length > 0);
  assert.deepEqual(host.folders.filter(Boolean), []);
  assert.deepEqual(Object.keys(files).filter(f => f.endsWith('index.json')), []);
});

test('a document that closed is forgotten, so opening it again goes back to the saved pictures', async () => {
  const files = {};
  const first = await preparedPanel(files, clean(1, 'S'));
  first.ctx.LMPanelPreview.prune([]);
  first.host.mark = clean(1, 'S2');
  const before = first.host.units.length;
  await first.ctx.LMPanelPreview.request(false);
  await settle();
  assert.equal(first.host.units.length, before + 1, 'file changed, shown layer extracted again');
});

test('the layer tab offers the fast switch only while the panel preview is on', () => {
  const { ctx, el } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a'])], combos: [], layers: [L(1, null)] });
  fastHost(ctx);
  const off = el(900);
  ctx.LMUI.layers.render(off);
  assert.doesNotMatch(off.innerHTML, /panel-preview-fast/);
  ctx.LMPanelPreview.setOn(true);
  const on = el(900);
  ctx.LMUI.layers.render(on);
  assert.match(on.innerHTML, /panel-preview-fast/);
});

test('a queued render for a combo the user already left is skipped (only the shown one renders)', async () => {
  const { ctx } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a', 'b', 'c'])], combos: [{ when: { A: 'b' }, layers: [2] }, { when: { A: 'c' }, layers: [3] }], layers: [L(1, null), L(2, null), L(3, null)] });
  ctx.LMPanelPreview.setOn(true);
  // c 를 먼저 그려 캐시에 넣는다.
  ctx.LMHost.call = async () => ({ path: 'C:/t/c.png', width: 1, height: 1, ms: 1 });
  ctx.LMState.combo = { A: 'c' };
  await ctx.LMPanelPreview.request(false);

  const rendered = [];
  let release;
  ctx.LMHost.call = async (fn, arg) => {
    rendered.push(arr(arg.on).join(','));
    if (rendered.length === 1) await new Promise(r => { release = r; });
    return { path: 'C:/t/p' + rendered.length + '.png', width: 1, height: 1, ms: 1 };
  };
  ctx.LMState.combo = { A: 'a' };
  const done = ctx.LMPanelPreview.request(false); // a: 그리는 중
  ctx.LMState.combo = { A: 'b' };
  ctx.LMPanelPreview.request(false);              // b: 대기
  ctx.LMState.combo = { A: 'c' };
  ctx.LMPanelPreview.request(false);              // c: 캐시 → 바로 표시, b는 더 볼 일 없음
  release();
  await done;
  assert.deepEqual(rendered, ['']);
  assert.match(ctx.LMPanelPreview.paneHtml(), /C:\/t\/c\.png/);
  assert.doesNotMatch(ctx.LMPanelPreview.paneHtml(), /그리는 중/);
});

test('while a render runs, host document events are ignored (and for a short while after)', async () => {
  const { ctx } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a'])], combos: [], layers: [L(1, null)] });
  let during = null;
  ctx.LMHost.call = async () => { during = ctx.LMApp.ignoreHostEvents(); return { path: 'C:/t/p.png', width: 1, height: 1, ms: 1 }; };
  ctx.LMPanelPreview.setOn(true);
  assert.equal(ctx.LMApp.ignoreHostEvents(), false);
  await ctx.LMPanelPreview.request(false);
  assert.equal(during, true);
  assert.equal(ctx.LMApp.ignoreHostEvents(), true, 'events from closing the duplicate arrive after the call returns');
  ctx.LMState.previewQuietUntil = Date.now() - 1;
  assert.equal(ctx.LMApp.ignoreHostEvents(), false);
});

// ---- 이슈 #2 · #3 · #6 ----

test('#2 with both previews on, the canvas is updated before the panel picture is rendered', async () => {
  const { ctx } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a'])], combos: [{ when: {}, layers: [1] }], layers: [L(1, null), L(2, null)] });
  const order = [];
  ctx.LMHost.call = async fn => { order.push(fn); return fn === 'renderPreview' ? { path: 'C:/t/p.png', width: 1, height: 1, ms: 1 } : { ok: true }; };
  ctx.LMState.previews['C:/a.psd'] = { snapshot: {}, touched: [], combo: {} };
  ctx.LMPanelPreview.setOn(true);
  await ctx.LMUI.layers.afterComboChange();
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(order, ['applyVisibility', 'renderPreview']);
});

test('#3 a render that finishes after a document switch is not cached for the new document', async () => {
  const { ctx } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a'])], combos: [], layers: [L(1, null)] });
  let release;
  let n = 0;
  ctx.LMHost.call = async () => {
    n++;
    if (n === 1) await new Promise(r => { release = r; });
    return { path: 'C:/t/p' + n + '.png', width: 1, height: 1, ms: 1 };
  };
  ctx.LMPanelPreview.setOn(true);
  const first = ctx.LMPanelPreview.request(false);   // 문서 a 를 그리는 중
  ctx.LMState.docInfo = { name: 'b.psd', path: 'C:/b.psd' };
  ctx.LMState.docKey = 'C:/b.psd';                   // 같은 레이어 id 구조의 다른 문서
  ctx.LMPanelPreview.onRefresh(true);
  release();
  await first;
  assert.doesNotMatch(ctx.LMPanelPreview.paneHtml(), /p1\.png/, 'old document picture is not shown');
  await ctx.LMPanelPreview.request(false);
  assert.equal(n, 2, 'the new document is rendered, not served from the old cache');
});

test('#6 nothing is rendered while another tab is shown; switching to the layer tab catches up', async () => {
  const { ctx } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a'])], combos: [], layers: [L(1, null)] });
  let n = 0;
  ctx.LMHost.call = async fn => { if (fn === 'renderPreview') n++; return { path: 'C:/t/p' + n + '.png', width: 1, height: 1, ms: 1 }; };
  ctx.LMPanelPreview.setOn(true);
  ctx.LMState.tab = 'export';
  ctx.LMState.renderedTab = 'export';
  await ctx.LMPanelPreview.onRefresh(true);
  ctx.LMState.layers = [L(1, null), L(2, null)];
  await ctx.LMPanelPreview.onRefresh(false);
  assert.equal(n, 0);
  ctx.LMState.tab = 'layers';
  ctx.LMApp.render();
  await new Promise(r => setTimeout(r, 0));
  assert.equal(n, 1);
});

// ---- "전체" 없는 레이어 탭 ----

test('the combo picker has no "전체" and always holds a concrete value per category', () => {
  const { ctx, el } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a0', 'a1']), cat('B', ['b0', 'b1'])], combos: [], layers: [L(1, null)] });
  ctx.LMState.combo = { B: 'b1' };
  const e = el(900);
  ctx.LMUI.layers.render(e);
  assert.doesNotMatch(e.innerHTML, /전체/);
  assert.deepEqual(Object.assign({}, ctx.LMState.combo), { A: 'a0', B: 'b1' });
  assert.doesNotMatch(e.innerHTML, /made-select/, '"만든 조합" list is gone');
});

test('a layer on through a broader entry shows as a plain checked box in this combo', () => {
  const { ctx, el } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a0', 'a1'])], combos: [{ when: {}, layers: [1] }, { when: { A: 'a1' }, layers: [2] }], layers: [L(1, null), L(2, null)] });
  ctx.LMState.combo = { A: 'a0' };
  const e = el(900);
  ctx.LMUI.layers.render(e);
  assert.match(e.innerHTML, /data-layer="1"[^]*?class="cb checked"/);
  assert.match(e.innerHTML, /data-layer="2"[^]*?class="cb none"/);
  assert.doesNotMatch(e.innerHTML, /inherited/);
});

test('unchecking an "all combos" layer turns it off only in the current combo (and the preview agrees)', () => {
  const { ctx } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a0', 'a1']), cat('B', ['b0', 'b1'])], combos: [{ when: {}, layers: [1] }], layers: [L(1, null)] });
  ctx.LMState.combo = { A: 'a0', B: 'b1' };
  ctx.LMUI.layers.setInCurrent([1], false);
  const on = v => ctx.LMCore.combos.onLayerIds(ctx.LMState.docData.combos, v).includes(1);
  assert.equal(on({ A: 'a0', B: 'b1' }), false);
  assert.equal(on({ A: 'a0', B: 'b0' }), true);
  assert.equal(on({ A: 'a1', B: 'b1' }), true);
  assert.deepEqual(Object.assign({}, ctx.LMCore.combos.previewVariation(ctx.LMState.combo, ctx.LMState.docData.categories)), { A: 'a0', B: 'b1' });
  ctx.LMUI.layers.setInCurrent([1], true);
  assert.equal(on({ A: 'a0', B: 'b1' }), true);
});

test('selecting rows no longer shows bulk "all combos" buttons', () => {
  const { ctx, el } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a0', 'a1'])], combos: [{ when: {}, layers: [1] }], layers: [L(1, null), L(2, null)] });
  ctx.LMState.selectedIds = [1, 2];
  const e = el(900);
  ctx.LMUI.layers.render(e);
  assert.doesNotMatch(e.innerHTML, /add-selected-all|remove-selected|모든 조합에 넣기|모든 조합에서 빼기/);
});

test('a category without values: no checkboxes, a hint instead', () => {
  const { ctx, el } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a0']), cat('E', [])], combos: [], layers: [L(1, null)] });
  const e = el(900);
  ctx.LMUI.layers.render(e);
  assert.doesNotMatch(e.innerHTML, /class="cb /);
  assert.match(e.innerHTML, /값이 없는 카테고리/);
});

// ---- 조합 복사 · 붙여넣기 ----

function copyPasteDoc(ctx) {
  setupDoc(ctx, {
    categories: [cat('A', ['a0', 'a1']), cat('B', ['b0', 'b1'])],
    combos: [{ when: {}, layers: [1] }, { when: { A: 'a0', B: 'b0' }, layers: [2] }, { when: { A: 'a1', B: 'b1' }, layers: [3] }],
    layers: [L(1, null), L(2, null), L(3, null)],
  });
}
const onIn = (ctx, v) => arr(ctx.LMCore.combos.onLayerIds(ctx.LMState.docData.combos, v));

test('paste is disabled until a combo is copied', () => {
  const { ctx, el } = loadPanel();
  copyPasteDoc(ctx);
  const e = el(900);
  ctx.LMUI.layers.render(e);
  assert.match(e.innerHTML, /data-action="combo-copy"/);
  assert.match(e.innerHTML, /data-action="combo-paste" disabled/);
  assert.equal(ctx.LMUI.layers.pasteCombo(), false);
});

test('copy a combo, switch, paste: the target combo becomes exactly the copied one, others untouched', () => {
  const { ctx, el } = loadPanel();
  copyPasteDoc(ctx);
  ctx.LMState.combo = { A: 'a0', B: 'b0' };
  assert.equal(ctx.LMUI.layers.copyCombo(), true);
  ctx.LMState.combo = { A: 'a1', B: 'b1' };
  const e = el(900);
  ctx.LMUI.layers.render(e);
  assert.match(e.innerHTML, /복사한 조합: Aa0_Bb0 · 레이어 2개/);
  assert.doesNotMatch(e.innerHTML, /data-action="combo-paste" disabled/);
  const plan = ctx.LMUI.layers.pastePlan();
  assert.deepEqual([arr(plan.on), arr(plan.off)], [[2], [3]], 'turns on 2, turns off 3');
  assert.equal(ctx.LMUI.layers.pasteCombo(), true);
  assert.deepEqual(onIn(ctx, { A: 'a1', B: 'b1' }), [1, 2]);
  assert.deepEqual(onIn(ctx, { A: 'a0', B: 'b0' }), [1, 2]);
  assert.deepEqual(onIn(ctx, { A: 'a0', B: 'b1' }), [1]);
  assert.deepEqual(onIn(ctx, { A: 'a1', B: 'b0' }), [1]);
});

test('the copied combo is dropped when another document is opened', async () => {
  const { ctx } = loadPanel();
  copyPasteDoc(ctx);
  ctx.LMUI.layers.copyCombo();
  ctx.LMHost.call = async fn => ({
    getDocInfo: { name: 'b.psd', path: 'C:/b.psd' }, getOpenDocKeys: ['C:/b.psd'], getLayers: [L(1, null)], getSelectedLayerIds: [], readDocData: null,
  }[fn]);
  await ctx.LMApp.refresh();
  assert.equal(ctx.LMState.comboClipboard, null);
  assert.equal(ctx.LMUI.layers.pasteCombo(), false);
});

// ---- 카테고리 탭: Tab으로 값 이름 → 파일명 글자 → 다음 줄 … ----

test('category tab: only text fields are in the Tab order (×, ▲, ▼ are skipped)', () => {
  const { ctx, el } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a0', 'a1'])], combos: [], layers: [L(1, null)] });
  const e = el(900);
  ctx.LMUI.categories.render(e);
  for (const action of ['value-delete', 'cat-up', 'cat-down', 'cat-delete']) {
    const tags = e.innerHTML.match(new RegExp(`<button[^>]*data-action="${action}"[^>]*>`, 'g'));
    assert.ok(tags && tags.every(t => /tabindex="-1"/.test(t)), action);
  }
  assert.doesNotMatch(e.innerHTML, /class="v-(name|label)"[^>]*tabindex/);
});

test('category tab: a field is found again after re-render by category, value and kind', () => {
  const { ctx } = loadPanel();
  assert.equal(ctx.LMUI.categories.fieldSelector('c_1', 'v_2', 'v-label'), '[data-category="c_1"] [data-value="v_2"] .v-label');
  assert.equal(ctx.LMUI.categories.fieldSelector('c_1', null, 'c-name'), '[data-category="c_1"] .c-name');
});

// ---- 레이어 탭 초기화 (모든 조합의 켜짐·꺼짐 정보만) ----

test('layer tab has a reset button, disabled when there is nothing to reset', () => {
  const { ctx, el } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a0'])], combos: [], layers: [L(1, null)] });
  let e = el(900);
  ctx.LMUI.layers.render(e);
  assert.match(e.innerHTML, /<button[^>]*data-action="combos-reset"[^>]*disabled/);
  ctx.LMState.docData.combos = [{ when: {}, layers: [1] }];
  e = el(900);
  ctx.LMUI.layers.render(e);
  assert.doesNotMatch(e.innerHTML, /<button[^>]*data-action="combos-reset"[^>]*disabled/);
});

test('reset asks first; cancel keeps everything, confirm clears only the layer on/off data', async () => {
  const { ctx } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a0', 'a1'])], combos: [{ when: {}, layers: [1] }, { when: { A: 'a1' }, layers: [2] }], layers: [L(1, null), L(2, null)] });
  ctx.LMState.docData.excluded = [{ A: 'a1' }];
  const asked = [];
  let saved = 0;
  ctx.LMApp.saveDocData = async () => { saved++; };
  ctx.LMHost.call = async () => ({ ok: true });
  ctx.confirm = msg => { asked.push(msg); return false; };
  await ctx.LMUI.layers.resetCombos();
  assert.equal(ctx.LMState.docData.combos.length, 2, 'cancel keeps the combos');
  assert.equal(saved, 0);
  assert.match(asked[0], /레이어 켜짐·꺼짐/);
  assert.match(asked[0], /되돌릴 수 없습니다/);

  ctx.confirm = () => true;
  await ctx.LMUI.layers.resetCombos();
  assert.equal(ctx.LMState.docData.combos.length, 0);
  assert.equal(saved, 1);
  assert.equal(ctx.LMState.docData.categories.length, 1, 'categories stay');
  assert.equal(ctx.LMState.docData.excluded.length, 1, 'export settings stay');
});

test('paste applies right away without a confirm dialog and reports what changed', async () => {
  const { ctx } = loadPanel();
  copyPasteDoc(ctx);
  ctx.LMApp.saveDocData = async () => {};
  ctx.LMHost.call = async () => ({ ok: true });
  ctx.confirm = () => { throw new Error('no confirm on paste'); };
  ctx.LMState.combo = { A: 'a0', B: 'b0' };
  ctx.LMUI.layers.copyCombo();
  ctx.LMState.combo = { A: 'a1', B: 'b1' };
  const statuses = [];
  ctx.LMApp.status = m => statuses.push(m);
  await ctx.LMUI.layers.pasteFromClipboard();
  assert.deepEqual(onIn(ctx, { A: 'a1', B: 'b1' }), [1, 2]);
  assert.match(statuses.join('\n'), /Aa1_Bb1에 붙여넣었습니다 \(켜짐 1개, 꺼짐 1개\)/);
});
