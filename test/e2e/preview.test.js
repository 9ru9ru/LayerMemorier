'use strict';
// 패널 미리보기 호스트 (independent preview spec §5.2, §7.2). 포토샵 2020 + Windows 필요.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { PNG } = require('pngjs');
const { psRun, psCall } = require('../helpers/ps');
const { buildFixture, docDataFor } = require('../helpers/fixture');
const { CELL, expectedOn, pixel } = require('../helpers/cells');
const { enumerate } = require('../../core/variation');
const { visibleLayerIds } = require('../../core/combos');

const history = () => JSON.parse(psRun('var d = app.activeDocument; JSON.stringify({ n: d.historyStates.length, cur: d.activeHistoryState.name })'));
const eyes = () => psCall('getLayers').map(l => [l.name, l.visible]);

function setup() {
  const { layers, byName } = buildFixture();
  const docData = docDataFor(byName);
  const info = psCall('getDocInfo');
  const doc = { name: info.name, path: info.path || null };
  const args = v => {
    const on = visibleLayerIds(docData.combos, layers, v);
    return { doc, on, off: layers.map(l => l.id).filter(id => !on.includes(id)), maxSize: 1024 };
  };
  return { docData, args };
}

test('renderPreview draws the variation and leaves eyes and history untouched, many times in a row', () => {
  const { docData, args } = setup();
  const vs = enumerate(docData.categories);
  const histBefore = history();
  const eyesBefore = eyes();
  for (const v of [vs[0], vs[7], vs[0]]) {
    const r = psCall('renderPreview', args(v));
    console.log(`renderPreview ${JSON.stringify(v)}: ${r.ms} ms`);
    assert.deepEqual([r.width, r.height], [240, 160], 'small document keeps its size');
    const img = PNG.sync.read(fs.readFileSync(r.path));
    for (const name of Object.keys(CELL)) {
      const [col, row] = CELL[name];
      const a = pixel(img, col * 40 + 20, row * 40 + 20)[3];
      assert.equal(a, expectedOn(name, v) ? 255 : 0, `${JSON.stringify(v)} ${name}`);
    }
  }
  assert.deepEqual(history(), histBefore, 'no history step left (not even a greyed redo step)');
  assert.deepEqual(eyes(), eyesBefore);
});

test('renderPreview with every layer off saves an empty picture', () => {
  const { args } = setup();
  const a = args({});
  const r = psCall('renderPreview', { doc: a.doc, on: [], off: a.on.concat(a.off), maxSize: 1024 });
  const img = PNG.sync.read(fs.readFileSync(r.path));
  assert.equal(pixel(img, 20, 20)[3], 0);
});

test('renderPreview refuses while the artist has redo steps, and keeps them', () => {
  const { docData, args } = setup();
  psRun('app.activeDocument.artLayers.add(); "added"');
  psRun('var d = app.activeDocument; d.activeHistoryState = d.historyStates[d.historyStates.length - 2]; "back"');
  const before = history();
  assert.throws(() => psCall('renderPreview', args(enumerate(docData.categories)[0])), /LM_REDO_PENDING/);
  assert.deepEqual(history(), before, 'redo step still there');
});
