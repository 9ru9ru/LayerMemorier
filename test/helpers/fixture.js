'use strict';
const fs = require('fs');
const path = require('path');
const { psRun, psCall, ROOT, assertOnlyTestDocs } = require('./ps');

const PSD = path.join(ROOT, 'test', 'out', 'fixture.psd');
const TEMPLATE = path.join(ROOT, 'test', 'fixture', 'fixture-docdata.json');
const MAKE = path.join(ROOT, 'test', 'fixture', 'make-fixture.jsx').replace(/\\/g, '/');

function buildFixture() {
  assertOnlyTestDocs(); // make-fixture.jsx 가 열린 문서를 전부 닫는다
  fs.mkdirSync(path.dirname(PSD), { recursive: true });
  const out = psRun(`var LM_FIXTURE_OUT = ${JSON.stringify(PSD.replace(/\\/g, '/'))}; $.evalFile(File(${JSON.stringify(MAKE)}))`);
  const { psdPath } = JSON.parse(out);
  const layers = psCall('getLayers');
  const byName = {};
  for (const l of layers) byName[l.name] = l.id;
  return { psdPath, layers, byName };
}

function reopenFixture() {
  psRun(`while (app.documents.length) app.activeDocument.close(SaveOptions.DONOTSAVECHANGES); app.open(File(${JSON.stringify(PSD.replace(/\\/g, '/'))})); "opened"`);
  const layers = psCall('getLayers');
  const byName = {};
  for (const l of layers) byName[l.name] = l.id;
  return { layers, byName };
}

// 템플릿의 combosByName(레이어 이름)을 layerId로 바꾼 version 2 문서 데이터.
function docDataFor(byName, destination = '') {
  const t = JSON.parse(fs.readFileSync(TEMPLATE, 'utf8'));
  const idOf = name => {
    if (!(name in byName)) throw new Error('fixture layer missing: ' + name);
    return byName[name];
  };
  t.combos = t.combosByName.map(c => ({ when: c.when, layers: c.layers.map(idOf) }));
  delete t.combosByName;
  return Object.assign(t, { destination });
}

module.exports = { buildFixture, reopenFixture, docDataFor, PSD };
