'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { psRun, psCall } = require('../helpers/ps');
const { buildFixture, reopenFixture, docDataFor } = require('../helpers/fixture');

test('host loads and ping answers', () => {
  assert.equal(psRun('"ok"', { host: false }), 'ok');
  const r = psCall('ping');
  assert.equal(r.pong, true);
  assert.match(r.version, /^21\./);
});

test('getDocInfo is null without document', () => {
  psRun('while (app.documents.length) app.activeDocument.close(SaveOptions.DONOTSAVECHANGES); "closed"');
  assert.equal(psCall('getDocInfo'), null);
});

test('eventIds are numbers', () => {
  const ids = psCall('eventIds');
  for (const k of ['select', 'make', 'del', 'show', 'hide', 'move', 'docActivate', 'close']) {
    assert.equal(typeof ids[k], 'number', k);
  }
});

test('getLayers returns tree in top-down order with ids and groups', () => {
  const { layers, byName } = buildFixture();
  assert.deepEqual(layers.map(l => l.name), ['A0', 'A1', 'B0', 'B1', 'B2', 'N1', 'N2', 'G', 'GA', 'GB', 'H', 'BG']);
  const g = layers.find(l => l.name === 'G');
  assert.equal(g.kind, 'group');
  assert.equal(layers.find(l => l.name === 'GA').parentId, g.id);
  assert.equal(layers.find(l => l.name === 'GA').depth, 1);
  assert.equal(layers.find(l => l.name === 'H').visible, false);
  assert.equal(layers.find(l => l.name === 'BG').visible, true);
  assert.equal(typeof byName.A0, 'number');
  for (const l of layers) assert.equal(l.color, 'none');
});

// 실제 PSD 는 맨 아래가 배경(Background) 레이어인 경우가 많다. 배경 레이어에는 레이어 색
// 속성이 없어 그대로 읽으면 getLayers 전체가 실패하고, 패널은 그 문서를 아예 못 연다.
test('getLayers reads a document whose bottom layer is a Background layer', () => {
  psRun('while (app.documents.length) app.activeDocument.close(SaveOptions.DONOTSAVECHANGES); app.documents.add(20, 20, 72, "lm-bg", NewDocumentMode.RGB, DocumentFill.WHITE); app.activeDocument.artLayers.add().name = "top"; "ok"');
  try {
    const bgName = psRun('app.activeDocument.backgroundLayer.name');
    const layers = psCall('getLayers');
    assert.deepEqual(layers.map(l => l.name), ['top', bgName]);
    assert.equal(layers[1].kind, 'layer');
    assert.equal(layers[1].color, 'none');
    assert.equal(typeof layers[1].id, 'number');
  } finally {
    psRun('app.activeDocument.close(SaveOptions.DONOTSAVECHANGES); "closed"');
  }
});

test('getLayers reads a document that has only a Background layer', () => {
  psRun('while (app.documents.length) app.activeDocument.close(SaveOptions.DONOTSAVECHANGES); app.documents.add(20, 20, 72, "lm-bg-only", NewDocumentMode.RGB, DocumentFill.WHITE); "ok"');
  try {
    const bgName = psRun('app.activeDocument.backgroundLayer.name');
    const layers = psCall('getLayers');
    assert.deepEqual(layers.map(l => l.name), [bgName]);
    assert.equal(layers[0].color, 'none');
  } finally {
    psRun('app.activeDocument.close(SaveOptions.DONOTSAVECHANGES); "closed"');
  }
});

test('selectLayers / getSelectedLayerIds round-trip (multi-select)', () => {
  const { byName } = buildFixture();
  psCall('selectLayers', [byName.B1, byName.GA]);
  assert.deepEqual(psCall('getSelectedLayerIds').sort((a, b) => a - b), [byName.B1, byName.GA].sort((a, b) => a - b));
  psCall('selectLayers', [byName.H]);
  assert.deepEqual(psCall('getSelectedLayerIds'), [byName.H]);
});

test('applyVisibility sets visibility as one history step', () => {
  const { byName } = buildFixture();
  const states = () => Number(psRun('app.activeDocument.historyStates.length'));
  // fixture 를 만드는 동안 히스토리가 기본 상한(50칸)에 닿아 있으면 한 칸이 늘어도
  // 가장 오래된 칸이 빠져 개수가 그대로다. 비우고 센다.
  psRun('app.purge(PurgeTarget.HISTORYCACHES); "purged"');
  const before = states();
  psCall('applyVisibility', { on: [byName.H], off: [byName.A0, byName.B1] });
  assert.equal(states(), before + 1);
  assert.equal(psRun('app.activeDocument.activeHistoryState.name'), 'LayerMemorier 미리보기');
  const vis = {};
  for (const l of psCall('getLayers')) vis[l.name] = l.visible;
  assert.equal(vis.H, true);
  assert.equal(vis.A0, false);
  assert.equal(vis.B1, false);
  assert.equal(vis.A1, true, 'layers not listed are untouched');

  psCall('applyVisibility', { on: [], off: [] });
  assert.equal(states(), before + 1, 'nothing to do leaves no history step');
});

// 리뷰 #2: 미리보기는 패널이 아는 문서에만 적용돼야 한다. layerID는 문서마다 겹친다.
test('applyVisibility refuses when the panel names a different document', () => {
  const { byName } = buildFixture();
  assert.throws(
    () => psCall('applyVisibility', { doc: { name: 'other.psd', path: 'D:/nowhere/other.psd' }, on: [], off: [byName.A0] }),
    /active document changed/);
  assert.equal(psCall('getLayers').find(l => l.name === 'A0').visible, true, 'nothing changed');
});

test('getOpenDocKeys lists open documents by path, unsaved ones by name', () => {
  const { psdPath } = buildFixture();
  psRun('app.documents.add(10, 10, 72, "lm-untitled"); "added"');
  try {
    const keys = psCall('getOpenDocKeys');
    assert.equal(keys.length, 2, JSON.stringify(keys));
    assert.ok(keys.some(k => k.toLowerCase() === psdPath.toLowerCase()), JSON.stringify(keys));
    assert.ok(keys.includes('lm-untitled'), JSON.stringify(keys));
  } finally {
    psRun('app.activeDocument.close(SaveOptions.DONOTSAVECHANGES); "closed"');
  }
});

test('docData round-trips through XMP and survives save/reopen', () => {
  const { byName } = buildFixture();
  assert.equal(psCall('readDocData'), null);
  const data = docDataFor(byName, 'D:/tmp/lm');
  psCall('writeDocData', data);
  assert.deepEqual(psCall('readDocData'), data);
  psRun('app.activeDocument.save(); "saved"');
  const reopened = reopenFixture();
  assert.deepEqual(reopened.byName, byName, 'layer ids must survive save/reopen');
  assert.deepEqual(psCall('readDocData'), data);
});

test('writeDocData keeps unicode intact', () => {
  buildFixture();
  const data = { version: 2, baseName: '알싸기 テスト', delimiter: '_', destination: 'D:/출력', categories: [], combos: [], excluded: [] };
  psCall('writeDocData', data);
  assert.deepEqual(psCall('readDocData'), data);
});
