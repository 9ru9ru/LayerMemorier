// 내보내기 탭 (spec §6.3, §8, §9).
LMUI.export = (() => {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function preview() {
    const d = LMState.docData;
    const variations = LMCore.variation.enumerate(d.categories, { excluded: d.excluded, include: LMState.include });
    const built = LMCore.jobs.buildJobs(d, LMState.layers, variations);
    return Object.assign({ variations }, built);
  }

  function valueName(cid, vid) {
    const c = LMState.docData.categories.find(c => c.id === cid);
    const v = c && c.values.find(v => v.id === vid);
    return (c ? c.name : cid) + '=' + (v ? v.name : vid);
  }

  function layerName(id) {
    const l = LMState.layers.find(l => l.id === id);
    return l ? l.name : '#' + id;
  }

  function warningText(w) {
    if (w.type === 'orphan') return `고아 마크: 레이어 #${w.layerId} 가 문서에 없음`;
    if (w.type === 'stale') return `"${layerName(w.layerId)}" 마크가 없는 ${w.detail.valueId ? '값' : '카테고리'}을 참조 (${w.detail.categoryId}${w.detail.valueId ? '/' + w.detail.valueId : ''})`;
    if (w.type === 'parentHidden') return `"${layerName(w.layerId)}" 의 부모 그룹 "${layerName(w.detail.groupId)}" 이 마크 없이 꺼져 있어 어떤 배리에이션에서도 안 보임`;
    return JSON.stringify(w);
  }

  function settings(d) {
    return `
      <div class="row"><label>출력명 <input data-field="baseName" value="${esc(d.baseName)}"></label>
        <label>구분자 <input data-field="delimiter" value="${esc(d.delimiter)}" style="width:3em"></label></div>
      <div class="row"><label>출력 폴더 <input data-field="destination" value="${esc(d.destination)}" style="width:220px"></label>
        <button data-action="pick-folder">폴더…</button></div>
      <div class="row"><label><input type="checkbox" data-field="nativeColor" ${d.nativeColor ? 'checked' : ''}> 마킹할 때 포토샵 레이어 색도 바꾸기</label></div>`;
  }

  function includeBlock(d) {
    const lines = d.categories.map(c => {
      const inc = LMState.include[c.id];
      const boxes = c.values.map(v => {
        const on = !inc || inc.includes(v.id);
        return `<label><input type="checkbox" data-category="${esc(c.id)}" data-value="${esc(v.id)}" ${on ? 'checked' : ''}>${esc(v.name)}</label>`;
      }).join('');
      return `<div class="row"><span class="dot" style="background:${LMColors.hex(c.color)}"></span><b>${esc(c.name)}</b>${boxes}</div>`;
    }).join('');
    return `<details open class="include"><summary>부분 출력 (체크한 값만)</summary>${lines}</details>`;
  }

  function excludeBlock(d) {
    const rows = d.excluded.map((x, i) => `<div class="row"><span>${Object.keys(x).map(cid => esc(valueName(cid, x[cid]))).join(' + ')}</span><button data-action="exclude-delete" data-index="${i}">×</button></div>`).join('');
    const selects = d.categories.map(c => `<select data-category="${esc(c.id)}"><option value="">${esc(c.name)}: 무관</option>${c.values.map(v => `<option value="${esc(v.id)}">${esc(v.name)}</option>`).join('')}</select>`).join('');
    return `<details open class="exclude"><summary>제외 조합</summary>${rows}<div class="row exclude-new">${selects}<button data-action="exclude-add">추가</button></div></details>`;
  }

  function previewBlock(pv) {
    const conflicts = pv.conflicts.length ? `<p class="err conflicts">충돌: 같은 파일명이 두 번 이상 나옵니다 — ${pv.conflicts.map(esc).join(', ')}</p>` : '';
    const warnings = pv.warnings.length ? `<ul class="warn">${pv.warnings.map(w => `<li>${esc(warningText(w))}</li>`).join('')}</ul>` : '';
    return `<div class="row"><b>배리에이션 <span class="count">${pv.variations.length}</span>개</b></div>${conflicts}${warnings}
      <div class="preview">${pv.jobs.map(j => esc(j.relativePath)).join('\n')}</div>`;
  }

  function runBlock(pv) {
    const d = LMState.docData;
    const canRun = !LMState.exporting && pv.jobs.length > 0 && pv.conflicts.length === 0 && d.destination.trim() !== '' && d.baseName.trim() !== '';
    let progress = '';
    if (LMState.progress) {
      const { done, total, current } = LMState.progress;
      progress = `<div class="progress"><div style="width:${total ? Math.round(done / total * 100) : 0}%"></div></div><div class="row"><span>${done} / ${total}</span><span>${esc(current || '')}</span></div>`;
    }
    let summary = '';
    if (LMState.summary && !LMState.exporting) {
      const s = LMState.summary;
      summary = `<div class="summary"><b>${s.succeeded}개 성공</b>${s.failures.length ? `, ${s.failures.length}개 실패<ul class="err">${s.failures.map(f => `<li>${esc(f.path)}: ${esc(f.error)}</li>`).join('')}</ul>` : ''}${s.aborted ? ' (중단됨)' : ''}</div>`;
    }
    return `<div class="row">
      <button class="primary" data-action="export-run" ${canRun ? '' : 'disabled'}>내보내기</button>
      <button data-action="export-abort" ${LMState.exporting ? '' : 'disabled'}>중단</button></div>${progress}${summary}`;
  }

  function render(el) {
    const d = LMState.docData;
    const pv = preview();
    el.innerHTML = settings(d) + includeBlock(d) + excludeBlock(d) + previewBlock(pv) + runBlock(pv);
  }

  async function run() {
    const d = LMState.docData;
    const pv = preview();
    if (pv.conflicts.length || !pv.jobs.length) return;
    LMState.exporting = true; LMState.abort = false; LMState.summary = null;
    LMState.progress = { done: 0, total: pv.jobs.length, current: '' };
    const failures = [];
    let done = 0;
    let succeeded = 0;
    LMApp.render();
    try {
      await LMApp.saveDocData();
      await LMHost.call('exportBegin', { layerIds: LMCore.jobs.markedLayerIds(d.marks, LMState.layers) });
      const dest = d.destination.trim().replace(/\\/g, '/').replace(/\/+$/, '');
      for (const job of pv.jobs) {
        if (LMState.abort) break;
        LMState.progress.current = job.relativePath;
        renderProgressOnly();
        try {
          await LMHost.call('exportOne', { on: job.on, off: job.off, path: dest + '/' + job.relativePath });
          succeeded++;
        } catch (e) {
          failures.push({ path: job.relativePath, error: e.message });
        }
        done++;
        LMState.progress.done = done;
        renderProgressOnly();
      }
    } catch (e) {
      failures.push({ path: '(시작)', error: e.message });
    } finally {
      try { await LMHost.call('exportEnd'); } catch (e) { failures.push({ path: '(복원)', error: e.message }); }
      LMState.exporting = false;
      LMState.summary = { done, succeeded, failures, aborted: LMState.abort };
      LMState.progress = null;
      try { await LMApp.refresh(); } catch (e) { LMApp.status(e.message); }
    }
  }

  function renderProgressOnly() {
    const el = document.querySelector('#tab-export .progress');
    if (!el) return;
    const { done, total, current } = LMState.progress;
    el.firstElementChild.style.width = (total ? Math.round(done / total * 100) : 0) + '%';
    const row = el.nextElementSibling;
    if (row) { row.children[0].textContent = `${done} / ${total}`; row.children[1].textContent = current || ''; }
  }

  // 클릭 핸들러 전체를 try/catch로 감싼다: export-run이 반환하는 run()의 reject를 포함해
  // 이 탭에서 시작되는 어떤 비동기 경로도 처리되지 않은 거부로 새지 않게 한다 (컨벤션 #2).
  document.addEventListener('click', async e => {
    const btn = e.target.closest('#tab-export [data-action]');
    if (!btn) return;
    try {
      const d = LMState.docData;
      switch (btn.dataset.action) {
        case 'pick-folder': {
          const r = window.cep.fs.showOpenDialog(false, true, '출력 폴더 선택', d.destination || '', []);
          if (r.err === window.cep.fs.NO_ERROR && r.data && r.data[0]) { d.destination = r.data[0]; await LMApp.saveDocData(); LMApp.render(); }
          return;
        }
        case 'exclude-add': {
          const entry = {};
          document.querySelectorAll('#tab-export .exclude-new select').forEach(s => { if (s.value) entry[s.dataset.category] = s.value; });
          if (!Object.keys(entry).length) return LMApp.status('제외할 값을 하나 이상 고르세요.');
          d.excluded.push(entry);
          await LMApp.saveDocData();
          return LMApp.render();
        }
        case 'exclude-delete':
          d.excluded.splice(Number(btn.dataset.index), 1);
          await LMApp.saveDocData();
          return LMApp.render();
        case 'export-run': return await run();
        case 'export-abort': LMState.abort = true; return;
      }
    } catch (err) {
      LMApp.status(err.message);
    }
  });

  document.addEventListener('change', async e => {
    try {
      const field = e.target.closest('#tab-export [data-field]');
      if (field) {
        const d = LMState.docData;
        d[field.dataset.field] = field.type === 'checkbox' ? field.checked : field.value;
        await LMApp.saveDocData();
        return LMApp.render();
      }
      const box = e.target.closest('#tab-export .include input[data-category]');
      if (box) {
        const c = LMState.docData.categories.find(c => c.id === box.dataset.category);
        const current = LMState.include[c.id] || c.values.map(v => v.id);
        const next = box.checked ? current.concat(box.dataset.value) : current.filter(v => v !== box.dataset.value);
        if (next.length === c.values.length) delete LMState.include[c.id]; else LMState.include[c.id] = next;
        return LMApp.render();
      }
    } catch (err) {
      LMApp.status(err.message);
    }
  });

  return { render, run, preview };
})();
