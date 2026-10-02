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

  function pickerBar(cats) {
    const selects = cats.map(c => {
      const cur = LMState.combo[c.id] || '';
      const opts = [`<option value="" ${cur === '' ? 'selected' : ''}>전체</option>`]
        .concat(c.values.map(v => `<option value="${esc(v.id)}" ${cur === v.id ? 'selected' : ''}>${esc(v.name)}</option>`)).join('');
      return `<label class="pick"><span class="dot" style="background:${LMColors.hex(c.color)}"></span>${esc(c.name)} <select data-combo-cat="${esc(c.id)}">${opts}</select></label>`;
    }).join('');
    return `<div class="row picker"><b>조합</b>${selects}</div>`;
  }

  function madeBar(cats, sorted, existing) {
    const current = sorted.find(e => C().sameWhen(e.when, LMState.combo));
    const opts = (current ? [] : ['<option value="" selected>(새 조합)</option>']).concat(sorted.map(e => {
      const n = e.layers.filter(id => existing.has(id)).length;
      return `<option value="${esc(JSON.stringify(e.when))}" ${e === current ? 'selected' : ''}>${esc(C().comboName(e.when, cats))} · ${n}개</option>`;
    })).join('');
    const panel = `<label class="preview-toggle" title="레이어 탭 왼쪽에 지금 조합을 그립니다 (큰 문서는 한 번에 몇 초 걸릴 수 있음)"><input type="checkbox" class="panel-preview-switch" ${LMPanelPreview.isOn() ? 'checked' : ''}> 패널 미리보기</label>`;
    return `<div class="row made"><label>만든 조합 <select class="made-select">${opts}</select></label>${panel}${LMPreview.toggleHtml()}</div>`;
  }

  function selectionBar() {
    const ids = selectedExisting();
    if (!ids.length) return '';
    const m = C().countWithLayers(LMState.docData.combos, ids);
    return `<div class="row selbar"><b>선택 ${ids.length}개</b><button data-action="remove-selected" ${m ? '' : 'disabled'}>선택 레이어를 모든 조합에서 빼기</button></div>`;
  }

  function noticeBar() {
    const orphans = C().orphanLayerIds(LMState.docData.combos, LMState.layers);
    const orphan = orphans.length
      ? `<span class="warn orphans">문서에 없는 레이어 ${orphans.length}개가 조합에 남아 있습니다 <button data-action="orphans-clean">정리</button></span>`
      : '';
    return `<div class="row notice">${orphan}<span class="hint">PSD를 저장해야 조합이 파일에 남습니다.</span></div>`;
  }

  // ---- 트리 ----

  function checkbox(l, cats) {
    const s = C().layerState(LMState.docData.combos, LMState.combo, l.id);
    if (s.state === 'inherited') {
      const name = C().comboName(s.from, cats);
      return `<span class="cb inherited" data-from="${esc(JSON.stringify(s.from))}" title="${esc(name)}에서 켜짐 (클릭하면 이동)"></span>`;
    }
    const deep = l.kind === 'group' ? ' · Ctrl+클릭: 하위 레이어까지' : '';
    return `<span class="cb ${s.state}" title="${s.state === 'checked' ? '이 조합에서 켜짐 (클릭하면 빼기)' : '이 조합에 넣기'}${deep}"></span>`;
  }

  function row(l, cats, namesByLayer) {
    const selected = LMState.selectedIds.includes(l.id) ? ' selected' : '';
    const caret = l.kind === 'group' ? `<span class="caret">${LMState.collapsed.has(l.id) ? '▸' : '▾'}</span>` : '<span class="caret"></span>';
    const names = namesByLayer.get(l.id);
    const list = names ? `<span class="combos" title="${esc(names.join(', '))}">${esc(names.join(', '))}</span>` : '';
    return `<div class="layer-row ${l.kind}${selected}" data-layer="${l.id}" style="padding-left:${4 + l.depth * 14}px">
      ${caret}${cats.length ? checkbox(l, cats) : ''}<span class="eye${l.visible ? ' on' : ''}"${LMColors.layerHex(l.color) ? ` style="background:${LMColors.layerHex(l.color)}" title="포토샵 레이어 색"` : ''}>${l.visible ? '👁' : '·'}</span>
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
    const sorted = C().sortCombos(LMState.docData.combos, cats);
    const existing = new Set(LMState.layers.map(l => l.id));
    // 행마다 조합 목록을 다시 정렬하지 않도록 한 번에 모은다 (레이어 수백 개 대비).
    const namesByLayer = new Map();
    for (const e of sorted) {
      const name = C().comboName(e.when, cats);
      for (const id of e.layers) {
        if (!namesByLayer.has(id)) namesByLayer.set(id, []);
        namesByLayer.get(id).push(name);
      }
    }
    const bar = cats.length
      ? pickerBar(cats) + madeBar(cats, sorted, existing) + selectionBar() + noticeBar()
      : '<p class="hint">카테고리 탭에서 카테고리를 먼저 만드세요.</p>';
    const tree = `<div class="tree">${visibleRows().map(l => row(l, cats, namesByLayer)).join('')}</div>`;
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

  async function onCheckbox(cb, rowEl, e) {
    if (cb.classList.contains('inherited')) {
      LMState.combo = JSON.parse(cb.dataset.from);
      return afterComboChange();
    }
    LMState.combo = C().cleanWhen(LMState.combo, LMState.docData.categories);
    const targets = checkboxTargets(Number(rowEl.dataset.layer), e.ctrlKey || e.metaKey);
    const on = !cb.classList.contains('checked');
    LMState.docData.combos = C().toggle(LMState.docData.combos, LMState.combo, targets, on);
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
    if (btn.dataset.action === 'remove-selected') {
      const ids = selectedExisting();
      const m = C().countWithLayers(LMState.docData.combos, ids);
      if (!m || !confirm(`레이어 ${ids.length}개를 조합 ${m}개에서 뺍니다. 계속할까요?`)) return;
      LMState.docData.combos = C().removeLayers(LMState.docData.combos, ids);
      await LMApp.saveDocData();
      return afterComboChange();
    }
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
    const made = e.target.closest('#tab-layers select.made-select');
    if (pick) {
      const next = Object.assign({}, LMState.combo);
      if (pick.value) next[pick.dataset.comboCat] = pick.value; else delete next[pick.dataset.comboCat];
      LMState.combo = next;
      return afterComboChange();
    }
    if (made && made.value) {
      LMState.combo = JSON.parse(made.value);
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

  return { render, afterComboChange, checkboxTargets };
})();
