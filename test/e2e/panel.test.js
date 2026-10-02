'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { connect } = require('../helpers/panel');
const { psCall, psRun } = require('../helpers/ps');
const { buildFixture, docDataFor } = require('../helpers/fixture');
const { PNG } = require('pngjs');
const { visibleBounds } = require('../helpers/cells');
const { enumerate } = require('../../core/variation');
const { onLayerIds } = require('../../core/combos');
const { unionBounds } = require('../../core/output');

const PRESETS = path.join(process.env.APPDATA, 'LayerMemorier', 'presets.json');
// 내보내기 설정을 바꾸는 테스트는 마지막 설정 파일을 쓴다. 사용자의 실제 파일이 테스트에
// 섞이지 않도록 파일 전체가 시작할 때 비우고, 끝나면 되돌린다 (export plan Review Focus 4).
const EXPORT_DEFAULTS = path.join(process.env.APPDATA, 'LayerMemorier', 'export-defaults.json');
let exportDefaultsBackup = null;
before(() => {
  if (fs.existsSync(EXPORT_DEFAULTS)) {
    exportDefaultsBackup = fs.readFileSync(EXPORT_DEFAULTS);
    fs.unlinkSync(EXPORT_DEFAULTS);
  }
});
after(() => {
  if (exportDefaultsBackup) fs.writeFileSync(EXPORT_DEFAULTS, exportDefaultsBackup);
  else if (fs.existsSync(EXPORT_DEFAULTS)) fs.unlinkSync(EXPORT_DEFAULTS);
});
const clearExportDefaults = () => { if (fs.existsSync(EXPORT_DEFAULTS)) fs.unlinkSync(EXPORT_DEFAULTS); };

async function freshPanel() {
  const p = await connect();
  await p.reload();
  await p.eval('new Promise(r => { const t = setInterval(() => { if (window.LMReady) { clearInterval(t); r(true); } }, 100); })');
  return p;
}

// 저장(evalScript 왕복) + 다시 그리기가 끝나기를 기다린다.
const settle = () => new Promise(r => setTimeout(r, 700));

// 입력칸에 값을 넣고 change 를 흘려보낸다. CDP 의 evaluate 는 최상위 const 선언이
// 호출 사이에 남아 두 번째 호출에서 중복 선언 오류가 나므로 즉시 실행 함수로 감싼다.
function setField(selector, value) {
  return `(() => {
    const i = document.querySelector(${JSON.stringify(selector)});
    i.value = ${JSON.stringify(value)};
    i.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`;
}

// window.confirm / window.prompt 를 페이지 안에서 갈아끼운다.
// __confirmResult / __promptResult 로 대답을 정하고, __dialogs 에 물어본 말이 쌓인다.
async function stubDialogs(p) {
  await p.eval(`
    window.__origConfirm = window.confirm;
    window.__origPrompt = window.prompt;
    window.__dialogs = [];
    window.__confirmResult = true;
    window.__promptResult = null;
    window.confirm = msg => { window.__dialogs.push(['confirm', String(msg)]); return window.__confirmResult; };
    window.prompt = msg => { window.__dialogs.push(['prompt', String(msg)]); return window.__promptResult; };
    true`);
}

async function restoreDialogs(p) {
  await p.eval(`
    if (window.__origConfirm) window.confirm = window.__origConfirm;
    if (window.__origPrompt) window.prompt = window.__origPrompt;
    delete window.__origConfirm; delete window.__origPrompt;
    delete window.__dialogs; delete window.__confirmResult; delete window.__promptResult;
    true`);
}

// 레이어 탭 행 하나의 체크박스 상태: 'checked' | 'none'
function cbState(id) {
  return `(() => {
    const cb = document.querySelector('#tab-layers [data-layer="${id}"] .cb');
    return cb.classList.contains('checked') ? 'checked' : 'none';
  })()`;
}
const pickCombo = (categoryId, valueId) => setField(`#tab-layers select[data-combo-cat=${categoryId}]`, valueId);
const clickCb = id => `document.querySelector('#tab-layers [data-layer="${id}"] .cb').click(); true`;
function clickRow(id, mods = {}) {
  return `(() => {
    const el = document.querySelector('#tab-layers [data-layer="${id}"] .name');
    el.dispatchEvent(new MouseEvent('click', Object.assign({ bubbles: true }, ${JSON.stringify(mods)})));
    return true;
  })()`;
}
const asc = list => list.slice().sort((a, b) => a - b);
const entryOf = (combos, when) => combos.find(c => Object.keys(c.when).length === Object.keys(when).length && Object.keys(when).every(k => c.when[k] === when[k]));

test('panel boots, sees the fixture document, and applies a preset', async () => {
  const hadPresets = fs.existsSync(PRESETS);
  const backup = hadPresets ? fs.readFileSync(PRESETS) : null;

  try {
    const { byName } = buildFixture();
    const template = docDataFor(byName);
    fs.mkdirSync(path.dirname(PRESETS), { recursive: true });
    fs.writeFileSync(PRESETS, JSON.stringify({ version: 1, presets: [{ id: 'p_test', name: '테스트 프리셋', categories: template.categories }] }), 'utf8');

    const p = await freshPanel();
    try {
      assert.equal(await p.eval('LMState.docInfo.name'), 'fixture.psd');
      assert.equal(await p.eval('LMState.layers.length'), 12);
      assert.equal(await p.eval('LMState.docData.categories.length'), 0);

      await p.eval(`document.getElementById('preset-select').value = 'p_test'; document.querySelector('[data-action=preset-apply]').click(); true`);
      await new Promise(r => setTimeout(r, 500));
      assert.deepEqual(await p.eval('LMState.docData.categories.map(c => c.name)'), ['A', 'B', 'N']);
      assert.deepEqual(psCall('readDocData').categories.map(c => c.name), ['A', 'B', 'N'], 'applied preset is written to XMP');

      await p.eval(`document.querySelector('[data-action=cat-add]').click(); true`);
      assert.equal(await p.eval('LMState.docData.categories.length'), 4);
      assert.equal(await p.eval('LMState.docData.categories[3].color'), 'orange', 'next unused color');
      await p.shot('panel-categories');
    } finally {
      p.close();
    }
  } finally {
    if (hadPresets) fs.writeFileSync(PRESETS, backup);
    else if (fs.existsSync(PRESETS)) fs.unlinkSync(PRESETS);
  }
});

test('export tab: preview, exclusion, partial include, run with progress and summary', async () => {
  const DEST = path.join(__dirname, '..', 'out', 'panel-export');
  fs.rmSync(DEST, { recursive: true, force: true });
  const { byName } = buildFixture();
  psCall('writeDocData', docDataFor(byName, DEST.replace(/\\/g, '/')));
  const p = await freshPanel();
  try {
    await p.eval(`document.querySelector('#tabs [data-tab=export]').click(); true`);
    assert.equal(await p.eval(`document.querySelector('#tab-export .count').textContent`), '12');
    assert.equal(await p.eval(`document.querySelector('#tab-export [data-field=baseName]').value`), 'fx');
    assert.equal(await p.eval(`document.querySelector('#tab-export [data-field=nativeColor]')`), null, '레이어 색 옵션은 없다');

    // 제외 조합 추가: A=1, B=2 → 12 - 2 = 10
    await p.eval(`document.querySelector('#tab-export .exclude-new [data-category=cA]').value = 'a1';
                  document.querySelector('#tab-export .exclude-new [data-category=cB]').value = 'b2';
                  document.querySelector('[data-action=exclude-add]').click(); true`);
    await new Promise(r => setTimeout(r, 500));
    assert.equal(await p.eval(`document.querySelector('#tab-export .count').textContent`), '10');
    assert.deepEqual(psCall('readDocData').excluded, [{ cA: 'a1', cB: 'b2' }]);

    // 부분 출력: N=2 만 → 5
    await p.eval(`document.querySelector('#tab-export .include input[data-category=cN][data-value=n1]').click(); true`);
    assert.equal(await p.eval(`document.querySelector('#tab-export .count').textContent`), '5');

    // 실행
    await p.eval('LMUI.export.run()');
    const summary = await p.eval('LMState.summary');
    assert.equal(summary.done, 5);
    assert.deepEqual(summary.failures, []);
    const files = [];
    for (const dir of fs.readdirSync(DEST)) for (const f of fs.readdirSync(path.join(DEST, dir))) files.push(dir + '/' + f);
    assert.deepEqual(files.sort(), ['fx_A0/fx_A0_0_2.png', 'fx_A0/fx_A0_1_2.png', 'fx_A0/fx_A0_2_2.png', 'fx_A1/fx_A1_0_2.png', 'fx_A1/fx_A1_1_2.png']);
    assert.match(await p.eval(`document.querySelector('#tab-export .summary').textContent`), /5개 성공/);
    await p.shot('panel-export');
  } finally {
    p.close();
  }
});

