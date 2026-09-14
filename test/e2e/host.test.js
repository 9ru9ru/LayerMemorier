'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { psRun, psCall } = require('../helpers/ps');
const { buildFixture } = require('../helpers/fixture');

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

test('selectLayers / getSelectedLayerIds round-trip (multi-select)', () => {
  const { byName } = buildFixture();
  psCall('selectLayers', [byName.B1, byName.GA]);
  assert.deepEqual(psCall('getSelectedLayerIds').sort((a, b) => a - b), [byName.B1, byName.GA].sort((a, b) => a - b));
  psCall('selectLayers', [byName.H]);
  assert.deepEqual(psCall('getSelectedLayerIds'), [byName.H]);
});

test('setLayerColor changes native color reported by getLayers', () => {
  const { byName } = buildFixture();
  psCall('setLayerColor', { id: byName.A0, color: 'violet' });
  psCall('setLayerColor', { id: byName.G, color: 'yellowColor' });
  const layers = psCall('getLayers');
  assert.equal(layers.find(l => l.name === 'A0').color, 'violet');
  assert.equal(layers.find(l => l.name === 'G').color, 'yellowColor');
  psCall('setLayerColor', { id: byName.A0, color: 'none' });
  assert.equal(psCall('getLayers').find(l => l.name === 'A0').color, 'none');
});
