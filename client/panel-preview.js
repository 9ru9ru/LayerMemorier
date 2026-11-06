// 패널 미리보기 (independent preview spec §4.2·§4.4): 레이어 탭 왼쪽에 지금 고른 조합을
// 포토샵이 실제로 합쳐 그린 그림(LM.renderPreview)으로 보여 준다. 렉이 있을 수 있어 토글로 켜고 끈다.
const LMPanelPreview = (() => {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const KEY_ON = 'lm.panelPreview';
  const KEY_SPLIT = 'lm.previewSplit';
  const KEY_PERCENT = 'lm.previewPercent';
  // 원본 대비 %. 낮을수록 줄이기·저장이 빨라진다. 합치기는 항상 원본 크기라 그 시간은 그대로다 (host.jsx renderPreview).
  const DEFAULT_PERCENT = 10;
  // 빠른 그리기: 레이어별 축소 그림을 패널에서 합친다. 내보낼 그림과 조금 다를 수 있다.
  const KEY_FAST = 'lm.previewFast';
  const BATCH_MS = 800;  // 호스트가 한 번에 쓰는 시간. 사이사이 포토샵이 입력을 받는다.
  const PAUSE_MS = 60;
  const HOVER_MS = 1500;
  const PREP_PAUSE_MS = 150; // 전체 준비: 호출 사이에 쉬는 시간
  const PREP_SLICE = 200;    // 전체 준비: 한 번에 넘기는 그림 수 (호스트는 BATCH_MS가 지나면 먼저 멈춘다)
  const MESSAGES = {
    LM_REDO_PENDING: '다시 실행할 단계가 있어 미리보기를 미룹니다 (작업을 하나 하거나 다시 그리기)',
  };

  const cache = LMCore.previewCache.createCache(20);
  const scheduler = LMCore.previewCache.createScheduler(draw);
  // localStorage가 막힌 환경(throw)에서도 세션 동안은 기억한다.
  const memory = {};
  let signature = null;
  let wanted = null;   // 지금 보여야 할 그림의 캐시 키. 늦게 끝난 이전 그리기가 덮어쓰지 않게 한다.
  const state = { path: '', label: '', busy: false, error: '', ms: null, progress: '' };
  // 그림 파일 경로만 기억하고, 메모리에는 합칠 때 필요한 그림만 올린다 (전체 준비로 수천 장이 될 수 있다).
  const pictures = LMCore.previewCache.createCache(50000); // 그림 키 → 파일 경로
  const latest = LMCore.previewCache.createCache(50000);   // 레이어 묶음 → 마지막 파일. 새 그림이 올 때까지 대신 보여 준다.
  const images = LMCore.previewCache.createCache(300);     // 파일 경로 → {ready}
  let prep = null;       // 진행 중인 전체 준비 {units, docKey, startedAt, extracted, left}
  let hostCalls = 0;     // 진행 중인 레이어 그림 호출 수 (LMState.previewing)
  let generations = {};  // 레이어 id → 바뀐 횟수. 키에 들어가므로 올리면 그 레이어가 든 그림을 다시 뽑는다.
  let generationAll = 0;
  let mark = null;       // 마지막으로 본 히스토리 상태
  let lastSelected = [];
  let canvas = null;
  let hoverAt = 0;

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
  function isFast() { return read(KEY_FAST) === '1'; }
  function setFast(on) { write(KEY_FAST, on ? '1' : '0'); }
  function percent() {
    const p = LMCore.previewCache.clampPercent(read(KEY_PERCENT));
    return p == null ? DEFAULT_PERCENT : p;
  }
  function setPercent(p) { write(KEY_PERCENT, p); }
  function sizeAt(p) { return LMCore.previewCache.previewSize(p, LMState.docInfo.width, LMState.docInfo.height); }
  function sizeText(p) {
    const s = sizeAt(p);
    return `${s.width}×${s.height}px`;
  }

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
    // 같은 레이어 구조에서 그림은 화질과 켜진 레이어로 정해진다 (구조가 바뀌면 onRefresh가 캐시를 비운다).
    const size = sizeAt(percent());
    const maxSize = size.maxSize;
    const label = LMCore.combos.comboName(v, d.categories);
    if (isFast()) {
      const nodes = LMCore.layerComposite.buildPlan(LMState.layers, on);
      return { fast: true, size, maxSize, nodes, units: LMCore.layerComposite.planUnits(nodes), key: 'fast|' + maxSize + '|' + on.join(','), label, docKey: LMState.docKey };
    }
    return { on, off: all.filter(id => !visible.has(id)), maxSize, key: maxSize + '|' + on.join(','), label, docKey: LMState.docKey };
  }

  function show(path, label) {
    state.path = path;
    state.label = label;
    state.error = '';
    state.ms = null; // 캐시에서 꺼낸 그림은 그리는 데 걸린 시간이 없다.
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
    if (t.fast) return requestFast(t, force);
    if (force) cache.delete(t.key);
    const hit = cache.get(t.key);
    if (hit) { show(hit, t.label); return Promise.resolve(); }
    state.label = t.label;
    return scheduler.request(t);
  }

  // ---- 빠른 그리기 ----

  function pictureKey(maxSize, ids) {
    return maxSize + '|' + generationAll + '|' + ids.map(id => id + '.' + (generations[id] || 0)).join('+');
  }

  function missing(t) {
    return t.units.filter(u => !pictures.get(pictureKey(t.maxSize, u.ids)));
  }

  function loadPicture(path) {
    const img = new Image();
    const ready = new Promise(resolve => {
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
    });
    img.src = fileUrl(path);
    return { ready };
  }

  function imageAt(path) {
    let image = images.get(path);
    if (!image) {
      image = loadPicture(path);
      images.set(path, image);
    }
    return image;
  }

  // 가시성 적용·복제본이 일으키는 이벤트는 패널 자신의 메아리다 (draw와 같은 이유).
  async function callPictures(maxSize, units) {
    const doc = { name: LMState.docInfo.name, path: LMState.docInfo.path || null };
    hostCalls++;
    LMState.previewing = true;
    LMApp.muteEcho();
    try {
      return await LMHost.call('renderLayerPictures', {
        doc, all: LMState.layers.map(l => l.id), maxSize, budgetMs: BATCH_MS,
        units: Array.from(units, ([key, ids]) => ({ key, on: LMCore.layerComposite.unitOnIds(ids, LMState.layers) })),
      });
    } finally {
      hostCalls--;
      LMState.previewing = hostCalls > 0;
      LMState.previewQuietUntil = Date.now() + 500;
      LMApp.muteEcho();
    }
  }

  function keepPictures(units, r) {
    for (const d of r.done) {
      pictures.set(d.key, d.path);
      if (units.has(d.key)) latest.set(units.get(d.key).join('+'), d.path);
    }
    // 뽑는 동안 생긴 히스토리 번호 변화는 작업자의 수정이 아니다.
    if (sameMark(mark, r.before)) mark = r.after;
  }

  function newCanvas(size) {
    const c = document.createElement('canvas');
    c.width = size.width;
    c.height = size.height;
    return c;
  }

  function attachCanvas() {
    const slot = document.querySelector('#tab-layers .pv-canvas-slot');
    if (slot && canvas) slot.appendChild(canvas);
  }

  // 지금 있는 그림으로 바로 합친다. 없는 그림은 건너뛰고, 이전 그림이 있으면 그것을 쓴다.
  async function compose(t) {
    const paths = t.units.map(u => pictures.get(pictureKey(t.maxSize, u.ids)) || latest.get(u.ids.join('+')));
    const imgs = await Promise.all(paths.map(p => (p ? imageAt(p).ready : null)));
    if (t.key !== wanted || !isFast()) return;
    if (!canvas) canvas = newCanvas(t.size);
    if (canvas.width !== t.size.width) canvas.width = t.size.width;
    if (canvas.height !== t.size.height) canvas.height = t.size.height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const byUnit = new Map(t.units.map((u, i) => [u, imgs[i]]));
    LMCore.layerComposite.drawNodes(ctx, t.nodes, n => byUnit.get(n), () => newCanvas(t.size));
    attachCanvas();
  }

  function sameMark(a, b) {
    if (!a || !b) return false;
    if (a.id != null && b.id != null) return a.id === b.id;
    return a.index === b.index && a.count === b.count && a.name === b.name;
  }

  // 히스토리가 움직였으면 바뀌었을 레이어의 그림을 버린다. 붓질은 패널에 이벤트가 오지 않아 이렇게 알아챈다.
  // 앞으로 나아갔으면 그동안 선택돼 있던 레이어, 뒤로 갔으면 어느 레이어인지 모르므로 전부.
  async function checkChanges(fromRefresh) {
    if (LMState.previewing || LMState.exporting) return false;
    let now = null;
    try { now = await LMHost.call('getHistoryMark'); } catch (e) { return false; }
    const before = mark;
    const selectedBefore = lastSelected;
    mark = now;
    lastSelected = LMState.selectedIds.slice();
    if (!before || !now || sameMark(before, now)) return false;
    if (now.index < before.index) generationAll++;
    else for (const id of new Set(selectedBefore.concat(lastSelected))) generations[id] = (generations[id] || 0) + 1;
    // 블렌드 모드가 바뀌어도 패널에 이벤트가 오지 않으므로 레이어 정보도 다시 읽는다.
    if (!fromRefresh) await LMApp.refresh();
    return true;
  }

  async function requestFast(t, force) {
    state.label = t.label;
    state.error = '';
    state.path = '';
    state.ms = null;
    if (force) for (const u of t.units) for (const id of u.ids) generations[id] = (generations[id] || 0) + 1;
    paint();
    await compose(t);
    if (!force && await checkChanges(false)) return request(false);
    return missing(t).length ? scheduler.request(t) : undefined;
  }

  // 없는 그림을 나눠서 뽑는다. 사이사이 포토샵이 입력을 받고, 다른 조합으로 넘어가면 멈춘다.
  async function drawFast(t) {
    let ms = 0;
    while (t.key === wanted && t.docKey === LMState.docKey && !LMState.exporting && isOn() && isFast()) {
      const todo = missing(t);
      if (!todo.length) break;
      state.progress = `${t.units.length - todo.length}/${t.units.length}`;
      paint();
      const units = new Map(todo.map(u => [pictureKey(t.maxSize, u.ids), u.ids]));
      let r = null;
      try {
        r = await callPictures(t.maxSize, units);
      } catch (e) {
        if (/active document changed/.test(e.message)) LMApp.refresh();
        else if (t.key === wanted) state.error = message(e);
        break;
      }
      if (t.docKey !== LMState.docKey) break;
      keepPictures(units, r);
      ms += r.ms;
      await compose(t);
      if (!r.done.length) break;
      await new Promise(resolve => setTimeout(resolve, PAUSE_MS));
    }
    state.progress = '';
    state.ms = ms && t.key === wanted && !state.error ? ms : null;
    paint();
  }

  // ---- 전체 준비: 버튼을 누르면 모든 레이어의 그림을 미리 뽑는다 ----

  function allUnits() {
    const d = LMState.docData;
    const seen = new Set();
    const sets = [];
    for (const v of LMCore.variation.enumerate(d.categories)) {
      const ids = LMCore.combos.visibleLayerIds(d.combos, LMState.layers, v);
      const key = ids.join(',');
      if (!seen.has(key)) {
        seen.add(key);
        sets.push(ids);
      }
    }
    return LMCore.layerComposite.preloadUnits(LMState.layers, sets);
  }

  function prepText(job) {
    const total = job.units.length;
    const done = `${total - job.left}/${total}`;
    if (!job.extracted || !job.left) return done;
    const ms = (Date.now() - job.startedAt) / job.extracted * job.left;
    return `${done} · 약 ${ms < 60000 ? `${Math.ceil(ms / 1000)}초` : `${Math.ceil(ms / 60000)}분`} 남음`;
  }

  function showPrepProgress(job) {
    const el = document.querySelector('#tab-layers .pv-prep-progress');
    if (el) el.textContent = prepText(job);
  }

  function isPreparing() { return prep !== null; }

  function cancelPrepare() {
    if (!prep) return;
    prep = null;
    LMApp.status('전체 준비를 취소했습니다. 뽑아 둔 그림은 그대로 쓰고, 다시 누르면 나머지만 뽑습니다.');
    LMApp.render();
  }

  // 화질을 바꾸거나 원본을 고쳐 다시 필요해진 그림도 반복마다 다시 세어 함께 뽑는다.
  async function prepareAll() {
    if (prep || !isFast() || !isOn() || !LMState.docInfo || !LMState.docData || LMState.exporting) return;
    const job = { units: allUnits(), docKey: LMState.docKey, startedAt: Date.now(), extracted: 0, left: 0 };
    job.left = job.units.length;
    prep = job;
    LMApp.render();
    // 고친 직후에 눌러도 고친 레이어를 다시 뽑는다.
    await checkChanges(false);
    let stopped = '';
    while (prep === job) {
      if (LMState.exporting || !isOn() || !isFast()) { stopped = '내보내기나 설정 변경으로 멈췄습니다'; break; }
      const maxSize = sizeAt(percent()).maxSize;
      const todo = job.units.filter(ids => !pictures.get(pictureKey(maxSize, ids)));
      job.left = todo.length;
      showPrepProgress(job);
      if (!todo.length) break;
      const units = new Map(todo.slice(0, PREP_SLICE).map(ids => [pictureKey(maxSize, ids), ids]));
      let r = null;
      try {
        r = await callPictures(maxSize, units);
      } catch (e) {
        if (/active document changed/.test(e.message)) LMApp.refresh();
        stopped = message(e);
        break;
      }
      if (job.docKey !== LMState.docKey) break;
      keepPictures(units, r);
      job.extracted += r.done.length;
      if (!r.done.length) { stopped = '그림을 뽑지 못했습니다'; break; }
      if (todo.length > r.done.length) await new Promise(resolve => setTimeout(resolve, PREP_PAUSE_MS));
    }
    if (prep !== job) return; // 취소했거나 문서가 바뀌었다.
    prep = null;
    if (stopped) {
      // 다시 그리면 같은 이유로 또 실패한다. 상태줄의 이유를 보고 작업자가 다시 누른다.
      LMApp.status(`전체 준비를 멈췄습니다 (${stopped}). 다시 누르면 나머지만 뽑습니다.`);
      LMApp.render();
      return undefined;
    }
    LMApp.status(job.extracted ? `전체 준비 완료: 그림 ${job.extracted}장을 뽑았습니다.` : '이미 전부 준비돼 있습니다.');
    LMApp.render();
    return request(false);
  }

  // 패널에 마우스가 들어오면 그사이 수정을 반영한다 (붓질 중에는 그리지 않으려고 타이머를 쓰지 않는다).
  function onHover() {
    if (!isFast() || !isOn() || !LMState.docData || LMState.tab !== 'layers') return Promise.resolve();
    const now = Date.now();
    if (now - hoverAt < HOVER_MS) return Promise.resolve();
    hoverAt = now;
    return checkChanges(false).then(changed => (changed ? request(false) : undefined));
  }

  async function draw(t) {
    if (t.fast) return drawFast(t);
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
      const r = await LMHost.call('renderPreview', { doc, on: t.on, off: t.off, maxSize: t.maxSize });
      // 그리는 사이 문서가 바뀌었으면 버린다. 레이어 id는 문서마다 겹쳐 같은 캐시 키가 될 수 있다 (#3).
      if (t.docKey !== LMState.docKey) return;
      cache.set(t.key, r.path);
      if (t.key === wanted) { state.path = r.path; state.error = ''; state.ms = r.ms; }
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
      state.ms = null;
      state.progress = '';
      pictures.clear();
      latest.clear();
      generations = {};
      generationAll = 0;
      mark = null;
      lastSelected = [];
      prep = null;
      images.clear();
    }
    if (!LMState.docData) return Promise.resolve();
    const sig = LMCore.combos.layerSignature(LMState.layers);
    if (sig === signature) {
      if (!isFast() || !isOn() || LMState.tab !== 'layers') return Promise.resolve();
      return checkChanges(true).then(changed => (changed ? request(false) : undefined));
    }
    if (prep) prep.units = allUnits(); // 지워진 레이어를 뽑으려다 멈추지 않게 한다.
    signature = sig;
    cache.clear();
    return request(false);
  }

  function fileUrl(p) {
    return 'file:///' + encodeURI(String(p).replace(/\\/g, '/').replace(/^\/+/, ''));
  }

  function paneHtml() {
    const img = isFast() ? '<div class="pv-canvas-slot"></div>' : state.path && !state.error ? `<img src="${esc(fileUrl(state.path))}" alt="">` : '';
    const err = state.error ? `<p class="err">${esc(state.error)}</p>` : '';
    const busy = state.busy ? '<div class="pv-busy">그리는 중…</div>' : '';
    const time = state.progress
      ? `<span class="pv-time" title="레이어 그림을 준비하고 있습니다. 그동안 포토샵을 쓸 수 있습니다">준비 중 ${esc(state.progress)}</span>`
      : state.ms != null && !state.busy && !state.error
        ? `<span class="pv-time" title="이 그림을 그리는 데 걸린 시간">${(state.ms / 1000).toFixed(1)}초</span>` : '';
    return `<div class="pv-pane"><div class="pv-head"><span class="pv-label" title="${esc(state.label)}">${esc(state.label)}</span>${time}` +
      `<button data-action="pv-redraw" title="붓질처럼 포토샵이 패널에 알리지 않는 변경을 반영합니다">다시 그리기</button></div>` +
      `<div class="pv-body${state.busy ? ' busy' : ''}">${img}${err}${busy}</div></div>`;
  }

  function prepareHtml() {
    if (!isFast()) return '';
    if (prep) return `<button class="pv-prepare" data-action="pv-prepare-cancel">전체 준비 취소</button><span class="pv-prep-progress hint">${esc(prepText(prep))}</span>`;
    return `<button class="pv-prepare" data-action="pv-prepare-all" title="모든 레이어의 그림을 미리 뽑아 체크가 바로 반영되게 합니다. 레이어가 많으면 오래 걸리고, 그동안 포토샵이 끊기며 임시 탭이 깜빡입니다. 자리를 비울 때 쓰세요. 화질을 바꾸거나 패널을 다시 열면 다시 해야 하고, 처음 쓰는 클리핑 조합은 그때 한 장 더 뽑습니다.">전체 준비</button>`;
  }

  function fastHtml() {
    return `<label class="preview-toggle" title="레이어별 축소 그림을 패널에서 합칩니다. 한 번 준비한 레이어는 체크가 바로 반영됩니다. 조정 레이어와 일부 블렌드는 내보낼 그림과 다를 수 있습니다.">` +
      `<input type="checkbox" class="panel-preview-fast" ${isFast() ? 'checked' : ''}> 빠르게</label>` + prepareHtml();
  }

  function qualityHtml() {
    const p = percent();
    return `<span class="preview-toggle pv-quality" title="원본 대비 크기입니다. 낮을수록 줄이고 저장하는 시간이 줄어듭니다 (합치는 시간은 그대로). 긴 변은 8192px까지입니다.">화질` +
      `<input type="range" class="pv-quality-range" min="1" max="100" step="1" value="${p}">` +
      `<input type="number" class="pv-quality-num" min="1" max="100" step="1" value="${p}">%` +
      `<span class="pv-quality-px hint">${sizeText(p)}</span></span>`;
  }

  // 슬라이더와 숫자 칸을 같은 값으로 맞춘다. skip은 지금 움직이는 칸 (치는 중인 글자를 덮어쓰지 않는다).
  function showPercent(box, p, skip) {
    const range = box.querySelector('.pv-quality-range');
    const num = box.querySelector('.pv-quality-num');
    if (range !== skip) range.value = p;
    if (num !== skip) num.value = p;
    box.querySelector('.pv-quality-px').textContent = sizeText(p);
  }

  // 레이어 탭 전체를 다시 그리지 않고 그림 영역만 바꾼다 (트리 스크롤·선택을 건드리지 않음).
  function paint() {
    const el = document.querySelector('#tab-layers .pv-pane');
    if (el && el.parentNode) el.outerHTML = paneHtml();
    attachCanvas();
  }

  return { isOn, setOn, ratio, setRatio, isFast, setFast, percent, setPercent, fastHtml, qualityHtml, showPercent, attachCanvas, onHover, isPreparing, prepareAll, cancelPrepare, request, onRefresh, paneHtml, state };
})();