test('export tab blocks on name conflicts', async () => {
  const { byName } = buildFixture();
  const data = docDataFor(byName);
  data.categories[1].values[1].label = '0'; // B1 라벨을 B0와 같게
  psCall('writeDocData', data);
  const p = await freshPanel();
  try {
    await p.eval(`document.querySelector('#tabs [data-tab=export]').click(); true`);
    assert.equal(await p.eval(`document.querySelector('[data-action=export-run]').disabled`), true);
    assert.match(await p.eval(`document.querySelector('#tab-export .conflicts').textContent`), /충돌/);
  } finally {
    p.close();
  }
});

// 실제 작업에서 카테고리 이름·값 라벨·출력명·출력 폴더는 전부 한글이다. 이 경로는
// evalScript 소스 문자열 안에 그대로 실려 나가므로, COM(BOM 붙은 임시 파일)로 증명한
// 왕복과는 다른 전송이다. 패널 입력칸 → XMP → 한글 폴더의 PNG 까지 한 번에 확인한다.
test('Korean survives the panel-to-host evalScript boundary and lands on disk', async () => {
  const ROOT_OUT = path.join(__dirname, '..', 'out', '한글 출력');
  const DEST = path.join(ROOT_OUT, '알싸기');
  fs.rmSync(ROOT_OUT, { recursive: true, force: true });
  buildFixture();
  const p = await freshPanel();
  try {
    // 카테고리 이름과 값 라벨을 패널 입력칸으로 넣는다.
    await p.eval(`document.querySelector('[data-action=cat-add]').click(); true`);
    await settle();
    await p.eval(setField('#tab-categories .c-name', '의상'));
    await settle();
    await p.eval(`document.querySelector('[data-action=value-add]').click(); true`);
    await settle();
    await p.eval(setField('#tab-categories .v-name', '기본의상'));
    await settle();

    // 출력명과 한글이 든 출력 폴더도 패널 입력칸으로.
    await p.eval(`document.querySelector('#tabs [data-tab=export]').click(); true`);
    await p.eval(setField('#tab-export [data-field=baseName]', '알싸기'));
    await settle();
    await p.eval(setField('#tab-export [data-field=destination]', DEST.replace(/\\/g, '/')));
    await settle();

    // XMP 에 그대로 들어갔는지 COM 으로 읽어 확인한다.
    const stored = psCall('readDocData');
    assert.equal(stored.baseName, '알싸기');
    assert.equal(stored.destination, DEST.replace(/\\/g, '/'));
    assert.deepEqual(stored.categories.map(c => c.name), ['의상']);
    assert.deepEqual(stored.categories[0].values.map(v => [v.name, v.label]), [['기본의상', '기본의상']]);

    // 한글 경로로 실제 내보내기. 폴더는 없으므로 사전 점검이 만들어야 한다.
    assert.equal(await p.eval(`document.querySelector('#tab-export .count').textContent`), '1');
    await p.eval('LMUI.export.run()');
    const summary = await p.eval('LMState.summary');
    assert.deepEqual(summary.failures, []);
    assert.equal(summary.succeeded, 1);
    assert.deepEqual(fs.readdirSync(DEST), ['알싸기_기본의상.png']);
    assert.ok(fs.statSync(path.join(DEST, '알싸기_기본의상.png')).size > 0);
  } finally {
    p.close();
  }
});

// confirm/prompt 로 막혀 있는 네 갈래(값 삭제·카테고리 삭제·프리셋 저장·마크 있는
// 문서에 프리셋 적용)를 대답을 정해 놓고 통과시킨다.
test('confirm/prompt paths: value delete, category delete, preset save, preset apply', async () => {
  const hadPresets = fs.existsSync(PRESETS);
  const backup = hadPresets ? fs.readFileSync(PRESETS) : null;

  try {
    const { byName } = buildFixture();
    psCall('writeDocData', docDataFor(byName));
    fs.mkdirSync(path.dirname(PRESETS), { recursive: true });
    fs.writeFileSync(PRESETS, JSON.stringify({ version: 1, presets: [] }), 'utf8');

    const p = await freshPanel();
    try {
      await stubDialogs(p);

      // --- 값 삭제: 그 값을 쓰는 조합이 있으면 먼저 묻고, 끝난 뒤 몇 개가 지워졌는지 알린다.
      // 레이어 탭에서 그 값을 골라 둔 상태였다면 그 선택도 같이 빠져야 한다.
      await p.eval(`LMState.combo = { cA: 'a1', cB: 'b0' }; true`);
      const valueDelete = `document.querySelector('#tab-categories [data-category=cB] [data-value=b0] [data-action=value-delete]').click(); true`;
      await p.eval(`window.__confirmResult = false; window.__dialogs = []; true`);
      await p.eval(valueDelete);
      await settle();
      assert.match(await p.eval(`window.__dialogs[0][1]`), /이 값을 쓰는 조합 1개도 지워집니다/);
      assert.equal(await p.eval(`LMState.docData.categories.find(c => c.id === 'cB').values.length`), 3, '취소하면 값이 남는다');

      await p.eval(`window.__confirmResult = true; true`);
      await p.eval(valueDelete);
      await settle();
      assert.equal(await p.eval(`LMState.docData.categories.find(c => c.id === 'cB').values.length`), 2);
      assert.match(await p.eval(`document.getElementById('status').textContent`), /조합 1개가 지워졌습니다/);
      assert.equal(await p.eval(`LMState.docData.combos.some(c => c.when.cB === 'b0')`), false);
      assert.deepEqual(await p.eval('LMState.combo'), { cA: 'a1' }, '지운 값은 레이어 탭 선택에서도 빠진다');

      // --- 카테고리 삭제: 카테고리와 그 카테고리를 쓰던 조합이 같이 사라진다.
      const catDelete = `document.querySelector('#tab-categories [data-category=cA] [data-action=cat-delete]').click(); true`;
      await p.eval(`window.__confirmResult = false; window.__dialogs = []; true`);
      await p.eval(catDelete);
      await settle();
      assert.match(await p.eval(`window.__dialogs[0][1]`), /카테고리 "A"를 지웁니다\. 이 카테고리를 쓰는 조합 2개도 지워집니다\./);
      assert.equal(await p.eval('LMState.docData.categories.length'), 3, '취소하면 카테고리가 남는다');

      await p.eval(`window.__confirmResult = true; true`);
      await p.eval(catDelete);
      await settle();
      assert.deepEqual(await p.eval('LMState.docData.categories.map(c => c.id)'), ['cB', 'cN']);
      assert.equal(await p.eval(`LMState.docData.combos.some(c => 'cA' in c.when)`), false);
      assert.deepEqual(await p.eval('LMState.combo'), {}, '지운 카테고리는 레이어 탭 선택에서도 빠진다');
      const afterDelete = psCall('readDocData');
      assert.deepEqual(afterDelete.categories.map(c => c.id), ['cB', 'cN'], 'XMP 에도 반영된다');
      assert.equal(afterDelete.combos.some(c => 'cA' in c.when), false);

      // --- 프리셋 저장: prompt 로 받은 이름으로 presets.json 에 쓴다.
      await p.eval(`window.__promptResult = '한글 프리셋'; true`);
      await p.eval(`document.querySelector('[data-action=preset-save]').click(); true`);
      await settle();
      const savedFile = JSON.parse(fs.readFileSync(PRESETS, 'utf8'));
      assert.deepEqual(savedFile.presets.map(x => x.name), ['한글 프리셋']);
      assert.deepEqual(savedFile.presets[0].categories.map(c => c.id), ['cB', 'cN']);

      await p.eval(`window.__promptResult = null; true`);
      await p.eval(`document.querySelector('[data-action=preset-save]').click(); true`);
      await settle();
      assert.equal(JSON.parse(fs.readFileSync(PRESETS, 'utf8')).presets.length, 1, 'prompt 를 취소하면 아무것도 안 쓴다');

      // --- 조합이 남아 있는 문서에 프리셋 적용 → 확인 후 조합이 전부 지워진다.
      const applyPreset = `(() => {
        const sel = document.getElementById('preset-select');
        sel.value = sel.options[1].value;
        document.querySelector('[data-action=preset-apply]').click();
        return sel.options[1].textContent;
      })()`;
      assert.ok((await p.eval('LMState.docData.combos.length')) > 0, '아직 조합이 남아 있어야 의미가 있다');
      await p.eval(`window.__confirmResult = false; window.__dialogs = []; true`);
      assert.equal(await p.eval(applyPreset), '한글 프리셋');
      await settle();
      assert.match(await p.eval(`window.__dialogs[0][1]`), /현재 문서의 조합이 전부 지워집니다/);
      assert.ok((await p.eval('LMState.docData.combos.length')) > 0, '취소하면 조합이 남는다');

      await p.eval(`window.__confirmResult = true; LMState.combo = { cB: 'b1' }; true`);
      await p.eval(applyPreset);
      await settle();
      assert.deepEqual(await p.eval('LMState.docData.combos'), []);
      assert.deepEqual(await p.eval('LMState.combo'), {});
      assert.deepEqual(psCall('readDocData').combos, [], '조합이 지워진 상태가 XMP 에도 쓰인다');
    } finally {
      await restoreDialogs(p).catch(() => {});
      p.close();
    }
  } finally {
    if (hadPresets) fs.writeFileSync(PRESETS, backup);
    else if (fs.existsSync(PRESETS)) fs.unlinkSync(PRESETS);
  }
});

