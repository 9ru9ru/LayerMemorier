// 패널 미리보기 (independent preview spec §4.2·§4.4): 레이어 탭 왼쪽에 지금 고른 조합을
// 포토샵이 실제로 합쳐 그린 그림(LM.renderPreview)으로 보여 준다. 렉이 있을 수 있어 토글로 켜고 끈다.
const LMPanelPreview = (() => {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const KEY_ON = 'lm.panelPreview';
  const KEY_SPLIT = 'lm.previewSplit';
  const MAX_SIZE = 1024;
  const MESSAGES = {
    LM_REDO_PENDING: '다시 실행할 단계가 있어 미리보기를 미룹니다 (작업을 하나 하거나 다시 그리기)',
  };

  const cache = LMCore.previewCache.createCache(20);
  const scheduler = LMCore.previewCache.createScheduler(draw);
  // localStorage가 막힌 환경(throw)에서도 세션 동안은 기억한다.
  const memory = {};
  let signature = null;
  let wanted = null;   // 지금 보여야 할 그림의 캐시 키. 늦게 끝난 이전 그리기가 덮어쓰지 않게 한다.
  const state = { path: '', label: '', busy: false, error: '' };

  function read(key) {
    try {
      const v = localStorage.getItem(key);
      if (v != null) return v;
    } catch (e) { /* 메모리 값으로 */ }
    return memory[key] != null ? memory[key] : null;
  }

  function write(key, value) {
    memory[key] = String(value);
    try { localStorage.setItem(key, String(value)); } catch (e) { /* 메모리에만 */ }
  }

  function isOn() { return read(KEY_ON) === '1'; }
  function setOn(on) { write(KEY_ON, on ? '1' : '0'); }
  function ratio() { return Number(read(KEY_SPLIT)) || 0.4; }
  function setRatio(r) { write(KEY_SPLIT, r); }

  function message(e) {
    const m = /LM_[A-Z0-9_]+/.exec(e.message);
    return m && MESSAGES[m[0]] ? MESSAGES[m[0]] : e.message;
  }

  // 포토샵 미리보기와 같은 배리에이션(전체인 카테고리는 첫 값), 내보내기와 같은 표시 규칙.
  function target() {
    const d = LMState.docData;
    const v = LMCore.combos.previewVariation(LMState.combo, d.categories);
    if (!v) return null;
    const visible = new Set(LMCore.combos.visibleLayerIds(d.combos, LMState.layers, v));
    const all = LMState.layers.map(l => l.id);
    const on = all.filter(id => visible.has(id));
    // 같은 레이어 구조에서 그림은 켜진 레이어로 정해진다 (구조가 바뀌면 onRefresh가 캐시를 비운다).
    return { on, off: all.filter(id => !visible.has(id)), key: on.join(','), label: LMCore.combos.comboName(v, d.categories), docKey: LMState.docKey };
  }

  function show(path, label) {
    state.path = path;
    state.label = label;
    state.error = '';
    paint();
  }

  // 지금 조합을 보여 준다. 캐시에 있으면 바로, 없으면 그리기를 예약한다 (마지막 요청만).
  // 레이어 탭이 안 보이면 그리지 않는다. 레이어 탭으로 돌아올 때 LMApp.render가 다시 부른다 (#6).
  function request(force) {
    if (!isOn() || !LMState.docData || LMState.exporting || LMState.tab !== 'layers') return Promise.resolve();
    const t = target();
    if (!t) {
      wanted = null;
      state.path = '';
      state.error = '값이 없는 카테고리가 있어 미리보기를 할 수 없습니다';
      paint();
      return Promise.resolve();
    }
    wanted = t.key;
    if (force) cache.delete(t.key);
    const hit = cache.get(t.key);
    if (hit) { show(hit, t.label); return Promise.resolve(); }
    state.label = t.label;
    return scheduler.request(t);
  }

  async function draw(t) {
    if (LMState.exporting || !isOn() || !LMState.docInfo) return;
    const hit = cache.get(t.key);
    if (hit) { if (t.key === wanted) show(hit, t.label); return; }
    // 기다리는 사이 다른 조합으로 넘어갔으면 아무도 안 볼 그림이다. 큰 문서에서 몇 초씩 포토샵을 막지 않는다.
    if (t.key !== wanted) return;
    state.busy = true;
    paint();
    const doc = { name: LMState.docInfo.name, path: LMState.docInfo.path || null };
    // 가시성 적용·복제본 만들고 닫기·히스토리 정리가 일으키는 이벤트는 패널 자신의 메아리다.
    // 문서 전환·닫기 이벤트는 muteEcho로 걸러지지 않으므로 그리는 동안과 직후 잠깐은 무시한다 (main.js).
    LMApp.muteEcho();
    LMState.previewing = true;
    try {
      const r = await LMHost.call('renderPreview', { doc, on: t.on, off: t.off, maxSize: MAX_SIZE });
      // 그리는 사이 문서가 바뀌었으면 버린다. 레이어 id는 문서마다 겹쳐 같은 캐시 키가 될 수 있다 (#3).
      if (t.docKey !== LMState.docKey) return;
      cache.set(t.key, r.path);
      if (t.key === wanted) { state.path = r.path; state.error = ''; }
    } catch (e) {
      if (t.key === wanted && t.docKey === LMState.docKey) state.error = message(e);
    } finally {
      LMState.previewing = false;
      LMState.previewQuietUntil = Date.now() + 500;
      LMApp.muteEcho();
      state.busy = false;
      paint();
    }
  }

  // 새로고침 뒤: 문서가 바뀌었거나 레이어 구조가 바뀌었을 때만 다시 그린다.
  // 레이어 선택·눈 변경은 그림에 영향이 없다 (표시 규칙이 PSD 눈과 무관).
  function onRefresh(fresh) {
    if (fresh) {
      cache.clear();
      signature = null;
      wanted = null;
      state.path = '';
      state.label = '';
      state.error = '';
    }
    if (!LMState.docData) return Promise.resolve();
    const sig = LMCore.combos.layerSignature(LMState.layers);
    if (sig === signature) return Promise.resolve();
    signature = sig;
    cache.clear();
    return request(false);
  }

  function fileUrl(p) {
    return 'file:///' + encodeURI(String(p).replace(/\\/g, '/').replace(/^\/+/, ''));
  }

  function paneHtml() {
    const img = state.path && !state.error ? `<img src="${esc(fileUrl(state.path))}" alt="">` : '';
    const err = state.error ? `<p class="err">${esc(state.error)}</p>` : '';
    const busy = state.busy ? '<div class="pv-busy">그리는 중…</div>' : '';
    return `<div class="pv-pane"><div class="pv-head"><span class="pv-label" title="${esc(state.label)}">${esc(state.label)}</span>` +
      `<button data-action="pv-redraw" title="붓질처럼 포토샵이 패널에 알리지 않는 변경을 반영합니다">다시 그리기</button></div>` +
      `<div class="pv-body${state.busy ? ' busy' : ''}">${img}${err}${busy}</div></div>`;
  }

  // 레이어 탭 전체를 다시 그리지 않고 그림 영역만 바꾼다 (트리 스크롤·선택을 건드리지 않음).
  function paint() {
    const el = document.querySelector('#tab-layers .pv-pane');
    if (el && el.parentNode) el.outerHTML = paneHtml();
  }

  return { isOn, setOn, ratio, setRatio, request, onRefresh, paneHtml, state };
})();
