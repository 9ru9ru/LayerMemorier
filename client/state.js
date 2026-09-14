// 패널 상태와 문서 데이터 생성/변경 도우미. 렌더는 ui/*.js, 호스트 호출은 host-bridge.js.
const LMState = {
  docInfo: null,      // LM.getDocInfo()
  docData: null,      // spec §4.3
  layers: [],         // LM.getLayers()
  selectedIds: [],    // 선택된 layerId
  collapsed: new Set(), // 접힌 그룹 id
  include: {},        // 부분 출력 {categoryId: valueId[]} (세션)
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

  async saveDocData() {
    if (!LMState.docInfo || !LMState.docData) return;
    try { await LMHost.call('writeDocData', LMState.docData); }
    catch (e) { this.status('저장 실패: ' + e.message); }
  },

  status(msg) {
    const el = document.getElementById('status');
    el.textContent = msg || '';
  },

  async refresh() {
    try {
      const info = await LMHost.call('getDocInfo');
      LMState.docInfo = info;
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
    document.getElementById('doc-name').textContent = LMState.docInfo ? LMState.docInfo.name : '문서 없음';
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === LMState.tab));
    document.querySelectorAll('main .tab').forEach(s => s.classList.toggle('active', s.id === 'tab-' + LMState.tab));
    const el = document.getElementById('tab-' + LMState.tab);
    if (!LMState.docInfo || !LMState.docData) { el.innerHTML = '<p class="hint">포토샵에서 문서를 열면 여기에 표시됩니다.</p>'; return; }
    LMUI[LMState.tab].render(el);
  },
};

const LMUI = {};
