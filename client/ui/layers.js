// 레이어 탭 (combos spec §6.2): 고정 조합 선택 영역 + 따로 스크롤되는 트리.
LMUI.layers = (() => {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const C = () => LMCore.combos;

  function visibleRows() {
    const rows = [];
    const hiddenUnder = new Set();
    for (const l of LMState.layers) {
      if (l.parentId != null && hiddenUnder.has(l.parentId)) { if (l.kind === 'group') hiddenUnder.add(l.id); continue; }
      rows.push(l);
      if (l.kind === 'group' && LMState.collapsed.has(l.id)) hiddenUnder.add(l.id);
    }
    return rows;
  }

  function selectedExisting() {
    return LMState.selectedIds.filter(id => LMState.layers.some(l => l.id === id));
  }

  // ---- 고정 영역 ----

  // 카테고리마다 구체적인 값 하나 ("전체" 없음). 체크박스·미리보기·내보내기가 모두 이 한 조합을 본다.
  function pickerBar(cats) {
    const selects = cats.map(c => {
      const cur = LMState.combo[c.id];
      const opts = c.values.length
        ? c.values.map(v => `<option value="${esc(v.id)}" ${cur === v.id ? 'selected' : ''}>${esc(v.name)}</option>`).join('')
        : '<option>(값 없음)</option>';
      return `<label class="pick"><span class="dot" style="background:${LMColors.hex(c.color)}"></span>${esc(c.name)} <select data-combo-cat="${esc(c.id)}" ${c.values.length ? '' : 'disabled'}>${opts}</select></label>`;
    }).join('');
    return `<div class="row picker"><b>조합</b>${selects}</div>`;
  }

  function toggleBar() {
    const panel = `<label class="preview-toggle" title="레이어 탭 왼쪽에 지금 조합을 그립니다 (큰 문서는 한 번에 몇 초 걸릴 수 있음)"><input type="checkbox" class="panel-preview-switch" ${LMPanelPreview.isOn() ? 'checked' : ''}> 패널 미리보기</label>`;
    const reset = `<button class="danger reset" data-action="combos-reset" ${LMState.docData.combos.length ? '' : 'disabled'} title="모든 조합의 레이어 켜짐·꺼짐 정보를 지웁니다 (카테고리·내보내기 설정은 그대로)">초기화</button>`;
    return `<div class="row made">${panel}${LMPreview.toggleHtml()}${reset}</div>`;
  }

  // 조합 복사·붙여넣기: 한 조합에서 켜진 레이어를 다른 조합에 그대로 (붙여넣으면 대상이 똑같아진다).
  function clipboard() {
    const clip = LMState.comboClipboard;
    return clip && clip.docKey === LMState.docKey ? clip : null;
  }

  function clipBar() {
    const clip = clipboard();
    const info = clip ? `<span class="hint">복사한 조합: ${esc(clip.label)} · 레이어 ${clip.ids.length}개</span>` : '';
    return `<div class="row clip"><button data-action="combo-copy" title="지금 조합에서 켜진 레이어를 기억합니다">조합 복사</button>` +
      `<button data-action="combo-paste" ${clip ? '' : 'disabled'} title="복사한 조합과 똑같이 맞춥니다 (다른 조합은 그대로)">조합 붙여넣기</button>${info}</div>`;
  }

  function noticeBar() {
    const orphans = C().orphanLayerIds(LMState.docData.combos, LMState.layers);
    const orphan = orphans.length
      ? `<span class="warn orphans">문서에 없는 레이어 ${orphans.length}개가 조합에 남아 있습니다 <button data-action="orphans-clean">정리</button></span>`
      : '';
    return `<div class="row notice">${orphan}<span class="hint">PSD를 저장해야 조합이 파일에 남습니다.</span></div>`;
  }

  // ---- 트리 ----

  // 체크 = 지금 고른 조합에서 켜짐 (어느 항목 때문에 켜졌든). onSet이 null이면 조합을 고를 수 없는 상태.
  function checkbox(l, onSet) {
    const state = onSet.has(l.id) ? 'checked' : 'none';
    const deep = l.kind === 'group' ? ' · Ctrl+클릭: 하위 레이어까지' : '';
    return `<span class="cb ${state}" title="${state === 'checked' ? '이 조합에서 켜짐 (클릭하면 이 조합에서만 빼기)' : '이 조합에 넣기'}${deep}"></span>`;
  }

  function row(l, onSet, namesByLayer) {
    const selected = LMState.selectedIds.includes(l.id) ? ' selected' : '';
    const caret = l.kind === 'group' ? `<span class="caret">${LMState.collapsed.has(l.id) ? '▸' : '▾'}</span>` : '<span class="caret"></span>';
    const names = namesByLayer.get(l.id);
    const list = names ? `<span class="combos" title="${esc(names.join(', '))}">${esc(names.join(', '))}</span>` : '';
    return `<div class="layer-row ${l.kind}${selected}" data-layer="${l.id}" style="padding-left:${4 + l.depth * 14}px">
      ${caret}${onSet ? checkbox(l, onSet) : ''}<span class="eye${l.visible ? ' on' : ''}"${LMColors.layerHex(l.color) ? ` style="background:${LMColors.layerHex(l.color)}" title="포토샵 레이어 색"` : ''}>${l.visible ? '👁' : '·'}</span>
      <span class="name">${esc(l.name)}</span>${list}</div>`;
  }

  // 그림 쪽 최소 160px, 목록 쪽 최소 320px. 둘 다 못 지킬 만큼 좁으면 그림 최소를 지킨다.
  function splitRatio(ratio, total) {
    return LMCore.previewCache.clampSplit(ratio, total, 160, 320);
  }

  function render(el) {
    const prev = el.querySelector('.tree');
    const keep = prev ? prev.scrollTop : 0;
    const cats = LMState.docData.categories;
    LMState.combo = C().fillCombo(LMState.combo, cats);
    const variation = C().previewVariation(LMState.combo, cats);
    const onSet = cats.length && variation ? new Set(C().onLayerIds(LMState.docData.combos, variation)) : null;
    const sorted = C().sortCombos(LMState.docData.combos, cats);
    // 행마다 조합 목록을 다시 정렬하지 않도록 한 번에 모은다 (레이어 수백 개 대비).
    const namesByLayer = new Map();
    for (const e of sorted) {
      const name = C().comboName(e.when, cats);
      for (const id of e.layers) {
        if (!namesByLayer.has(id)) namesByLayer.set(id, []);
        namesByLayer.get(id).push(name);
      }
    }
    const noValues = cats.length && !variation ? '<p class="hint">값이 없는 카테고리가 있어 조합을 고를 수 없습니다. 카테고리 탭에서 값을 추가하세요.</p>' : '';
    const bar = cats.length
      ? pickerBar(cats) + noValues + (variation ? clipBar() : '') + toggleBar() + noticeBar()
      : '<p class="hint">카테고리 탭에서 카테고리를 먼저 만드세요.</p>';
    const tree = `<div class="tree">${visibleRows().map(l => row(l, onSet, namesByLayer)).join('')}</div>`;
    if (!cats.length || !LMPanelPreview.isOn()) {
      el.innerHTML = `<div class="combo-bar">${bar}</div>${tree}`;
    } else {
      // independent preview spec §4.2: 패널 너비와 상관없이 왼쪽 그림 | 경계 | 오른쪽 기존 내용.
      const r = splitRatio(LMPanelPreview.ratio(), el.clientWidth);
      el.innerHTML = `<div class="lm-split">` +
        `<div class="pv-wrap" style="flex:0 0 ${(r * 100).toFixed(2)}%">${LMPanelPreview.paneHtml()}</div>` +
        `<div class="pv-divider" title="끌어서 크기 조절"></div>` +
        `<div class="lm-main"><div class="combo-bar">${bar}</div>${tree}</div></div>`;
    }
    el.querySelector('.tree').scrollTop = keep;
  }

  // 조합 선택이나 조합 데이터가 바뀐 뒤: 먼저 그리고, 미리보기가 켜져 있으면 반영한 뒤 눈 아이콘을 다시 그린다.
  // 패널 미리보기는 캔버스 반영 뒤에: 호스트 호출은 차례로 처리되므로, 먼저 부르면 빠른 캔버스 반영이
  // 몇 초 걸리는 그리기 뒤에서 기다린다 (#2).
  async function afterComboChange() {
    LMApp.render();
    if (LMPreview.isOn()) {
      await LMPreview.apply();
      LMApp.render();
    }
    LMPanelPreview.request(false);
  }

  // ---- 조작 ----

  async function syncSelection() {
    LMApp.muteEcho();
    try { await LMHost.call('selectLayers', LMState.selectedIds); } catch (err) { LMApp.status(err.message); }
    LMApp.muteEcho();
  }

  function rangeIds(fromId, toId) {
    const ids = visibleRows().map(l => l.id);
    const a = ids.indexOf(fromId), b = ids.indexOf(toId);
    if (a === -1 || b === -1) return [toId];
    return ids.slice(Math.min(a, b), Math.max(a, b) + 1);
  }

  async function onRowClick(e, rowEl) {
    const id = Number(rowEl.dataset.layer);
    if (e.shiftKey && LMState.anchorId != null) {
      LMState.selectedIds = rangeIds(LMState.anchorId, id);
    } else if (e.ctrlKey || e.metaKey) {
      LMState.selectedIds = LMState.selectedIds.includes(id) ? LMState.selectedIds.filter(x => x !== id) : LMState.selectedIds.concat(id);
      LMState.anchorId = id;
    } else {
      LMState.selectedIds = [id];
      LMState.anchorId = id;
    }
    LMApp.render();
    await syncSelection();
  }

  // 체크박스 대상: 클릭한 행이 선택돼 있으면 선택 전체, 아니면 그 행.
  // deep(Ctrl)이면 그중 그룹의 하위까지 (independent preview spec §4.3).
  function checkboxTargets(id, deep) {
    const selected = selectedExisting();
    const base = selected.includes(id) ? selected : [id];
    return deep ? C().withDescendants(LMState.layers, base) : base;
  }

  // 지금 고른 조합(배리에이션)에서만 켜거나 끈다. 넓은 항목(모든 조합 등)에서 켜진 레이어를 끄면
  // 그 항목을 나머지 조합으로 쪼개 다른 조합에서는 그대로 켜져 있게 한다.
  function setInCurrent(ids, on) {
    const cats = LMState.docData.categories;
    const v = C().previewVariation(C().fillCombo(LMState.combo, cats), cats);
    if (!v) return false;
    const combos = LMState.docData.combos;
    LMState.docData.combos = on ? C().toggle(combos, v, ids, true) : C().removeFromVariation(combos, cats, v, ids);
    return true;
  }

  // 모든 조합의 레이어 켜짐·꺼짐 정보(combos)만 지운다. 카테고리·항상 뺄 조합·내보내기 설정은 그대로.
  async function resetCombos() {
    const combos = LMState.docData.combos;
    if (!combos.length) return;
    const checks = combos.reduce((n, c) => n + c.layers.length, 0);
    if (!confirm(`모든 조합의 레이어 켜짐·꺼짐 정보를 지웁니다 (항목 ${combos.length}개, 체크 ${checks}개).\n` +
      '카테고리와 내보내기 설정은 그대로입니다.\n되돌릴 수 없습니다 (PSD를 저장하기 전이면 저장하지 않고 다시 열어 되돌릴 수 있습니다). 계속할까요?')) return;
    LMState.docData.combos = [];
    await LMApp.saveDocData();
    LMApp.status('레이어 켜짐·꺼짐 정보를 초기화했습니다. PSD를 저장해야 파일에 남습니다.');
    return afterComboChange();
  }

  function currentVariation() {
    const cats = LMState.docData.categories;
    return C().previewVariation(C().fillCombo(LMState.combo, cats), cats);
  }

  function copyCombo() {
    const v = currentVariation();
    if (!v) return false;
    LMState.comboClipboard = {
      docKey: LMState.docKey,
      label: C().comboName(v, LMState.docData.categories),
      ids: C().onLayerIds(LMState.docData.combos, v),
    };
    return true;
  }

  // 붙여넣으면 켜질 것·꺼질 것 (확인창용). 그 사이 지워진 레이어는 뺀다.
  function pastePlan() {
    const clip = clipboard();
    const v = currentVariation();
    if (!clip || !v) return null;
    const existing = new Set(LMState.layers.map(l => l.id));
    const want = clip.ids.filter(id => existing.has(id));
    const now = C().onLayerIds(LMState.docData.combos, v);
    return { on: want.filter(id => !now.includes(id)), off: now.filter(id => !want.includes(id)), want, v };
  }

  // 붙여넣기 버튼: 확인창 없이 바로 적용하고, 바뀐 수를 상태줄에 알린다 (사용자 요청).
  async function pasteFromClipboard() {
    const plan = pastePlan();
    if (!plan) return;
    const name = C().comboName(plan.v, LMState.docData.categories);
    if (!plan.on.length && !plan.off.length) return LMApp.status(`${name}은(는) 이미 복사한 조합과 같습니다`);
    pasteCombo();
    await LMApp.saveDocData();
    LMApp.status(`${name}에 붙여넣었습니다 (켜짐 ${plan.on.length}개, 꺼짐 ${plan.off.length}개)`);
    return afterComboChange();
  }

  function pasteCombo() {
    const plan = pastePlan();
    if (!plan) return false;
    LMState.docData.combos = C().setVariationLayers(LMState.docData.combos, LMState.docData.categories, plan.v, plan.want);
    return true;
  }

  async function onCheckbox(cb, rowEl, e) {
    const targets = checkboxTargets(Number(rowEl.dataset.layer), e.ctrlKey || e.metaKey);
    if (!setInCurrent(targets, !cb.classList.contains('checked'))) return;
    // 저장이 끝난 뒤에 다시 그린다 (categories.js commit()과 같은 이유: 클릭 삼킴 방지).
    await LMApp.saveDocData();
    return afterComboChange();
  }

  async function onClick(e) {
    const rowEl = e.target.closest('#tab-layers .layer-row');
    if (rowEl) {
      if (e.target.closest('.caret') && rowEl.classList.contains('group')) {
        const id = Number(rowEl.dataset.layer);
        if (LMState.collapsed.has(id)) LMState.collapsed.delete(id); else LMState.collapsed.add(id);
        return LMApp.render();
      }
      const cb = e.target.closest('.cb');
      if (cb) return onCheckbox(cb, rowEl, e);
      return onRowClick(e, rowEl);
    }
    const btn = e.target.closest('#tab-layers [data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'combos-reset') return resetCombos();
    if (btn.dataset.action === 'combo-copy') {
      if (!copyCombo()) return;
      LMApp.status(`조합 복사: ${LMState.comboClipboard.label} (레이어 ${LMState.comboClipboard.ids.length}개)`);
      return LMApp.render();
    }
    if (btn.dataset.action === 'combo-paste') return pasteFromClipboard();
    if (btn.dataset.action === 'pv-redraw') return LMPanelPreview.request(true);
    if (btn.dataset.action === 'orphans-clean') {
      LMState.docData.combos = C().pruneOrphans(LMState.docData.combos, LMState.layers);
      await LMApp.saveDocData();
      return LMApp.render();
    }
  }

  async function onChange(e) {
    const panelSw = e.target.closest('#tab-layers input.panel-preview-switch');
    if (panelSw) {
      LMPanelPreview.setOn(panelSw.checked);
      LMApp.render();
      return LMPanelPreview.request(false);
    }
    const sw = e.target.closest('#tab-layers input.preview-switch');
    if (sw) {
      await (sw.checked ? LMPreview.enable() : LMPreview.disable());
      return LMApp.render();
    }
    const pick = e.target.closest('#tab-layers select[data-combo-cat]');
    if (pick) {
      LMState.combo = Object.assign({}, LMState.combo, { [pick.dataset.comboCat]: pick.value });
      return afterComboChange();
    }
  }

  // 리스너는 동기로 두고 비동기 본문의 거부를 한곳에서 받는다 (컨벤션 #2).
  document.addEventListener('click', e => {
    if (!e.target.closest('#tab-layers')) return;
    onClick(e).catch(err => LMApp.status(err.message));
  });
  document.addEventListener('change', e => {
    if (!e.target.closest('#tab-layers')) return;
    onChange(e).catch(err => LMApp.status(err.message));
  });

  // 그림/목록 경계 끌기. 끄는 동안은 너비만 바꾸고, 놓으면 비율을 기억한다.
  document.addEventListener('mousedown', e => {
    const divider = e.target.closest && e.target.closest('#tab-layers .pv-divider');
    if (!divider) return;
    e.preventDefault();
    const split = divider.parentElement;
    const wrap = split.querySelector('.pv-wrap');
    const box = split.getBoundingClientRect();
    let r = LMPanelPreview.ratio();
    const move = ev => {
      r = splitRatio(Math.min(0.999, Math.max(0.001, (ev.clientX - box.left) / box.width)), box.width);
      wrap.style.flex = `0 0 ${(r * 100).toFixed(2)}%`;
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      LMPanelPreview.setRatio(r);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });

  // 패널 크기가 바뀌면 최소 크기 안으로 너비를 다시 맞춘다.
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (LMState.tab === 'layers' && LMPanelPreview.isOn()) LMApp.render();
    }, 150);
  });

  return { render, afterComboChange, checkboxTargets, setInCurrent, copyCombo, pastePlan, pasteCombo, pasteFromClipboard, resetCombos };
})();
