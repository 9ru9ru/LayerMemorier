// 레이어 탭 (spec §6.2): 트리 + 배지 + 선택 동기화 + 마킹 영역.
LMUI.layers = (() => {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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

  function badges(layer) {
    const mark = LMState.docData.marks[String(layer.id)];
    if (!mark) return '';
    const cats = LMState.docData.categories;
    const issues = LMCore.visibility.markIssues(mark, cats);
    return Object.keys(mark).map(cid => {
      const c = cats.find(c => c.id === cid);
      if (!c) return `<span class="badge stale" style="background:${LMColors.hex('gray')}">${esc(cid)}</span>`;
      const names = mark[cid].map(vid => { const v = c.values.find(v => v.id === vid); return v ? esc(v.name) : `<s>${esc(vid)}</s>`; }).join(',');
      const stale = issues.some(i => i.categoryId === cid) ? ' stale' : '';
      return `<span class="badge${stale}" style="background:${LMColors.hex(c.color)}">${esc(c.name)}: ${names}</span>`;
    }).join(' ');
  }

  function row(l) {
    const selected = LMState.selectedIds.includes(l.id) ? ' selected' : '';
    const caret = l.kind === 'group' ? `<span class="caret">${LMState.collapsed.has(l.id) ? '▸' : '▾'}</span>` : '<span class="caret"></span>';
    return `<div class="layer-row ${l.kind}${selected}" data-layer="${l.id}" style="padding-left:${4 + l.depth * 14}px">
      ${caret}<span class="eye${l.visible ? ' on' : ''}">${l.visible ? '👁' : '·'}</span>
      <span class="name">${esc(l.name)}</span>${badges(l)}</div>`;
  }

  function markPanel() {
    const ids = LMState.selectedIds.filter(id => LMState.layers.some(l => l.id === id));
    if (!ids.length) return '<p class="hint mark-panel">레이어를 선택하면 마킹할 수 있습니다.</p>';
    const marks = ids.map(id => LMState.docData.marks[String(id)] || {});
    const lines = LMState.docData.categories.map(c => {
      const boxes = c.values.map(v => {
        const count = marks.filter(m => (m[c.id] || []).includes(v.id)).length;
        const checked = count === ids.length ? 'checked' : '';
        const mixed = count > 0 && count < ids.length ? 'data-mixed="1"' : '';
        return `<label><input type="checkbox" data-category="${esc(c.id)}" data-value="${esc(v.id)}" ${checked} ${mixed}>${esc(v.name)}</label>`;
      }).join('');
      return `<div class="cat-line"><span class="dot" style="background:${LMColors.hex(c.color)}"></span><b>${esc(c.name)}</b>${boxes}</div>`;
    }).join('');
    return `<div class="mark-panel"><div class="row"><b>선택 ${ids.length}개</b><button data-action="marks-clear">마크 지우기</button></div>${lines || '<p class="hint">카테고리 탭에서 카테고리를 먼저 만드세요.</p>'}</div>`;
  }

  function orphans() {
    const ids = LMCore.jobs.orphanMarkIds(LMState.docData.marks, LMState.layers);
    if (!ids.length) return '';
    return `<div class="row warn orphans">고아 마크 ${ids.length}개 (문서에 없는 레이어) <button data-action="orphans-clean">정리</button></div>`;
  }

  function render(el) {
    el.innerHTML = `<p class="hint">PSD를 저장해야 마크가 파일에 남습니다.</p>${orphans()}<div class="tree">${visibleRows().map(row).join('')}</div>${markPanel()}`;
    el.querySelectorAll('input[data-mixed]').forEach(i => { i.indeterminate = true; });
  }

  // setLayerColor는 'Clr ' 속성을 항상 활성 레이어에 적용하므로 대상 레이어를 먼저
  // 선택하는 부작용이 있다(env-facts.md). 루프를 도는 동안 포토샵의 선택이
  // 마지막으로 칠한 레이어 하나로 좁혀지므로, 루프 앞뒤로 패널이 알던 선택을
  // 직접 저장/복원해 이 함수를 호출한 곳의 다중 선택을 지켜준다.
  async function applyNativeColor(layerIds) {
    if (!LMState.docData.nativeColor) return;
    let saved = [];
    try { saved = await LMHost.call('getSelectedLayerIds'); } catch (e) { LMApp.status(e.message); }
    for (const id of layerIds) {
      const mark = LMState.docData.marks[String(id)];
      const first = mark && Object.keys(mark)[0];
      const c = first && LMState.docData.categories.find(c => c.id === first);
      const color = c ? LMColors.native(c.color) : 'none';
      try { await LMHost.call('setLayerColor', { id, color }); } catch (e) { LMApp.status(e.message); }
    }
    if (saved && saved.length) {
      try { await LMHost.call('selectLayers', saved); } catch (e) { LMApp.status(e.message); }
    }
    const layers = await LMHost.call('getLayers');
    LMState.layers = layers;
  }

  async function setMark(layerIds, categoryId, valueId, on) {
    const marks = LMState.docData.marks;
    for (const id of layerIds) {
      const key = String(id);
      const mark = marks[key] || (marks[key] = {});
      const set = new Set(mark[categoryId] || []);
      if (on) set.add(valueId); else set.delete(valueId);
      if (set.size) mark[categoryId] = Array.from(set); else delete mark[categoryId];
      if (!Object.keys(mark).length) delete marks[key];
    }
    await LMApp.saveDocData();
    await applyNativeColor(layerIds);
    LMApp.render();
  }

  document.addEventListener('click', async e => {
    const inTab = e.target.closest('#tab-layers');
    if (!inTab) return;
    const caret = e.target.closest('#tab-layers .caret');
    const rowEl = e.target.closest('#tab-layers .layer-row');
    if (caret && rowEl && rowEl.classList.contains('group')) {
      const id = Number(rowEl.dataset.layer);
      if (LMState.collapsed.has(id)) LMState.collapsed.delete(id); else LMState.collapsed.add(id);
      return LMApp.render();
    }
    if (rowEl) {
      const id = Number(rowEl.dataset.layer);
      if (e.ctrlKey || e.metaKey) {
        LMState.selectedIds = LMState.selectedIds.includes(id) ? LMState.selectedIds.filter(x => x !== id) : LMState.selectedIds.concat(id);
      } else {
        LMState.selectedIds = [id];
      }
      LMApp.render();
      try { await LMHost.call('selectLayers', LMState.selectedIds); } catch (err) { LMApp.status(err.message); }
      return;
    }
    const btn = e.target.closest('#tab-layers [data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'marks-clear') {
      const ids = LMState.selectedIds.slice();
      for (const id of ids) delete LMState.docData.marks[String(id)];
      await LMApp.saveDocData();
      await applyNativeColor(ids);
      return LMApp.render();
    }
    if (btn.dataset.action === 'orphans-clean') {
      for (const id of LMCore.jobs.orphanMarkIds(LMState.docData.marks, LMState.layers)) delete LMState.docData.marks[String(id)];
      await LMApp.saveDocData();
      return LMApp.render();
    }
  });

  document.addEventListener('change', e => {
    const box = e.target.closest('#tab-layers .mark-panel input[data-category]');
    if (!box) return;
    setMark(LMState.selectedIds.slice(), box.dataset.category, box.dataset.value, box.checked).catch(e => LMApp.status(e.message));
  });

  return { render, setMark };
})();
