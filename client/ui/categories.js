// 카테고리 탭 (spec §6.1). 그리기 + 이벤트 처리만 한다.
LMUI.categories = (() => {
  // 저장되는 값은 그대로 두고 보이는 글자만 말로 바꾼다 (기존 문서 호환).
  const FORMATS = [
    { value: '{v}', text: '값만' },
    { value: '{c}{v}', text: '이름+값' },
    { value: '{c}_{v}', text: '이름_값' },
  ];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let presets = null;

  function presetBar() {
    presets = presets || LMPresets.load();
    const options = presets.presets.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
    return `
      <div class="row preset-bar">
        <select id="preset-select"><option value="">프리셋 선택…</option>${options}</select>
        <button data-action="preset-apply">적용</button>
        <button data-action="preset-save">현재 구성을 프리셋으로 저장</button>
        <button data-action="preset-delete">삭제</button>
      </div>
      ${presets.corrupt ? '<p class="warn">presets.json이 깨져 있어 비웠습니다 (원본은 presets.json.bak).</p>' : ''}`;
  }

  // 두 칸이 똑같이 생겨서 무엇이 무엇인지 알 수 없다. 제목 줄을 붙인다.
  function valueRows(c) {
    const head = c.values.length ? `
      <div class="row value-head">
        <span class="v-col">값 이름</span>
        <span class="v-col">파일명에 쓸 글자 <span class="hint">(비우면 빠짐)</span></span>
        <span class="v-del"></span>
      </div>` : '';
    return head + c.values.map(v => `
      <div class="row value-row" data-value="${esc(v.id)}">
        <input class="v-name" data-field="name" value="${esc(v.name)}" placeholder="값 이름">
        <input class="v-label" data-field="label" value="${esc(v.label)}" placeholder="비우면 파일명에서 빠짐">
        <button data-action="value-delete" title="값 삭제">×</button>
      </div>`).join('');
  }

  // 이름·라벨·형식이 파일명에서 어떻게 보이는지 그 자리에서 보여준다.
  function exampleLine(c) {
    if (!c.values.length) return '';
    const shown = c.values.slice(0, 4).map(v => LMCore.naming.token(c, v) || '(생략)');
    const more = c.values.length > 4 ? ', …' : '';
    return `<div class="example">→ 파일명에 이렇게 들어갑니다: <code>${esc(shown.join(', ') + more)}</code></div>`;
  }

  function categoryBlock(c, i, n) {
    const formats = FORMATS.map(f => `<option value="${esc(f.value)}" ${c.labelFormat === f.value ? 'selected' : ''}>${esc(f.text)}</option>`).join('');
    return `
      <div class="category" data-category="${esc(c.id)}">
        <div class="row cat-head">
          <span class="dot" style="background:${LMColors.hex(c.color)}"></span>
          <input class="c-name" data-field="name" value="${esc(c.name)}" placeholder="카테고리 이름">
          <select data-field="labelFormat" title="값이 파일명에 어떤 모양으로 들어갈지">${formats}</select>
          <label title="이 단계에서 폴더로 묶기"><input type="checkbox" data-field="folder" ${c.folder ? 'checked' : ''}> 폴더</label>
          <button data-action="cat-up" ${i === 0 ? 'disabled' : ''}>▲</button>
          <button data-action="cat-down" ${i === n - 1 ? 'disabled' : ''}>▼</button>
          <button data-action="cat-delete" title="카테고리 삭제">×</button>
        </div>
        <div class="values">
          ${valueRows(c)}
          <div class="row">
            <button data-action="value-add">값 추가</button>
            <span class="range">범위 <input class="range-from" type="number" value="1" style="width:4em"> ~ <input class="range-to" type="number" value="5" style="width:4em">
            <button data-action="value-range">범위로 값 만들기</button></span>
          </div>
          ${exampleLine(c)}
        </div>
      </div>`;
  }

  function render(el) {
    const cats = LMState.docData.categories;
    el.innerHTML = presetBar() + cats.map((c, i) => categoryBlock(c, i, cats.length)).join('') +
      `<div class="row"><button data-action="cat-add">카테고리 추가</button></div>`;
  }

  // 저장이 끝난 뒤에 다시 그린다. 저장을 기다리지 않고 그리면 blur→change 로
  // 들어온 경우 mousedown 과 mouseup 사이에서 innerHTML 이 갈려 그 클릭이 사라진다.
  async function commit() {
    await LMApp.saveDocData();
    return LMApp.render();
  }

  function findCategory(target) {
    const block = target.closest('[data-category]');
    if (!block) return null;
    return LMState.docData.categories.find(c => c.id === block.dataset.category) || null;
  }

  // 리스너는 동기로 두고 비동기 본문을 따로 부른다. commit()이 async 라서
  // 어느 경로에서든 거부가 처리되지 않은 채 새지 않게 여기서 한 번에 받는다 (컨벤션 #2).
  document.addEventListener('click', e => {
    const btn = e.target.closest('#tab-categories [data-action]');
    if (!btn) return;
    onClick(btn).catch(err => LMApp.status(err.message));
  });

  async function onClick(btn) {
    const cats = LMState.docData.categories;
    const c = findCategory(btn);
    const idx = c ? cats.indexOf(c) : -1;
    switch (btn.dataset.action) {
      case 'cat-add': cats.push(LMApp.newCategory()); return commit();
      case 'cat-delete': {
        if (!confirm(`카테고리 "${c.name}"를 지웁니다. 이 카테고리를 참조하는 마크도 지워집니다.`)) return;
        LMApp.removeMarksFor(c.id, null);
        cats.splice(idx, 1);
        LMState.docData.excluded = LMState.docData.excluded.map(x => { const y = Object.assign({}, x); delete y[c.id]; return y; }).filter(x => Object.keys(x).length);
        return commit();
      }
      case 'cat-up': if (idx > 0) { cats.splice(idx - 1, 0, cats.splice(idx, 1)[0]); return commit(); } return;
      case 'cat-down': if (idx < cats.length - 1) { cats.splice(idx + 1, 0, cats.splice(idx, 1)[0]); return commit(); } return;
      case 'value-add': c.values.push(LMApp.newValue(String(c.values.length))); return commit();
      case 'value-range': {
        const block = btn.closest('[data-category]');
        const from = parseInt(block.querySelector('.range-from').value, 10);
        const to = parseInt(block.querySelector('.range-to').value, 10);
        if (isNaN(from) || isNaN(to) || to < from) return LMApp.status('범위가 잘못됐습니다.');
        for (let n = from; n <= to; n++) c.values.push(LMApp.newValue(n));
        return commit();
      }
      case 'value-delete': {
        const row = btn.closest('[data-value]');
        const v = c.values.find(v => v.id === row.dataset.value);
        // 마킹은 되돌릴 수 없고(spec §1) 이 버튼은 편집 중인 입력칸 바로 옆에 있다.
        // 지워질 마크가 있으면 먼저 묻고, 끝난 뒤 몇 개가 바뀌었는지 알린다.
        const affected = LMApp.countMarksFor(c.id, v.id);
        if (affected && !confirm(`값 "${v.name}"을 지웁니다. 레이어 ${affected}개의 마크가 바뀝니다. 계속할까요?`)) return;
        LMApp.removeMarksFor(c.id, v.id);
        c.values.splice(c.values.indexOf(v), 1);
        LMState.docData.excluded = LMState.docData.excluded.filter(x => x[c.id] !== v.id);
        LMApp.status(affected ? `값 "${v.name}" 삭제 — 레이어 ${affected}개의 마크가 바뀌었습니다.` : `값 "${v.name}" 삭제`);
        return commit();
      }
      case 'preset-apply': {
        const id = document.getElementById('preset-select').value;
        const p = presets.presets.find(p => p.id === id);
        if (!p) return LMApp.status('프리셋을 고르세요.');
        if (Object.keys(LMState.docData.marks).length && !confirm('프리셋을 적용하면 현재 문서의 마크가 전부 지워집니다. 계속할까요?')) return;
        LMState.docData.categories = JSON.parse(JSON.stringify(p.categories));
        LMState.docData.marks = {};
        LMState.docData.excluded = [];
        return commit();
      }
      case 'preset-save': {
        const name = prompt('프리셋 이름', LMState.docData.baseName || '');
        if (!name) return;
        const existing = presets.presets.find(p => p.name === name);
        const copy = JSON.parse(JSON.stringify(cats));
        if (existing) existing.categories = copy; else presets.presets.push({ id: LMApp.uid('p'), name, categories: copy });
        try { LMPresets.save(presets); LMApp.status(`프리셋 "${name}" 저장`); } catch (err) { LMApp.status(err.message); }
        return LMApp.render();
      }
      case 'preset-delete': {
        const id = document.getElementById('preset-select').value;
        const p = presets.presets.find(p => p.id === id);
        if (!p || !confirm(`프리셋 "${p.name}"을 지울까요?`)) return;
        presets.presets.splice(presets.presets.indexOf(p), 1);
        try { LMPresets.save(presets); } catch (err) { LMApp.status(err.message); }
        return LMApp.render();
      }
    }
  }

  document.addEventListener('change', e => {
    const input = e.target.closest('#tab-categories [data-field]');
    if (!input) return;
    onChange(input).catch(err => LMApp.status(err.message));
  });

  async function onChange(input) {
    const c = findCategory(input);
    const row = input.closest('[data-value]');
    const target = row ? c.values.find(v => v.id === row.dataset.value) : c;
    const field = input.dataset.field;
    if (row && field === 'name') {
      // 라벨이 이름과 같았으면(따로 고친 적 없음) 이름을 따라간다.
      const old = target.name;
      target.name = input.value;
      if (target.label === old) target.label = input.value;
    } else if (input.type === 'checkbox') {
      target[field] = input.checked;
    } else {
      target[field] = input.value;
    }
    return commit();
  }

  return { render, reloadPresets: () => { presets = null; } };
})();
