// 패널 상태와 문서 데이터 생성/변경 도우미. 렌더는 ui/*.js, 호스트 호출은 host-bridge.js.
const LMState = {
  docInfo: null,      // LM.getDocInfo()
  docData: null,      // spec §4.3
  docKey: null,       // 문서 동일성 (path, 없으면 name). 바뀌면 세션 상태를 비운다
  layers: [],         // LM.getLayers()
  selectedIds: [],    // 선택된 layerId
  collapsed: new Set(), // 접힌 그룹 id
  include: {},        // 부분 출력 {categoryId: valueId[]} (세션)
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
    return { version: 1, baseName: baseName || '', delimiter: '_', destination: '', nativeColor: true, categories: [], marks: {}, excluded: [] };
  },

  newCategory() {
    const used = new Set(LMState.docData.categories.map(c => c.color));
    const color = LMColors.ORDER.find(c => !used.has(c)) || 'gray';
    return { id: this.uid('c'), name: '', color, labelFormat: '{v}', folder: false, values: [] };
  },

  newValue(name) { return { id: this.uid('v'), name: String(name), label: String(name) }; },

  // 카테고리(valueId=null) 또는 값을 참조하는 마크 항목을 지운다 (spec §6.1)
  removeMarksFor(categoryId, valueId) {
    const marks = LMState.docData.marks;
    for (const layerId of Object.keys(marks)) {
      const mark = marks[layerId];
      if (!mark[categoryId]) continue;
      if (valueId === null) delete mark[categoryId];
      else {
        mark[categoryId] = mark[categoryId].filter(v => v !== valueId);
        if (!mark[categoryId].length) delete mark[categoryId];
      }
      if (!Object.keys(mark).length) delete marks[layerId];
    }
  },

  // removeMarksFor가 건드릴 레이어 수. 지우기 전에 확인·보고하는 데 쓴다 (spec §6.1).
  countMarksFor(categoryId, valueId) {
    const marks = LMState.docData.marks;
    return Object.keys(marks).filter(layerId => {
      const entry = marks[layerId][categoryId];
      return !!entry && (valueId === null || entry.includes(valueId));
    }).length;
  },

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

  async refresh() {
    try {
      const info = await LMHost.call('getDocInfo');
      LMState.docInfo = info;
      const key = info ? (info.path || info.name) : null;
      if (key !== LMState.docKey) {
        // 문서가 바뀌었다. 부분 출력은 세션 값이라 저장되지 않으므로, 프리셋을
        // 공유하는 다른 PSD에 같은 카테고리 id로 그대로 걸리지 않게 여기서 비운다.
        LMState.include = {};
        LMState.docKey = key;
      }
      if (!info) {
        LMState.docData = null; LMState.layers = []; LMState.selectedIds = [];
      } else {
        LMState.layers = await LMHost.call('getLayers');
        LMState.selectedIds = await LMHost.call('getSelectedLayerIds');
        const stored = await LMHost.call('readDocData');
        LMState.docData = stored || this.newDocData(info.name.replace(/\.[^.]+$/, ''));
      }
      this.status('');
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
    const el = document.getElementById('tab-' + LMState.tab);
    if (!LMState.docInfo || !LMState.docData) el.innerHTML = '<p class="hint">포토샵에서 문서를 열면 여기에 표시됩니다.</p>';
    else LMUI[LMState.tab].render(el);
    LMState.renderedTab = LMState.tab;
    main.scrollTop = keep;
  },
};

const LMUI = {};
