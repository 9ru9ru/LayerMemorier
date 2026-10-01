'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { connect } = require('../helpers/panel');
const { psCall } = require('../helpers/ps');
const { buildFixture, docDataFor } = require('../helpers/fixture');

const PRESETS = path.join(process.env.APPDATA, 'LayerMemorier', 'presets.json');

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