test('export tab: a start failure reports zero successes, not a negative count', async () => {
  const DEST = path.join(__dirname, '..', 'out', 'panel-export-start-fail');
  fs.rmSync(DEST, { recursive: true, force: true });
  const { byName } = buildFixture();
  psCall('writeDocData', docDataFor(byName, DEST.replace(/\\/g, '/')));
  const p = await freshPanel();
  try {
    await p.eval(`document.querySelector('#tabs [data-tab=export]').click(); true`);
    // exportBegin만 실패하도록 LMHost.call을 페이지 안에서 스텁한다 (host.jsx는 건드리지 않는다).
    await p.eval(`
      window.__origLMHostCall = LMHost.call;
      LMHost.call = (fn, arg) => fn === 'exportBegin'
        ? Promise.reject(new Error('induced start failure'))
        : window.__origLMHostCall(fn, arg);
      true`);
    await p.eval('LMUI.export.run()');
    const summary = await p.eval('LMState.summary');
    assert.equal(summary.succeeded, 0, 'no job ever ran, so zero succeeded');
    assert.equal(summary.done, 0);
    assert.deepEqual(summary.failures.map(f => f.path), ['(시작)']);
    assert.match(await p.eval(`document.querySelector('#tab-export .summary').textContent`), /0개 성공/);
    assert.doesNotMatch(await p.eval(`document.querySelector('#tab-export .summary').textContent`), /-1개 성공/);
    // 사전 점검(ensureDestination)이 폴더는 먼저 만든다. 확인할 것은 PNG 가 하나도
    // 안 쓰였다는 점이다.
    assert.deepEqual(fs.existsSync(DEST) ? fs.readdirSync(DEST) : [], [], 'exportBegin failed before any file could be written');
  } finally {
    await p.eval(`LMHost.call = window.__origLMHostCall; delete window.__origLMHostCall; true`);
    p.close();
  }
});

test('version 1 document data is converted on load and saved as version 2 on the next change', async () => {
  const { byName } = buildFixture();
  const v2 = docDataFor(byName);
  psCall('writeDocData', {
    version: 1, baseName: 'fx', delimiter: '_', destination: '', nativeColor: true, categories: v2.categories, excluded: [],
    marks: {
      [byName.A0]: { cA: ['a0'] },
      [byName.GA]: { cA: ['a1'], cB: ['b0', 'b1'] },
      [byName.H]: { cZ: ['zz'] },
    },
  });
  const sortCombos = list => list.slice().sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const p = await freshPanel();
  try {
    assert.equal(await p.eval('LMState.docData.version'), 2);
    assert.deepEqual(sortCombos(await p.eval('LMState.docData.combos')), sortCombos([
      { when: { cA: 'a0' }, layers: [byName.A0] },
      { when: { cA: 'a1', cB: 'b0' }, layers: [byName.GA] },
      { when: { cA: 'a1', cB: 'b1' }, layers: [byName.GA] },
    ]));
    assert.match(await p.eval(`document.getElementById('status').textContent`), /레이어 1개의 마크를 버렸습니다/);
    assert.equal(psCall('readDocData').version, 1, '읽기만 해서는 XMP 를 바꾸지 않는다');

    await p.eval(`document.querySelector('#tabs [data-tab=export]').click(); true`);
    await p.eval(setField('#tab-export [data-field=baseName]', 'fx2'));
    await settle();
    const stored = psCall('readDocData');
    assert.equal(stored.version, 2);
    assert.equal(stored.baseName, 'fx2');
    assert.equal('marks' in stored, false);
    assert.equal('nativeColor' in stored, false);
    assert.equal(stored.combos.length, 3);
  } finally {
    p.close();
  }
});

