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
    return `<div class="row made"><label>만든 조합 <select class="made-select">${opts}</select></label>${LMPreview.toggleHtml()}</div>`;
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
    return `<span class="cb ${s.state}" title="${s.state === 'checked' ? '이 조합에서 켜짐 (클릭하면 빼기)' : '이 조합에 넣기'}"></span>`;
  }

  function row(l, cats, namesByLayer) {
    const selected = LMState.selectedIds.includes(l.id) ? ' selected' : '';
    const caret = l.kind === 'group' ? `<span class="caret">${LMState.collapsed.has(l.id) ? '▸' : '▾'}</span>` : '<span class="caret"></span>';
    const names = namesByLayer.get(l.id);
    const list = names ? `<span class="combos" title="${esc(names.join(', '))}">${esc(names.join(', '))}</span>` : '';
    return `<div class="layer-row ${l.kind}${selected}" data-layer="${l.id}" style="padding-left:${4 + l.depth * 14}px">
      ${caret}${cats.length ? checkbox(l, cats) : ''}<span class="eye${l.visible ? ' on' : ''}">${l.visible ? '👁' : '·'}</span>
      <span class="name">${esc(l.name)}</span>${list}</div>`;
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
    el.innerHTML = `<div class="combo-bar">${bar}</div><div class="tree">${visibleRows().map(l => row(l, cats, namesByLayer)).join('')}</div>`;
    el.querySelector('.tree').scrollTop = keep;
  }

  // 조합 선택이나 조합 데이터가 바뀐 뒤: 먼저 그리고, 미리보기가 켜져 있으면 반영한 뒤 눈 아이콘을 다시 그린다.
  async function afterComboChange() {
    LMApp.render();
    if (!LMPreview.isOn()) return;
    await LMPreview.apply();
    LMApp.render();
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

  async function onCheckbox(cb, rowEl) {
    if (cb.classList.contains('inherited')) {
      LMState.combo = JSON.parse(cb.dataset.from);
      return afterComboChange();
    }
    const id = Number(rowEl.dataset.layer);
    const selected = selectedExisting();
    const targets = selected.includes(id) ? selected : [id];
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
      if (cb) return onCheckbox(cb, rowEl);
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
    if (btn.dataset.action === 'orphans-clean') {
      LMState.docData.combos = C().pruneOrphans(LMState.docData.combos, LMState.layers);
      await LMApp.saveDocData();
      return LMApp.render();
    }
  }

  async function onChange(e) {
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

  return { render, afterComboChange };
})();
