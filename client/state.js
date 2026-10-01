// 패널 상태와 문서 데이터 생성/변경 도우미. 렌더는 ui/*.js, 호스트 호출은 host-bridge.js.
const LMState = {
  docInfo: null,      // LM.getDocInfo()
  docData: null,      // spec §4.3
  docKey: null,       // 문서 동일성 (path, 없으면 name). 바뀌면 세션 상태를 비운다
  layers: [],         // LM.getLayers()
  selectedIds: [],    // 선택된 layerId
  collapsed: new Set(), // 접힌 그룹 id
  include: {},        // 부분 출력 {categoryId: valueId[]} (세션)
  combo: {},          // 레이어 탭에서 고른 조합 {categoryId: valueId} (세션)
  anchorId: null,     // Shift 범위 선택의 시작 행 id
  previews: {},       // 포토샵 미리보기 {docKey: {snapshot: {layerId: visible}, touched: [layerId], combo: 반영한 조합}} (세션)
  echoUntil: 0,       // 이 시각(ms) 전까지는 포토샵 이벤트를 패널 자신의 메아리로 보고 무시
  renderedTab: null,  // 직전에 그린 탭 (스크롤 복원 판단용)
  tab: 'categories',
  exporting: false,
  abort: false,
  progress: null,     // {done, total, current}
  summary: null,      // {done, failures:[{path,error}]}
};

const LMApp = {
  uid(prefix) { return prefix + '_' + Math.random().toString(36).slice(2, 8); },

  newDocData(baseName) {
    return { version: 2, baseName: baseName || '', delimiter: '_', destination: '', categories: [], combos: [], excluded: [] };
  },

  newCategory() {
    const used = new Set(LMState.docData.categories.map(c => c.color));
    const color = LMColors.ORDER.find(c => !used.has(c)) || 'gray';
    return { id: this.uid('c'), name: '', color, labelFormat: '{v}', folder: false, values: [] };
  },

  newValue(name) { return { id: this.uid('v'), name: String(name), label: String(name) }; },

  // 패널이 일으킨 포토샵 이벤트(선택·가시성 변경)는 그대로 되돌아온다. 그 메아리로
  // 레이어 목록을 통째로 다시 읽으면 클릭한 자리에서 스크롤이 튄다.
  // 300ms 동안은 main.js의 디바운스가 새로고침을 건너뛴다.
  muteEcho() { LMState.echoUntil = Date.now() + 300; },

  // 패널이 알고 있는 문서를 같이 보낸다. 호스트가 활성 문서와 다르면 거부하므로
  // docInfo가 낡았을 때 다른 문서의 XMP를 덮어쓰는 일이 없다.
  async saveDocData() {
    if (!LMState.docInfo || !LMState.docData) return;
    try {
      await LMHost.call('writeDocData', {
        doc: { name: LMState.docInfo.name, path: LMState.docInfo.path || null },
        data: LMState.docData,
      });
    } catch (e) {
      await this.refresh();
      this.status('저장 실패: ' + e.message);
    }
  },

  status(msg) {
    const el = document.getElementById('status');
    el.textContent = msg || '';
  },

  // 포토샵에서 전부 읽은 뒤 LMState에 한꺼번에 넣는다. docInfo를 먼저 바꾸고 나머지를 나중에
  // 읽으면, 그 사이의 저장이 새 문서 확인(writeDocData)을 통과해 이전 문서의 조합을 새 문서에 쓴다.
  async refresh() {
    let notice = '';
    try {
      const info = await LMHost.call('getDocInfo');
      const key = info ? (info.path || info.name) : null;
      const openKeys = info ? await LMHost.call('getOpenDocKeys') : [];
      let layers = [], selectedIds = [], docData = null, dropped = 0;
      if (info) {
        layers = await LMHost.call('getLayers');
        selectedIds = await LMHost.call('getSelectedLayerIds');
        const stored = await LMHost.call('readDocData');
        if (stored && stored.version === 1) {
          // combos spec §4.2: 메모리에서 바꾸고, XMP에는 다음 저장 때 version 2로 쓰인다.
          const m = LMCore.combos.migrate(stored);
          docData = m.data;
          dropped = m.dropped;
        } else {
          docData = stored || this.newDocData(info.name.replace(/\.[^.]+$/, ''));
        }
        // export spec §3.3: 내보내기 설정이 없는 PSD는 마지막에 쓴 설정에서 시작한다.
        docData.output = LMCore.output.normalize(docData.output || LMExportDefaults.load());
      }

      const fresh = key !== LMState.docKey;
      if (fresh) {
        // 문서가 바뀌었다. 부분 출력·조합 선택은 세션 값이라 저장되지 않으므로, 프리셋을
        // 공유하는 다른 PSD에 같은 카테고리 id로 그대로 걸리지 않게 여기서 비운다.
        LMState.include = {};
        LMState.combo = {};
        LMState.anchorId = null;
        LMState.docKey = key;
        if (dropped) notice = `변환하면서 레이어 ${dropped}개의 마크를 버렸습니다 (없는 카테고리·값 참조)`;
      }
      LMState.docInfo = info;
      LMState.layers = layers;
      LMState.selectedIds = selectedIds;
      LMState.docData = docData;
      // 닫힌 문서의 미리보기 스냅샷은 버린다 (combos spec §6.3). 미리보기가 켜진 문서로
      // 돌아왔으면 캔버스에 반영된 조합으로 선택을 되돌린다 (위에서 {}로 비웠으므로).
      LMPreview.prune(openKeys);
      if (fresh && key && LMState.previews[key]) LMState.combo = Object.assign({}, LMState.previews[key].combo);
      // 조합 선택(미리보기 기억에서 되돌린 것 포함)에 지금 없는 카테고리·값 키가 남지 않게 한다.
      if (docData) LMState.combo = LMCore.combos.cleanWhen(LMState.combo, docData.categories);
      this.status(notice);
    } catch (e) {
      this.status(e.message);
    }
    this.render();
  },

  render() {
    // innerHTML을 갈아끼우면 스크롤 컨테이너(main)가 맨 위로 돌아간다. 같은 탭을
    // 다시 그리는 경우에만 위치를 되돌린다. 내용이 짧아졌으면 브라우저가 최대치로
    // 알아서 잘라 주므로 따로 계산하지 않는다.
    const main = document.querySelector('main');
    const keep = LMState.renderedTab === LMState.tab ? main.scrollTop : 0;
    document.getElementById('doc-name').textContent = LMState.docInfo ? LMState.docInfo.name : '문서 없음';
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === LMState.tab));
    document.querySelectorAll('main .tab').forEach(s => s.classList.toggle('active', s.id === 'tab-' + LMState.tab));
    // 레이어 탭은 고정 영역 + 트리만 스크롤 (combos spec §6.2). main 자체는 스크롤하지 않는다.
    main.classList.toggle('fill', LMState.tab === 'layers' && !!LMState.docData);
    const el = document.getElementById('tab-' + LMState.tab);
    if (!LMState.docInfo || !LMState.docData) el.innerHTML = '<p class="hint">포토샵에서 문서를 열면 여기에 표시됩니다.</p>';
    else LMUI[LMState.tab].render(el);
    LMState.renderedTab = LMState.tab;
    main.scrollTop = keep;
  },
};

const LMUI = {};
