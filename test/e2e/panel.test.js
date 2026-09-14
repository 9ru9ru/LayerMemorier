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

test('layer tab: badges, selection sync, marking writes XMP and native color', async () => {
  const { byName, layers } = buildFixture();
  psCall('writeDocData', docDataFor(byName));
  const p = await freshPanel();
  try {
    await p.eval(`document.querySelector('#tabs [data-tab=layers]').click(); true`);
    assert.equal(await p.eval(`document.querySelectorAll('#tab-layers .layer-row').length`), 12);
    assert.equal(await p.eval(`document.querySelector('#tab-layers [data-layer="${byName.A0}"] .badge').textContent`), 'A: 0');
    assert.equal(await p.eval(`document.querySelectorAll('#tab-layers [data-layer="${byName.BG}"] .badge').length`), 0);

    // Photoshop 선택 → 패널 선택
    psCall('selectLayers', [byName.B1]);
    await new Promise(r => setTimeout(r, 800));
    assert.deepEqual(await p.eval('LMState.selectedIds'), [byName.B1]);
    assert.equal(await p.eval(`document.querySelector('#tab-layers [data-layer="${byName.B1}"]').classList.contains('selected')`), true);

    // 패널 클릭 → Photoshop 선택
    await p.eval(`document.querySelector('#tab-layers [data-layer="${byName.H}"] .name').click(); true`);
    await new Promise(r => setTimeout(r, 500));
    assert.deepEqual(psCall('getSelectedLayerIds'), [byName.H]);

    // 마킹: H 에 A=a0 추가 → XMP 반영 + 네이티브 색 (nativeColor 켜기)
    await p.eval('LMState.docData.nativeColor = true; true');
    await p.eval(`document.querySelector('#tab-layers .mark-panel input[data-category=cA][data-value=a0]').click(); true`);
    await new Promise(r => setTimeout(r, 800));
    assert.deepEqual(psCall('readDocData').marks[String(byName.H)], { cA: ['a0'] });
    assert.equal(psCall('getLayers').find(l => l.name === 'H').color, 'red');

    // 해제 → 마크 삭제 + 색 none
    await p.eval(`document.querySelector('#tab-layers .mark-panel input[data-category=cA][data-value=a0]').click(); true`);
    await new Promise(r => setTimeout(r, 800));
    assert.equal(psCall('readDocData').marks[String(byName.H)], undefined);
    assert.equal(psCall('getLayers').find(l => l.name === 'H').color, 'none');

    // 다중 선택 마킹 → setLayerColor 의 활성 레이어 부작용에도 포토샵 선택이 유지돼야 함
    psCall('selectLayers', [byName.B0, byName.B2]);
    await new Promise(r => setTimeout(r, 800));
    assert.deepEqual((await p.eval('LMState.selectedIds')).slice().sort((a, b) => a - b), [byName.B0, byName.B2].sort((a, b) => a - b));
    await p.eval(`document.querySelector('#tab-layers .mark-panel input[data-category=cA][data-value=a0]').click(); true`);
    await new Promise(r => setTimeout(r, 800));
    const stillSelected = psCall('getSelectedLayerIds');
    assert.ok(stillSelected.includes(byName.B0), 'B0 stays selected after the native-color loop');
    assert.ok(stillSelected.includes(byName.B2), 'B2 stays selected after the native-color loop');

    // 그룹 접기
    await p.eval(`document.querySelector('#tab-layers [data-layer="${byName.G}"] .caret').click(); true`);
    assert.equal(await p.eval(`document.querySelectorAll('#tab-layers .layer-row').length`), 10);

    // 고아 마크 표시
    await p.eval(`LMState.docData.marks['999999'] = { cA: ['a0'] }; LMApp.render(); true`);
    assert.match(await p.eval(`document.querySelector('#tab-layers .orphans').textContent`), /고아 마크 1개/);
    await p.eval(`document.querySelector('[data-action=orphans-clean]').click(); true`);
    await new Promise(r => setTimeout(r, 500));
    assert.equal(await p.eval(`LMState.docData.marks['999999']`), undefined);
    await p.shot('panel-layers');
  } finally {
    p.close();
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