test('layer tab: picking a combo shows its layers, checkbox writes combos to XMP', async () => {
  const { byName } = buildFixture();
  psCall('writeDocData', docDataFor(byName));
  const colorsBefore = psCall('getLayers').map(l => [l.name, l.color]);
  const p = await freshPanel();
  try {
    await p.eval(`document.querySelector('#tabs [data-tab=layers]').click(); true`);
    assert.equal(await p.eval(`document.querySelectorAll('#tab-layers .layer-row').length`), 12);
    assert.equal(await p.eval(`document.querySelectorAll('#tab-layers .badge, #tab-layers .mark-panel').length`), 0, '배지·아래쪽 마킹 영역은 없다');

    // "전체" 없음: 카테고리마다 첫 값이 골라져 있다 (A0_B0_N1). 체크 = 이 조합에서 켜짐 (어느 항목 때문이든).
    assert.deepEqual(await p.eval('LMState.combo'), { cA: 'a0', cB: 'b0', cN: 'n1' });
    assert.equal(await p.eval(`Array.from(document.querySelectorAll('#tab-layers select[data-combo-cat] option')).some(o => o.textContent === '전체')`), false);
    assert.equal(await p.eval(`document.querySelector('#tab-layers select.made-select')`), null, '"만든 조합" 목록은 없다');
    assert.equal(await p.eval(cbState(byName.A0)), 'checked');
    assert.equal(await p.eval(cbState(byName.B0)), 'checked');
    assert.equal(await p.eval(cbState(byName.A1)), 'none');
    assert.equal(await p.eval(`document.querySelector('#tab-layers [data-layer="${byName.A0}"] .combos').textContent`), 'A0');
    assert.equal(await p.eval(`document.querySelector('#tab-layers [data-layer="${byName.BG}"] .combos')`), null);

    await p.eval(pickCombo('cB', 'b2'));
    assert.equal(await p.eval(cbState(byName.A0)), 'checked');
    assert.equal(await p.eval(cbState(byName.B2)), 'checked');
    assert.equal(await p.eval(cbState(byName.B0)), 'none');
    assert.equal(await p.eval(cbState(byName.H)), 'none');

    // H 를 A0_B2_N1 에 넣는다.
    await p.eval(clickCb(byName.H));
    await settle();
    assert.equal(await p.eval(cbState(byName.H)), 'checked');
    assert.deepEqual(entryOf(psCall('readDocData').combos, { cA: 'a0', cB: 'b2', cN: 'n1' }).layers, [byName.H]);

    // 다시 누르면 빠지고, 빈 항목은 사라진다.
    await p.eval(clickCb(byName.H));
    await settle();
    assert.equal(await p.eval(cbState(byName.H)), 'none');
    assert.equal(entryOf(psCall('readDocData').combos, { cA: 'a0', cB: 'b2', cN: 'n1' }), undefined);

    // 넓은 항목(A0)에서 켜진 A0 를 끄면 이 조합에서만 빠지고 다른 조합에서는 그대로 켜져 있다.
    await p.eval(clickCb(byName.A0));
    await settle();
    assert.equal(await p.eval(cbState(byName.A0)), 'none');
    const combos = psCall('readDocData').combos;
    assert.equal(onLayerIds(combos, { cA: 'a0', cB: 'b2', cN: 'n1' }).includes(byName.A0), false);
    assert.equal(onLayerIds(combos, { cA: 'a0', cB: 'b2', cN: 'n2' }).includes(byName.A0), true);
    assert.equal(onLayerIds(combos, { cA: 'a0', cB: 'b0', cN: 'n1' }).includes(byName.A0), true);
    await p.eval(pickCombo('cB', 'b0'));
    assert.equal(await p.eval(cbState(byName.A0)), 'checked');

    // 조합 복사 → 다른 조합에 붙여넣기 = 똑같아진다 (확인창은 스텁).
    await stubDialogs(p);
    await p.eval(`window.__confirmResult = true; true`);
    assert.equal(await p.eval(`document.querySelector('[data-action=combo-paste]').disabled`), true, 'nothing copied yet');
    await p.eval(`document.querySelector('[data-action=combo-copy]').click(); true`);
    const copied = onLayerIds(psCall('readDocData').combos, { cA: 'a0', cB: 'b0', cN: 'n1' });
    await p.eval(pickCombo('cA', 'a1'));
    await p.eval(pickCombo('cB', 'b1'));
    await p.eval(`document.querySelector('[data-action=combo-paste]').click(); true`);
    await settle();
    const pasted = psCall('readDocData').combos;
    assert.deepEqual(onLayerIds(pasted, { cA: 'a1', cB: 'b1', cN: 'n1' }), copied);
    assert.deepEqual(onLayerIds(pasted, { cA: 'a1', cB: 'b1', cN: 'n2' }), onLayerIds(combos, { cA: 'a1', cB: 'b1', cN: 'n2' }), 'other combos untouched');
    await restoreDialogs(p);

    assert.deepEqual(psCall('getLayers').map(l => [l.name, l.color]), colorsBefore, '레이어 색은 바뀌지 않는다');
  } finally {
    p.close();
  }
});

test('layer tab: Shift/Ctrl selection, checkbox on a selected row applies to all selected', async () => {
  const { byName } = buildFixture();
  psCall('writeDocData', docDataFor(byName));
  const p = await freshPanel();
  try {
    await stubDialogs(p);
    await p.eval(`document.querySelector('#tabs [data-tab=layers]').click(); true`);
    await p.eval(pickCombo('cA', 'a1'));
    await p.eval(pickCombo('cB', 'b1'));

    await p.eval(clickRow(byName.B0));
    await settle();
    await p.eval(clickRow(byName.N1, { shiftKey: true }));
    await settle();
    const range = asc([byName.B0, byName.B1, byName.B2, byName.N1]);
    assert.deepEqual(asc(await p.eval('LMState.selectedIds')), range);
    assert.deepEqual(asc(psCall('getSelectedLayerIds')), range, '포토샵 선택도 같다');

    await p.eval(clickRow(byName.B1, { ctrlKey: true }));
    await settle();
    const picked = asc([byName.B0, byName.B2, byName.N1]);
    assert.deepEqual(asc(await p.eval('LMState.selectedIds')), picked);

    // 선택된 행의 체크박스 → 선택 전부
    await p.eval(clickCb(byName.B2));
    await settle();
    assert.deepEqual(asc(entryOf(psCall('readDocData').combos, { cA: 'a1', cB: 'b1', cN: 'n1' }).layers), picked);

    // 선택 밖 행의 체크박스 → 그 행만, 선택은 그대로
    await p.eval(clickCb(byName.H));
    await settle();
    assert.deepEqual(asc(entryOf(psCall('readDocData').combos, { cA: 'a1', cB: 'b1', cN: 'n1' }).layers), asc(picked.concat(byName.H)));
    assert.deepEqual(asc(await p.eval('LMState.selectedIds')), picked);

    assert.equal(await p.eval(`document.querySelector('[data-action=remove-selected], [data-action=add-selected-all]')`), null, '"모든 조합에 넣기/빼기" 버튼은 없다');
  } finally {
    await restoreDialogs(p).catch(() => {});
    p.close();
  }
});

test('layer tab: Photoshop selection sync, group collapse, orphan cleanup, fixed combo bar', async () => {
  const { byName } = buildFixture();
  psCall('writeDocData', docDataFor(byName));
  const p = await freshPanel();
  try {
    await p.eval(`document.querySelector('#tabs [data-tab=layers]').click(); true`);

    psCall('selectLayers', [byName.B1]);
    await new Promise(r => setTimeout(r, 800));
    assert.deepEqual(await p.eval('LMState.selectedIds'), [byName.B1]);
    assert.equal(await p.eval(`document.querySelector('#tab-layers [data-layer="${byName.B1}"]').classList.contains('selected')`), true);

    await p.eval(`document.querySelector('#tab-layers [data-layer="${byName.G}"] .caret').click(); true`);
    assert.equal(await p.eval(`document.querySelectorAll('#tab-layers .layer-row').length`), 10);
    await p.eval(`document.querySelector('#tab-layers [data-layer="${byName.G}"] .caret').click(); true`);

    await p.eval(`LMState.docData.combos.push({ when: { cA: 'a0' }, layers: [999999] }); LMApp.render(); true`);
    assert.match(await p.eval(`document.querySelector('#tab-layers .orphans').textContent`), /문서에 없는 레이어 1개/);
    await p.eval(`document.querySelector('[data-action=orphans-clean]').click(); true`);
    await settle();
    assert.equal(await p.eval(`LMState.docData.combos.some(c => c.layers.includes(999999))`), false);

    // 트리만 스크롤된다: 창을 낮게 만들어 트리를 넘치게 한 뒤 끝까지 내린다.
    await p.emulate(440, 260);
    await p.eval('LMApp.render(); true');
    const barTop = await p.eval(`document.querySelector('#tab-layers select[data-combo-cat=cA]').getBoundingClientRect().top`);
    await p.eval(`document.querySelector('#tab-layers .tree').scrollTop = 99999; true`);
    assert.ok((await p.eval(`document.querySelector('#tab-layers .tree').scrollTop`)) > 0, '트리가 스크롤된다');
    assert.equal(await p.eval(`document.querySelector('main').scrollTop`), 0, 'main 은 스크롤되지 않는다');
    assert.equal(await p.eval(`document.querySelector('#tab-layers select[data-combo-cat=cA]').getBoundingClientRect().top`), barTop, '조합 선택은 제자리');
    const kept = await p.eval(`document.querySelector('#tab-layers .tree').scrollTop`);
    await p.eval('LMApp.render(); true');
    assert.equal(await p.eval(`document.querySelector('#tab-layers .tree').scrollTop`), kept, '다시 그려도 트리 스크롤 유지');
  } finally {
    await p.emulate(null).catch(() => {});
    p.close();
  }
});

