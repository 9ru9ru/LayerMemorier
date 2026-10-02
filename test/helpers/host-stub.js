'use strict';
// host/host.jsx 를 포토샵 없이 돌리기 위한 ExtendScript 전역 스텁 (vm).
// 필요한 만큼만 흉내 낸다: Action Manager 기록, 문서·복제본, 히스토리, 파일.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HOST = path.join(__dirname, '../../host/host.jsx');

function loadHost(opts = {}) {
  const o = Object.assign({ width: 1000, height: 1000, history: { index: 5, count: 5 }, failSave: false }, opts);
  const ps = { log: [], files: new Set(), folders: new Set(), closedDuplicates: 0, history: o.history };

  class Store {
    constructor() { this.data = {}; this.refs = []; }
    putBoolean(k, v) { this.data[k] = v; }
    putInteger(k, v) { this.data[k] = v; }
    putDouble(k, v) { this.data[k] = v; }
    putString(k, v) { this.data[k] = v; }
    putEnumerated(k, t, v) { this.data[k] = v; this.refs.push([k, t, v]); }
    putIdentifier(k, v) { this.refs.push([k, v]); }
    putIndex(k, v) { this.refs.push([k, v]); }
    putProperty(k, v) { this.refs.push([k, v]); }
    putReference(k, v) { if (v === undefined) this.refs.push(k); else this.data[k] = v; }
    putList(k, v) { this.data[k] = v; }
    putObject(k, t, v) { this.data[k] = v; }
    putPath(k, v) { this.data[k] = v; }
    putUnitDouble(k, u, v) { this.data[k] = v; }
  }

  function unit(v) { return { value: v, as: () => v }; }

  function makeDoc(name, w, h) {
    return { name, width: unit(w), height: unit(h) };
  }

  const savedState = { name: 'Open' };
  let state = savedState;
  const doc = makeDoc('a.psb', o.width, o.height);
  doc.fullName = { fsName: 'C:\\art\\a.psb' };
  Object.defineProperty(doc, 'activeHistoryState', {
    get: () => state,
    set: v => { ps.log.push(['historyState', v]); state = v; },
  });
  doc.suspendHistory = (name, script) => { vm.runInContext(script, ctx); state = { name }; };
  doc.duplicate = (name) => {
    const dup = makeDoc(name, o.width, o.height);
    dup.resizeImage = (w, h) => { dup.width = unit(w.value); dup.height = unit(h.value); ps.log.push(['resize', w.value, h.value]); };
    dup.close = () => { ps.closedDuplicates++; };
    app.activeDocument = dup;
    return dup;
  };

  const app = {
    documents: [doc],
    activeDocument: doc,
    displayDialogs: 'ALL',
    preferences: { rulerUnits: 'CM' },
    version: '21.0.2',
    charIDToTypeID: s => s,
    stringIDToTypeID: s => s,
  };

  function executeAction(id, desc) {
    ps.log.push([id, desc]);
    if (id === 'Expr') {
      if (o.failSave) throw new Error('save failed (stub)');
      ps.files.add(desc.data.Usng.data['In  '].fsName);
    }
  }

  function executeActionGet(ref) {
    if (ref.refs.some(r => r[0] === 'HstS')) {
      return { getInteger: k => (k === 'ItmI' ? ps.history.index : ps.history.count) };
    }
    throw new Error('executeActionGet: not stubbed ' + JSON.stringify(ref.refs));
  }

  function File(p) {
    this.fsName = p;
    Object.defineProperty(this, 'exists', { get: () => ps.files.has(p) });
    this.remove = () => ps.files.delete(p);
  }
  function Folder(p) {
    this.fsName = p;
    Object.defineProperty(this, 'exists', { get: () => ps.folders.has(p) });
    this.create = () => ps.folders.add(p);
    this.getFiles = mask => {
      const re = new RegExp('^' + mask.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
      return Array.from(ps.files).filter(f => f.startsWith(p + '/') && re.test(f.slice(p.length + 1))).map(f => new File(f));
    };
  }
  Folder.temp = { fsName: 'C:/Temp' };

  const ctx = vm.createContext({
    app, executeAction, executeActionGet, File, Folder, JSON,
    ActionDescriptor: Store, ActionReference: Store, ActionList: Store,
    UnitValue: function (v) { this.value = v; this.as = () => v; },
    Units: { PIXELS: 'PX' }, DialogModes: { NO: 'NO', ALL: 'ALL' },
    ResampleMethod: { BICUBICSHARPER: 'BICUBICSHARPER' }, SaveOptions: { DONOTSAVECHANGES: 'NO' },
    AnchorPosition: { MIDDLECENTER: 'MC' },
  });
  vm.runInContext(fs.readFileSync(HOST, 'utf8'), ctx, { filename: 'host.jsx' });
  ps.doc = doc;
  ps.docRef = { name: 'a.psb', path: 'C:\\art\\a.psb' };
  ps.savedState = savedState;
  return { LM: ctx.LM, ps };
}

module.exports = { loadHost, HOST };
