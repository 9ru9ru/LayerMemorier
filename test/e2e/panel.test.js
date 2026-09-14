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