test('layer tab: renders 600 layers x 150 combos quickly and looks right at 320/default/900 widths', async () => {
  const { byName } = buildFixture();
  const data = docDataFor(byName);
  data.combos.push({ when: { cA: 'a0', cB: 'b2' }, layers: [byName.H, byName.GB] });
  psCall('writeDocData', data);
  const p = await freshPanel();
  try {
    await p.eval(`document.querySelector('#tabs [data-tab=layers]').click(); true`);
    await p.eval(pickCombo('cA', 'a0'));
    await p.eval(pickCombo('cB', 'b2'));
    await p.eval(`LMState.selectedIds = [${byName.B2}, ${byName.H}]; LMApp.render(); true`);
    for (const [label, w, h] of [['layers-320', 320, 600], ['layers-default', 520, 760], ['layers-900', 900, 760]]) {
      await p.emulate(w, h);
      await p.eval('LMApp.render(); true');
      await p.shot(label);
      assert.ok(await p.eval(`document.documentElement.scrollWidth <= window.innerWidth + 1`), label + ': 가로 스크롤 없음');
    }
    await p.emulate(null);

    const ms = await p.eval(`(() => {
      const realLayers = LMState.layers, realCombos = LMState.docData.combos;
      const cats = LMState.docData.categories;
      LMState.layers = Array.from({ length: 600 }, (_, i) => ({ id: 100000 + i, name: 'L' + i, kind: 'layer', visible: true, depth: 0, parentId: null, color: 'none' }));
      LMState.docData.combos = Array.from({ length: 150 }, (_, i) => ({
        when: { cA: cats[0].values[i % 2].id, cB: cats[1].values[i % 3].id, cN: cats[2].values[i % 2].id, ['x' + i]: 'y' },
        layers: Array.from({ length: 20 }, (_, j) => 100000 + ((i * 7 + j * 31) % 600)),
      }));
      const t0 = performance.now();
      LMApp.render();
      const t = performance.now() - t0;
      LMState.layers = realLayers; LMState.docData.combos = realCombos; LMApp.render();
      return t;
    })()`);
    assert.ok(ms < 300, `render took ${ms}ms`);
  } finally {
    await p.emulate(null).catch(() => {});
    p.close();
  }
});

test('layer tab: Photoshop preview applies the combo, follows changes, restores only what it touched', async () => {
  const { byName } = buildFixture();
  psCall('writeDocData', docDataFor(byName, path.join(__dirname, '..', 'out', 'preview-export').replace(/\\/g, '/')));
  const vis = () => { const o = {}; for (const l of psCall('getLayers')) o[l.name] = l.visible; return o; };
  const toggle = `document.querySelector('#tab-layers input.preview-switch').click(); true`;
  const p = await freshPanel();
  try {
    await p.eval(`document.querySelector('#tabs [data-tab=layers]').click(); true`);
    // 미리보기 전 손작업: 관리 아닌 H 를 켜고, 관리 레이어 A1 을 끈다.
    psCall('applyVisibility', { on: [byName.H], off: [byName.A1] });
    await new Promise(r => setTimeout(r, 800));
    const before = vis();

    await p.eval(pickCombo('cA', 'a1'));
    await p.eval(pickCombo('cB', 'b0'));
    await p.eval(toggle);
    await settle();
    let v = vis();
    for (const [name, on] of Object.entries({ A0: false, A1: true, G: true, B0: true, GA: true, B1: false, B2: false, N1: true, N2: false })) {
      assert.equal(v[name], on, 'A1_B0_N1 ' + name);
    }
    assert.equal(v.H, false, '어느 조합에도 없는 레이어는 PSD 눈과 상관없이 꺼진다');
    assert.equal(v.BG, false);
    assert.equal(v.GB, false, 'G(A1)만 체크돼 있으면 안의 GB 는 꺼진 채');
    assert.match(await p.eval(`document.querySelector('#tab-layers .preview-label').textContent`), /A1_B0_N1로 표시 중/);

    // 조합을 바꾸면 다시 반영된다.
    await p.eval(pickCombo('cN', 'n2'));
    await settle();
    v = vis();
    assert.equal(v.N1, false);
    assert.equal(v.N2, true);

    // 체크박스로 조합을 바꿔도 반영된다: B1 을 A1_B0_N2 에 넣으면 켜진다.
    await p.eval(clickCb(byName.B1));
    await settle();
    assert.equal(vis().B1, true);

    // 켜 둔 채 내보내기 → 끝나면 미리보기 상태로 돌아온다.
    await p.eval(`LMState.include = { cA: ['a0'], cB: ['b0'], cN: ['n1'] }; true`);
    const previewState = vis();
    await p.eval('LMUI.export.run()');
    assert.deepEqual((await p.eval('LMState.summary')).failures, []);
    assert.deepEqual(vis(), previewState, '내보내기 뒤에는 미리보기 상태');

    // 다른 문서로 갔다 오면: 그 문서에서는 꺼져 있고, 돌아오면 켜져 있다.
    psRun('app.documents.add(10, 10, 72, "lm-other"); "added"');
    await new Promise(r => setTimeout(r, 1200));
    assert.equal(await p.eval('LMPreview.isOn()'), false);
    psRun('app.activeDocument.close(SaveOptions.DONOTSAVECHANGES); "closed"');
    await new Promise(r => setTimeout(r, 1200));
    assert.equal(await p.eval('LMPreview.isOn()'), true);
    assert.deepEqual(await p.eval('LMState.combo'), { cA: 'a1', cB: 'b0', cN: 'n2' }, '캔버스에 반영된 조합으로 선택이 돌아온다');

    // 미리보기 중 손으로: BG 를 끄고, N2 를 지운다.
    psCall('applyVisibility', { on: [], off: [byName.BG] });
    psRun(`app.activeDocument.artLayers.getByName('N2').remove(); "removed"`);
    await new Promise(r => setTimeout(r, 1000));

    await p.eval(toggle);
    await settle();
    assert.equal(await p.eval(`document.getElementById('status').textContent`), '', '지워진 레이어가 있어도 오류 없음');
    const after = vis();
    const expected = Object.assign({}, before);
    delete expected.N2;
    assert.deepEqual(after, expected, '미리보기는 모든 레이어를 건드리므로 전부 켜기 전 상태로 돌아온다');
    assert.equal(await p.eval('LMPreview.isOn()'), false);

    // 문서를 닫으면 스냅샷도 버린다.
    await p.eval(toggle);
    await settle();
    psRun('while (app.documents.length) app.activeDocument.close(SaveOptions.DONOTSAVECHANGES); "closed"');
    await new Promise(r => setTimeout(r, 1200));
    assert.deepEqual(await p.eval('Object.keys(LMState.previews)'), []);
  } finally {
    p.close();
  }
});

