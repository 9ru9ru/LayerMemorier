// 포토샵 미리보기 (combos spec §6.3). 문서별 스냅샷을 LMState.previews[docKey]에 둔다.
const LMPreview = (() => {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function current() {
    return LMState.docKey != null ? LMState.previews[LMState.docKey] || null : null;
  }

  function isOn() { return !!current(); }

  function variation() {
    return LMCore.combos.previewVariation(LMState.combo, LMState.docData.categories);
  }

  function label() {
    const v = variation();
    if (!v) return '값이 없는 카테고리가 있어 미리보기를 할 수 없습니다';
    return `${LMCore.combos.comboName(v, LMState.docData.categories)}로 표시 중 · 끄면 원래대로 돌아갑니다`;
  }

  // 가시성을 바꾸면 포토샵이 Shw/Hd 이벤트를 돌려보낸다. 패널 자신의 메아리이므로 무시한다.
  async function setVisibility(on, off) {
    LMApp.muteEcho();
    try { await LMHost.call('applyVisibility', { on, off }); } finally { LMApp.muteEcho(); }
  }

  async function reloadLayers() {
    LMState.layers = await LMHost.call('getLayers');
    LMApp.muteEcho();
  }

  // 지금 고른 조합을 포토샵에 반영한다. 꺼져 있거나 내보내는 중이면 아무것도 안 한다.
  async function apply() {
    const p = current();
    if (!p || LMState.exporting) return;
    const v = variation();
    if (!v) return;
    const combos = LMState.docData.combos;
    const managed = LMCore.combos.managedLayerIds(combos, LMState.layers);
    const onSet = new Set(LMCore.combos.onLayerIds(combos, v));
    for (const id of managed) if (p.touched.indexOf(id) === -1) p.touched.push(id);
    // 다른 문서에 갔다 오면 조합 선택이 비워진다. 캔버스와 맞게 되돌릴 수 있도록 기억한다 (state.js refresh).
    p.combo = Object.assign({}, LMState.combo);
    await setVisibility(managed.filter(id => onSet.has(id)), managed.filter(id => !onSet.has(id)));
    await reloadLayers();
  }

  async function enable() {
    if (!LMState.docKey || current()) return;
    const layers = await LMHost.call('getLayers');
    const snapshot = {};
    for (const l of layers) snapshot[l.id] = l.visible;
    LMState.previews[LMState.docKey] = { snapshot, touched: [], combo: {} };
    await apply();
  }

  // 건드린 레이어만 켜기 전 상태로 되돌린다. 그 사이 지워진 레이어는 건너뛴다.
  async function disable() {
    const p = current();
    if (!p) return;
    delete LMState.previews[LMState.docKey];
    const existing = new Set((await LMHost.call('getLayers')).map(l => l.id));
    const on = [], off = [];
    for (const id of p.touched) {
      if (!existing.has(id) || !(id in p.snapshot)) continue;
      (p.snapshot[id] ? on : off).push(id);
    }
    await setVisibility(on, off);
    await reloadLayers();
  }

  // 닫힌 문서의 스냅샷을 버린다.
  function prune(openKeys) {
    for (const key of Object.keys(LMState.previews)) if (openKeys.indexOf(key) === -1) delete LMState.previews[key];
  }

  function toggleHtml() {
    const on = isOn();
    return `<label class="preview-toggle"><input type="checkbox" class="preview-switch" ${on ? 'checked' : ''}> 포토샵 미리보기</label>` +
      (on ? `<span class="preview-label hint">${esc(label())}</span>` : '');
  }

  return { isOn, enable, disable, apply, prune, toggleHtml };
})();
