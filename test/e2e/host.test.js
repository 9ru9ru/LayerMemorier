'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { psRun, psCall } = require('../helpers/ps');

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