// 리뷰 #1: 미리보기가 기억한 조합에 지운 카테고리 키가 남아 있으면, 문서를 오갈 때 되살아나
// 체크 한 번으로 어떤 배리에이션과도 맞지 않는 항목(=그 레이어가 항상 꺼짐)이 생긴다.
test('layer tab: deleted category keys do not come back via the preview memory', async () => {
  const { byName } = buildFixture();
  psCall('writeDocData', docDataFor(byName));
  const p = await freshPanel();
  try {
    await stubDialogs(p);
    await p.eval(`document.querySelector('#tabs [data-tab=layers]').click(); true`);
    await p.eval(pickCombo('cA', 'a1'));
    await p.eval(`document.querySelector('#tab-layers input.preview-switch').click(); true`);
    await settle();
    await p.eval(`document.querySelector('#tabs [data-tab=categories]').click(); window.__confirmResult = true; true`);
    await p.eval(`document.querySelector('#tab-categories [data-category=cA] [data-action=cat-delete]').click(); true`);
    await settle();
    psRun('app.documents.add(10, 10, 72, "lm-other"); "added"');
    await new Promise(r => setTimeout(r, 1200));
    psRun('app.activeDocument.close(SaveOptions.DONOTSAVECHANGES); "closed"');
    await new Promise(r => setTimeout(r, 1200));
    assert.equal(await p.eval('LMPreview.isOn()'), true);
    assert.deepEqual(await p.eval('LMState.combo'), {}, '지운 카테고리 키는 되살아나지 않는다');

    await p.eval(`document.querySelector('#tabs [data-tab=layers]').click(); true`);
    await p.eval(clickCb(byName.H));
    await settle();
    assert.equal(psCall('readDocData').combos.some(c => 'cA' in c.when), false, '낡은 항목이 생기지 않는다');
    await p.eval(`document.querySelector('#tab-layers input.preview-switch').click(); true`);
    await settle();
  } finally {
    await restoreDialogs(p).catch(() => {});
    p.close();
  }
});

// 리뷰 #2: 패널 자신의 메아리(선택·가시성)를 무시하는 동안에도 문서 전환·닫기는 놓치면 안 된다.
// 놓치면 패널은 이전 문서의 레이어 id로 계속 일한다.
test('document switches are never swallowed as the panel echo', async () => {
  buildFixture();
  const p = await freshPanel();
  try {
    const before = await p.eval('LMState.docKey');
    await p.eval('LMState.echoUntil = Date.now() + 10000; true');
    psRun('app.documents.add(10, 10, 72, "lm-echo"); "added"');
    await new Promise(r => setTimeout(r, 1200));
    assert.equal(await p.eval('LMState.docKey'), 'lm-echo');
    psRun('app.activeDocument.close(SaveOptions.DONOTSAVECHANGES); "closed"');
    await new Promise(r => setTimeout(r, 1200));
    assert.equal(await p.eval('LMState.docKey'), before);
  } finally {
    await p.eval('LMState.echoUntil = 0; true').catch(() => {});
    p.close();
  }
});

// 리뷰 #3: 새로고침이 docInfo 를 먼저 바꾸고 레이어·문서 데이터를 나중에 읽으면, 그 사이의 저장이
// 새 문서 확인을 통과해 이전 문서의 조합(이전 문서의 layerID)을 새 문서 XMP 에 쓴다.
test('a save during a slow refresh never writes the previous document data into the new one', async () => {
  const { byName } = buildFixture();
  psCall('writeDocData', docDataFor(byName));
  const p = await freshPanel();
  try {
    await p.eval(`
      window.__origLMHostCall = LMHost.call;
      LMHost.call = (fn, arg) => fn === 'getLayers'
        ? new Promise(r => setTimeout(r, 2000)).then(() => window.__origLMHostCall(fn, arg))
        : window.__origLMHostCall(fn, arg);
      true`);
    psRun('app.documents.add(10, 10, 72, "lm-race"); "added"');
    await new Promise(r => setTimeout(r, 900));
    await p.eval('LMApp.saveDocData().then(() => true)');
    await new Promise(r => setTimeout(r, 3000));
    assert.equal(psCall('readDocData'), null, '새 문서 XMP 에는 아무것도 쓰이지 않는다');
  } finally {
    await p.eval(`LMHost.call = window.__origLMHostCall; delete window.__origLMHostCall; true`).catch(() => {});
    psRun('app.activeDocument.close(SaveOptions.DONOTSAVECHANGES); "closed"');
    p.close();
  }
});

// 리뷰 #7: 레이어가 수백 개면 getLayers 한 번이 1초를 넘는다. 미리보기 반영 때마다 다시 읽지 않고
// 보낸 on/off 로 패널의 눈 상태를 고친다.
test('preview apply updates eye icons without re-reading every layer', async () => {
  const { byName } = buildFixture();
  psCall('writeDocData', docDataFor(byName));
  const p = await freshPanel();
  try {
    await p.eval(`document.querySelector('#tabs [data-tab=layers]').click(); true`);
    await p.eval(pickCombo('cA', 'a0'));
    await p.eval(`document.querySelector('#tab-layers input.preview-switch').click(); true`);
    await settle();
    await p.eval(`
      window.__getLayers = 0;
      window.__origLMHostCall = LMHost.call;
      LMHost.call = (fn, arg) => { if (fn === 'getLayers') window.__getLayers++; return window.__origLMHostCall(fn, arg); };
      true`);
    await p.eval(pickCombo('cA', 'a1'));
    await p.eval(pickCombo('cB', 'b2'));
    await settle();
    assert.equal(await p.eval('window.__getLayers'), 0, '조합을 바꿀 때 레이어 전체를 다시 읽지 않는다');
    const ps = {};
    for (const l of psCall('getLayers')) ps[l.id] = l.visible;
    for (const [id, visible] of await p.eval('LMState.layers.map(l => [l.id, l.visible])')) {
      assert.equal(visible, ps[id], 'layer ' + id + ' eye matches Photoshop');
    }
  } finally {
    await p.eval(`if (window.__origLMHostCall) { LMHost.call = window.__origLMHostCall; delete window.__origLMHostCall; } true`).catch(() => {});
    await p.eval(`document.querySelector('#tab-layers input.preview-switch').click(); true`).catch(() => {});
    await settle();
    p.close();
  }
});

// export spec §3.3·3.4: 설정이 없는 PSD 는 마지막 설정에서 시작한다.
test('a PSD without export settings starts from export-defaults.json, otherwise from built-in defaults', async () => {
  try {
    fs.mkdirSync(path.dirname(EXPORT_DEFAULTS), { recursive: true });
    fs.writeFileSync(EXPORT_DEFAULTS, JSON.stringify({ format: 'jpg', jpg: { quality: 55 } }), 'utf8');
    const { byName } = buildFixture();
    psCall('writeDocData', docDataFor(byName));
    let p = await freshPanel();
    try {
      assert.equal(await p.eval('LMState.docData.output.format'), 'jpg');
      assert.equal(await p.eval('LMState.docData.output.jpg.quality'), 55);
      assert.equal(await p.eval('LMState.docData.output.scale'), 100, 'missing keys come from the defaults');
    } finally {
      p.close();
    }
    clearExportDefaults();
    p = await freshPanel();
    try {
      assert.equal(await p.eval('LMState.docData.output.format'), 'png24');
    } finally {
      p.close();
    }
  } finally {
    clearExportDefaults();
  }
});

