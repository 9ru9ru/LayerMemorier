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
    if (w.type === 'orphan') return `문서에 없는 레이어 #${w.layerId} 가 조합에 남아 있음`;
    if (w.type === 'stale') return `없는 카테고리·값을 쓰는 조합 "${LMCore.combos.comboName(w.detail.when, LMState.docData.categories)}" (내보내기에서 무시)`;
    if (w.type === 'parentHidden') return `조합에 넣은 레이어 "${layerName(w.layerId)}" 의 부모 그룹 "${layerName(w.detail.groupId)}" 이 꺼져 있어 어떤 조합에서도 안 보임`;
    return JSON.stringify(w);
  }

  // 호스트 오류 코드(export spec §5) → 사용자에게 보일 글.
  const HOST_ERRORS = {
    LM_EMPTY: '내용이 없어 잘라낼 수 없습니다',
    LM_PNG8_TOO_LARGE: 'PNG-8은 가로·세로 8192px 이하 문서만 내보낼 수 있습니다',
    LM_NAME_EXHAUSTED: '같은 이름의 파일이 너무 많습니다 (9999개)',
  };

  function hostMessage(e) {
    const m = /LM_[A-Z0-9_]+/.exec(e.message);
    return m && HOST_ERRORS[m[0]] ? HOST_ERRORS[m[0]] : e.message;
  }

  function phaseText(p) {
    return (p.phase === 'measure' ? '영역 재는 중 ' : '내보내기 ') + p.done + ' / ' + p.total;
  }

  function settings(d) {
    return `
      <div class="out-row"><b class="out-label">출력</b>
        <label class="opt">출력명<input data-field="baseName" value="${esc(d.baseName)}"></label>
        <label class="opt">구분자<input data-field="delimiter" value="${esc(d.delimiter)}" style="width:3em"></label></div>
      <div class="out-row"><b class="out-label"></b>
        <label class="opt">출력 폴더<input data-field="destination" value="${esc(d.destination)}" style="width:260px"></label>
        <button data-action="pick-folder">폴더…</button></div>`;
  }

  // <details> 는 사용자가 펼치거나 접은 상태를 세션 동안 기억하고, 처음에는 내용이 있으면 펼친다.
  function openAttr(name, defaultOpen) {
    const s = LMState.exportOpen[name];
    return (s == null ? defaultOpen : s) ? 'open' : '';
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
    return `<details class="include" data-open="include" ${openAttr('include', Object.keys(LMState.include).length > 0)}><summary>이번만 내보낼 값 (저장 안 됨)</summary>${lines}</details>`;
  }

  function excludeBlock(d) {
    const rows = d.excluded.map((x, i) => `<div class="row"><span>${Object.keys(x).map(cid => esc(valueName(cid, x[cid]))).join(' + ')}</span><button data-action="exclude-delete" data-index="${i}">×</button></div>`).join('');
    const selects = d.categories.map(c => `<select data-category="${esc(c.id)}"><option value="">${esc(c.name)}: 무관</option>${c.values.map(v => `<option value="${esc(v.id)}">${esc(v.name)}</option>`).join('')}</select>`).join('');
    return `<details class="exclude" data-open="exclude" ${openAttr('exclude', d.excluded.length > 0)}><summary>항상 뺄 조합 (PSD에 저장)</summary>${rows}<div class="row exclude-new">${selects}<button data-action="exclude-add">추가</button></div></details>`;
  }

  function previewBlock(pv) {
    const conflicts = pv.conflicts.length ? `<p class="err conflicts">충돌: 같은 파일명이 두 번 이상 나옵니다 — ${pv.conflicts.map(esc).join(', ')}</p>` : '';
    const warnings = pv.warnings.length ? `<details class="warnings" data-open="warnings" ${openAttr('warnings', false)}><summary>경고 ${pv.warnings.length}개</summary><ul class="warn">${pv.warnings.map(w => `<li>${esc(warningText(w))}</li>`).join('')}</ul></details>` : '';
    return `<div class="row"><b>배리에이션 <span class="count">${pv.variations.length}</span>개</b></div>${conflicts}${warnings}
      <div class="preview">${pv.jobs.map(j => esc(j.relativePath)).join('\n')}</div>`;
  }

  function runBlock(pv) {
    const d = LMState.docData;
    const canRun = !LMState.exporting && pv.jobs.length > 0 && pv.conflicts.length === 0 && d.destination.trim() !== '' && d.baseName.trim() !== '';
    let progress = '';
    if (LMState.progress) {
      const p = LMState.progress;
      progress = `<div class="progress"><div style="width:${p.total ? Math.round(p.done / p.total * 100) : 0}%"></div></div><div class="row"><span>${esc(phaseText(p))}</span><span>${esc(p.current || '')}</span></div>`;
    }
    let summary = '';
    if (LMState.summary && !LMState.exporting) {
      const s = LMState.summary;
      summary = `<div class="summary"><b>${s.succeeded}개 성공</b>${s.renamed ? `, 번호를 붙여 저장 ${s.renamed}개` : ''}${s.failures.length ? `, ${s.failures.length}개 실패<ul class="err">${s.failures.map(f => `<li>${esc(f.path)}: ${esc(f.error)}</li>`).join('')}</ul>` : ''}${s.aborted ? ' (중단됨)' : ''}</div>`;
    }
    return `<div class="row">
      <button class="primary" data-action="export-run" ${canRun ? '' : 'disabled'}>내보내기</button>
      <button data-action="export-abort" ${LMState.exporting ? '' : 'disabled'}>중단</button></div>${progress}${summary}`;
  }

  function render(el) {
    const d = LMState.docData;
    const pv = preview();
    el.innerHTML = settings(d) + LMUI.outputOptions.render(d) + includeBlock(d) + excludeBlock(d) + previewBlock(pv) + runBlock(pv);
  }

  async function run() {
    const d = LMState.docData;
    const pv = preview();
    if (pv.conflicts.length || !pv.jobs.length) return;
    const dest = d.destination.trim().replace(/\\/g, '/').replace(/\/+$/, '');
    // spec §9: 출력 폴더는 시작 전에 한 번 만들어 보고 쓸 수 있는지 확인한다.
    try {
      await LMHost.call('ensureDestination', { path: dest });
    } catch (e) {
      return LMApp.status('출력 폴더를 쓸 수 없습니다: ' + e.message);
    }
    const output = LMCore.output.normalize(d.output);
    const fast = LMCore.output.isFastPath(output);
    LMState.exporting = true; LMState.abort = false; LMState.summary = null;
    const failures = [];
    let done = 0;
    let succeeded = 0;
    let renamed = 0;
    LMApp.render();
    try {
      await LMApp.saveDocData();
      await LMHost.call('exportBegin', { layerIds: LMCore.combos.managedLayerIds(d.combos, LMState.layers) });
      let crop = null;
      let skip = false;
      // export spec §7 3단계: 공통 영역은 모든 조합을 먼저 잰다.
      if (output.trim === 'combined') {
        LMState.progress = { phase: 'measure', done: 0, total: pv.jobs.length, current: '' };
        LMApp.render(); // 진행 막대를 그린다 (renderProgressOnly는 이미 있는 막대만 고친다)
        renderProgressOnly();
        const measured = [];
        try {
          for (const job of pv.jobs) {
            if (LMState.abort) break;
            LMState.progress.current = job.relativePath;
            renderProgressOnly();
            const r = await LMHost.call('measureBounds', { on: job.on, off: job.off });
            measured.push(r.bounds);
            LMState.progress.done++;
            renderProgressOnly();
          }
          crop = LMCore.output.unionBounds(measured);
          if (!LMState.abort && !crop) { failures.push({ path: '(전체)', error: '모든 조합이 비어 있습니다' }); skip = true; }
        } catch (e) {
          failures.push({ path: '(영역 재기)', error: hostMessage(e) });
          skip = true;
        }
      }
      if (!skip && !LMState.abort) {
        LMState.progress = { phase: 'export', done: 0, total: pv.jobs.length, current: '' };
        LMApp.render();
        renderProgressOnly();
        for (const job of pv.jobs) {
          if (LMState.abort) break;
          LMState.progress.current = job.relativePath;
          renderProgressOnly();
          const path = dest + '/' + job.relativePath;
          try {
            const r = await LMHost.call('exportOne', { on: job.on, off: job.off, path, output, fast, crop });
            succeeded++;
            if (r && r.path && r.path.toLowerCase() !== path.toLowerCase()) renamed++;
          } catch (e) {
            failures.push({ path: job.relativePath, error: hostMessage(e) });
          }
          done++;
          LMState.progress.done = done;
          renderProgressOnly();
        }
      }
    } catch (e) {
      failures.push({ path: '(시작)', error: hostMessage(e) });
    } finally {
      try { await LMHost.call('exportEnd'); } catch (e) { failures.push({ path: '(복원)', error: e.message }); }
      LMState.exporting = false;
      LMState.summary = { done, succeeded, renamed, failures, aborted: LMState.abort };
      LMState.progress = null;
      try { LMExportDefaults.save(output); } catch (e) { LMApp.status(e.message); }
      try { await LMApp.refresh(); } catch (e) { LMApp.status(e.message); }
    }
  }

  function renderProgressOnly() {
    const el = document.querySelector('#tab-export .progress');
    if (!el) return;
    const { done, total, current } = LMState.progress;
    el.firstElementChild.style.width = (total ? Math.round(done / total * 100) : 0) + '%';
    const row = el.nextElementSibling;
    if (row) { row.children[0].textContent = phaseText(LMState.progress); row.children[1].textContent = current || ''; }
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

  // toggle 은 버블링하지 않으므로 캡처로 받는다.
  document.addEventListener('toggle', e => {
    const det = e.target;
    if (!det || !det.dataset || !det.dataset.open || !det.closest('#tab-export')) return;
    LMState.exportOpen[det.dataset.open] = det.open;
  }, true);

  return { render, run, preview };
})();
