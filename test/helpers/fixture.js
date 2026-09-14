'use strict';
const fs = require('fs');
const path = require('path');
const { psRun, psCall, ROOT } = require('./ps');

const PSD = path.join(ROOT, 'test', 'out', 'fixture.psd');
const TEMPLATE = path.join(ROOT, 'test', 'fixture', 'fixture-docdata.json');
const MAKE = path.join(ROOT, 'test', 'fixture', 'make-fixture.jsx').replace(/\\/g, '/');

function buildFixture() {
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

// 템플릿의 marksByName을 layerId 키 marks로 바꾼 문서 데이터.
function docDataFor(byName, destination = '') {
  const t = JSON.parse(fs.readFileSync(TEMPLATE, 'utf8'));
  const marks = {};
  for (const name of Object.keys(t.marksByName)) {
    if (!(name in byName)) throw new Error('fixture layer missing: ' + name);
    marks[String(byName[name])] = t.marksByName[name];
  }
  delete t.marksByName;
  return Object.assign(t, { marks, destination });
}

module.exports = { buildFixture, reopenFixture, docDataFor, PSD };