// export spec §7: 공통 영역이면 모든 조합을 먼저 재고(measureBounds), 그다음 내보낸다.
test('export run with combined trim measures every job first; all files share the union size', async () => {
  const DEST = path.join(__dirname, '..', 'out', 'panel-combined');
  fs.rmSync(DEST, { recursive: true, force: true });
  const { byName } = buildFixture();
  psCall('applyVisibility', { on: [], off: [byName.BG] });
  const data = docDataFor(byName, DEST.replace(/\\/g, '/'));
  data.output = { trim: 'combined' };
  psCall('writeDocData', data);
  const p = await freshPanel();
  try {
    await p.eval(`document.querySelector('#tabs [data-tab=export]').click(); true`);
    await p.eval(`
      window.__calls = [];
      window.__origLMHostCall = LMHost.call;
      window.__bars = [];
      LMHost.call = (fn, arg) => {
        window.__calls.push(fn);
        if (fn === 'measureBounds' || fn === 'exportOne') window.__bars.push(!!document.querySelector('#tab-export .progress'));
        return window.__origLMHostCall(fn, arg);
      };
      true`);
    await p.eval('LMUI.export.run()');
    const calls = (await p.eval('window.__calls')).filter(f => f === 'measureBounds' || f === 'exportOne');
    assert.deepEqual(calls, Array(12).fill('measureBounds').concat(Array(12).fill('exportOne')));
    assert.deepEqual(await p.eval('window.__bars'), Array(24).fill(true), 'the progress bar is on screen during both phases');
    const summary = await p.eval('LMState.summary');
    assert.deepEqual(summary.failures, []);
    assert.equal(summary.succeeded, 12);
    const crop = unionBounds(enumerate(data.categories).map(v => visibleBounds(v, ['BG'])));
    const files = [];
    for (const dir of fs.readdirSync(DEST)) for (const f of fs.readdirSync(path.join(DEST, dir))) files.push(path.join(DEST, dir, f));
    assert.equal(files.length, 12);
    for (const f of files) {
      const img = PNG.sync.read(fs.readFileSync(f));
      assert.deepEqual([img.width, img.height], [crop.right - crop.left, crop.bottom - crop.top], f);
    }
    assert.equal(JSON.parse(fs.readFileSync(EXPORT_DEFAULTS, 'utf8')).trim, 'combined', 'last-used settings saved after the run');
  } finally {
    await p.eval(`if (window.__origLMHostCall) { LMHost.call = window.__origLMHostCall; delete window.__origLMHostCall; } true`).catch(() => {});
    clearExportDefaults();
    p.close();
  }
});

// 호스트 오류 코드는 한국어로, 번호를 붙여 저장한 수는 요약에.
test('export run reports host error codes in Korean and counts renamed files', async () => {
  const DEST = path.join(__dirname, '..', 'out', 'panel-renamed');
  fs.rmSync(DEST, { recursive: true, force: true });
  const { byName } = buildFixture();
  const data = docDataFor(byName, DEST.replace(/\\/g, '/'));
  data.output = { overwrite: false };
  psCall('writeDocData', data);
  const p = await freshPanel();
  try {
    await p.eval(`document.querySelector('#tabs [data-tab=export]').click(); true`);
    await p.eval('LMUI.export.run()');
    assert.equal((await p.eval('LMState.summary')).renamed, 0);
    await p.eval('LMUI.export.run()');
    const second = await p.eval('LMState.summary');
    assert.equal(second.succeeded, 12);
    assert.equal(second.renamed, 12);
    assert.match(await p.eval(`document.querySelector('#tab-export .summary').textContent`), /번호를 붙여 저장 12개/);
    // 모든 레이어를 끄고 조합마다 각자 잘라내기 → 조합마다 "내용이 없어" 실패.
    // 가시성을 먼저 바꾸고 패널 새로고침(XMP 다시 읽기)이 끝난 뒤에 메모리 설정을 바꾼다.
    psCall('applyVisibility', { on: [], off: psCall('getLayers').map(l => l.id) });
    await new Promise(r => setTimeout(r, 1000));
    await p.eval(`LMState.docData.output = LMCore.output.normalize({ trim: 'each' }); LMState.docData.combos = []; LMApp.render(); true`);
    await p.eval('LMUI.export.run()');
    const third = await p.eval('LMState.summary');
    assert.equal(third.failures.length, 12);
    assert.equal(third.failures[0].error, '내용이 없어 잘라낼 수 없습니다');
  } finally {
    clearExportDefaults();
    p.close();
  }
});

const firstPreviewLine = `document.querySelector('#tab-export .preview').textContent.split('\\n')[0]`;

test('export tab: format options follow the format; numbers are clamped; other formats keep their values', async () => {
  const { byName } = buildFixture();
  psCall('writeDocData', docDataFor(byName));
  const p = await freshPanel();
  try {
    await p.eval(`document.querySelector('#tabs [data-tab=export]').click(); true`);
    const has = sel => p.eval(`!!document.querySelector('#tab-export ${sel}')`);
    assert.equal(await has('[data-out="png24.interlaced"]'), true);
    await p.eval(setField('#tab-export select[data-out=format]', 'png8'));
    await settle();
    assert.equal(await has('[data-out="png24.interlaced"]'), false);
    assert.equal(await has('[data-out="png8.colors"]'), true);
    assert.equal(psCall('readDocData').output.format, 'png8');
    await p.eval(setField('#tab-export select[data-out="png8.dither"]', 'noise'));
    await settle();
    assert.equal(await p.eval(`document.querySelector('#tab-export [data-out="png8.ditherAmount"]').disabled`), true, 'amount only for diffusion');
    await p.eval(setField('#tab-export select[data-out=format]', 'jpg'));
    await settle();
    await p.eval(setField('#tab-export [data-out="jpg.quality"]', '150'));
    await settle();
    assert.equal(psCall('readDocData').output.jpg.quality, 100);
    assert.equal(await p.eval(`document.querySelector('#tab-export [data-out="jpg.quality"]').value`), '100', 'field redrawn with the clamped value');
    assert.equal(psCall('readDocData').output.png8.dither, 'noise', 'PNG-8 settings survive a format switch');
    // BMP RLE 는 16·24·32비트에 없다 (2026-10-02 실측: 32비트 + RLE 저장 실패). 칸을 막고 이유를 보인다.
    await p.eval(setField('#tab-export select[data-out=format]', 'bmp'));
    await settle();
    assert.equal(await p.eval(`document.querySelector('#tab-export [data-out="bmp.rle"]').disabled`), true);
    assert.match(await p.eval(`document.querySelector('#tab-export [data-out="bmp.rle"]').closest('label').title`), /RLE/);
    assert.equal(JSON.parse(fs.readFileSync(EXPORT_DEFAULTS, 'utf8')).format, 'bmp', 'every change updates the last-used settings');
  } finally {
    clearExportDefaults();
    p.close();
  }
});

test('export tab: suffix, letter case, format and folder grouping show in the preview paths', async () => {
  const { byName } = buildFixture();
  psCall('writeDocData', docDataFor(byName));
  const p = await freshPanel();
  try {
    await p.eval(`document.querySelector('#tabs [data-tab=export]').click(); true`);
    assert.equal(await p.eval(firstPreviewLine), 'fx_A0/fx_A0_0_1.png');
    await p.eval(setField('#tab-export [data-out=suffix]', '@2x'));
    await settle();
    await p.eval(setField('#tab-export select[data-out=letterCase]', 'upper'));
    await settle();
    await p.eval(setField('#tab-export select[data-out=format]', 'jpg'));
    await settle();
    assert.equal(await p.eval(firstPreviewLine), 'FX_A0/FX_A0_0_1@2X.JPG');
    await p.eval(`document.querySelector('#tab-export [data-folder-cat=cB]').click(); true`);
    await settle();
    assert.equal(psCall('readDocData').categories.find(c => c.id === 'cB').folder, true);
    assert.equal(await p.eval(firstPreviewLine), 'FX_A0/FX_A0_0/FX_A0_0_1@2X.JPG');
    await p.eval(setField('#tab-export select[data-out=folderName]', 'value'));
    await settle();
    assert.equal(await p.eval(firstPreviewLine), 'A0/0/FX_A0_0_1@2X.JPG');
    await p.eval(`document.querySelector('#tabs [data-tab=categories]').click(); true`);
    assert.equal(await p.eval(`document.querySelector('#tab-categories [data-field=folder]')`), null, 'folder checkbox lives only in the export tab');
  } finally {
    clearExportDefaults();
    p.close();
  }
});

test('export tab: run-only values, always-excluded combos and warnings are collapsible', async () => {
  const { byName } = buildFixture();
  psCall('writeDocData', docDataFor(byName));
  const p = await freshPanel();
  try {
    await p.eval(`document.querySelector('#tabs [data-tab=export]').click(); true`);
    const det = name => p.eval(`(() => { const d = document.querySelector('#tab-export details[data-open=${name}]'); return d ? { open: d.open, text: d.querySelector('summary').textContent } : null; })()`);
    assert.deepEqual(await det('include'), { open: false, text: '이번만 내보낼 값 (저장 안 됨)' });
    assert.deepEqual(await det('exclude'), { open: false, text: '항상 뺄 조합 (PSD에 저장)' });
    assert.deepEqual(await det('warnings'), { open: false, text: '경고 1개' }, 'BG, H, GB 는 어느 조합에도 없다 (unused)');
    await p.eval(`document.querySelector('#tab-export .include input[data-category=cN][data-value=n1]').click(); true`);
    assert.equal((await det('include')).open, true, 'opens once a value is unchecked');
    await p.eval(`LMState.docData.combos.push({ when: { cA: 'a0' }, layers: [999999] }); LMApp.render(); true`);
    assert.deepEqual(await det('warnings'), { open: false, text: '경고 2개' });
    for (const [label, w, h] of [['export-520', 520, 760], ['export-900', 900, 760]]) {
      await p.emulate(w, h);
      await p.eval('LMApp.render(); true');
      await p.shot(label);
      assert.ok(await p.eval(`document.documentElement.scrollWidth <= window.innerWidth + 1`), label + ': no horizontal scroll');
    }
  } finally {
    await p.emulate(null).catch(() => {});
    p.close();
  }
});

// 포토샵에서 지정한 레이어 색을 트리의 눈 칸 배경으로 보인다 (읽기만, 색은 바꾸지 않는다).
function setLayerColorInPhotoshop(id, color) {
  psRun(`var r = new ActionReference(); r.putIdentifier(charIDToTypeID('Lyr '), ${id});
    var d = new ActionDescriptor(); d.putReference(charIDToTypeID('null'), r); d.putBoolean(charIDToTypeID('MkVs'), false);
    executeAction(charIDToTypeID('slct'), d, DialogModes.NO);
    var r2 = new ActionReference(); r2.putEnumerated(charIDToTypeID('Lyr '), charIDToTypeID('Ordn'), charIDToTypeID('Trgt'));
    var d2 = new ActionDescriptor(); d2.putReference(charIDToTypeID('null'), r2);
    var p = new ActionDescriptor(); p.putEnumerated(charIDToTypeID('Clr '), charIDToTypeID('Clr '), stringIDToTypeID('${color}'));
    d2.putObject(charIDToTypeID('T   '), charIDToTypeID('Lyr '), p);
    executeAction(charIDToTypeID('setd'), d2, DialogModes.NO); "ok"`);
}

test('layer tab shows Photoshop layer colors behind the eye and follows color changes', async () => {
  const { byName } = buildFixture();
  psCall('writeDocData', docDataFor(byName));
  setLayerColorInPhotoshop(byName.B1, 'blue');
  const p = await freshPanel();
  try {
    await p.eval(`document.querySelector('#tabs [data-tab=layers]').click(); true`);
    const eyeBg = id => p.eval(`getComputedStyle(document.querySelector('#tab-layers [data-layer="${id}"] .eye')).backgroundColor`);
    const none = await eyeBg(byName.A0);
    assert.notEqual(await eyeBg(byName.B1), none, 'a colored layer has a background behind the eye');
    setLayerColorInPhotoshop(byName.A0, 'violet');
    await new Promise(r => setTimeout(r, 1200));
    assert.equal(await p.eval(`LMState.layers.find(l => l.id === ${byName.A0}).color`), 'violet', 'refreshed on the color change');
    assert.notEqual(await eyeBg(byName.A0), none);
    assert.notEqual(await eyeBg(byName.A0), await eyeBg(byName.B1), 'different colors look different');
    await p.shot('layers-colors');
  } finally {
    p.close();
  }
});

// 리뷰 I2·M9: 공통 영역은 "이번만 내보낼 값"과 무관하게 (항상 뺄 조합만 뺀) 모든 조합을 재고,
// 내보내기 호출에는 패널이 아는 문서를 같이 보낸다.
test('combined trim measures every non-excluded variation even when exporting only some; calls carry the document', async () => {
  const DEST = path.join(__dirname, '..', 'out', 'panel-combined-partial');
  fs.rmSync(DEST, { recursive: true, force: true });
  const { byName } = buildFixture();
  psCall('applyVisibility', { on: [], off: [byName.BG] });
  const data = docDataFor(byName, DEST.replace(/\\/g, '/'));
  data.output = { trim: 'combined' };
  psCall('writeDocData', data);
  const p = await freshPanel();
  try {
    await p.eval(`document.querySelector('#tabs [data-tab=export]').click(); true`);
    await p.eval(`document.querySelector('#tab-export .include input[data-category=cN][data-value=n1]').click(); true`);
    assert.equal(await p.eval(`document.querySelector('#tab-export .count').textContent`), '6');
    await p.eval(`
      window.__calls = [];
      window.__origLMHostCall = LMHost.call;
      LMHost.call = (fn, arg) => { window.__calls.push([fn, arg && arg.doc ? arg.doc.name : null]); return window.__origLMHostCall(fn, arg); };
      true`);
    await p.eval('LMUI.export.run()');
    const calls = await p.eval('window.__calls');
    const measured = calls.filter(c => c[0] === 'measureBounds');
    assert.equal(measured.length, 12, 'all 12 variations measured');
    assert.equal(calls.filter(c => c[0] === 'exportOne').length, 6, 'only the 6 selected ones exported');
    for (const fn of ['exportBegin', 'measureBounds', 'exportOne', 'exportEnd']) {
      assert.ok(calls.filter(c => c[0] === fn).every(c => c[1] === 'fixture.psd'), fn + ' carries the document');
    }
    const crop = unionBounds(enumerate(data.categories).map(v => visibleBounds(v, ['BG'])));
    const files = [];
    for (const dir of fs.readdirSync(DEST)) for (const f of fs.readdirSync(path.join(DEST, dir))) files.push(path.join(DEST, dir, f));
    assert.equal(files.length, 6);
    for (const f of files) {
      const img = PNG.sync.read(fs.readFileSync(f));
      assert.deepEqual([img.width, img.height], [crop.right - crop.left, crop.bottom - crop.top], f);
    }
  } finally {
    await p.eval(`if (window.__origLMHostCall) { LMHost.call = window.__origLMHostCall; delete window.__origLMHostCall; } true`).catch(() => {});
    clearExportDefaults();
    p.close();
  }
});

// 리뷰 M4: PNG-8 은 투명도를 켜도 매트가 반투명 가장자리 색을 정하므로 막지 않는다 (PNG-24 는 막는다).
test('export tab: PNG-8 matte stays editable with transparency on; PNG-24 matte does not', async () => {
  const { byName } = buildFixture();
  psCall('writeDocData', docDataFor(byName));
  const p = await freshPanel();
  try {
    await p.eval(`document.querySelector('#tabs [data-tab=export]').click(); true`);
    assert.equal(await p.eval(`document.querySelector('#tab-export [data-out="png24.matte"]').disabled`), true);
    await p.eval(setField('#tab-export select[data-out=format]', 'png8'));
    await settle();
    assert.equal(await p.eval(`document.querySelector('#tab-export [data-out="png8.transparency"]').checked`), true);
    assert.equal(await p.eval(`document.querySelector('#tab-export [data-out="png8.matte"]').disabled`), false);
  } finally {
    clearExportDefaults();
    p.close();
  }
});
