'use strict';
// 패널 스크립트(client/*.js)를 브라우저 없이 vm에 올린다. index.html의 <script> 순서대로, main.js(부팅)만 뺀다.
// DOM은 렌더 결과(innerHTML)를 읽을 만큼만 흉내 낸다. 실제 CEP 화면은 e2e(panel.test.js)에서 본다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CLIENT = path.join(__dirname, '../../client');

function fakeEl(width = 900, height = 700) {
  const el = {
    innerHTML: '', textContent: '', outerHTML: '', value: '', scrollTop: 0, dataset: {}, style: {},
    clientWidth: width, clientHeight: height,
    classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
    querySelector: () => fakeEl(width, height),
    querySelectorAll: () => [],
    closest: () => null,
    addEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
    nextElementSibling: null,
    appendChild() {},
  };
  Object.defineProperty(el, 'firstElementChild', { get: () => fakeEl(width, height) });
  return el;
}

function fakeCanvas(ctx) {
  const canvas = { width: 0, height: 0, style: {} };
  const c2d = {
    canvas,
    globalCompositeOperation: 'source-over',
    clearRect() { ctx.drawLog.push(['clear']); },
    drawImage(src) { ctx.drawLog.push([src.url || 'group', c2d.globalCompositeOperation]); },
  };
  canvas.getContext = () => c2d;
  return canvas;
}

function fakeFs(files) {
  return {
    NO_ERROR: 0,
    readFile: p => (p in files ? { err: 0, data: files[p] } : { err: 3 }),
    writeFile: (p, d) => { files[p] = d; return { err: 0 }; },
    makedir: () => ({ err: 0 }),
    readdir: p => ({ err: 0, data: Object.keys(files).filter(f => f.startsWith(p + '/')).map(f => f.slice(p.length + 1)) }),
    deleteFile: p => { delete files[p]; return { err: 0 }; },
  };
}

function memoryStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}
function throwingStorage() {
  const boom = () => { throw new Error('SecurityError (stub)'); };
  return { getItem: boom, setItem: boom, removeItem: boom };
}

function scriptOrder() {
  const html = fs.readFileSync(path.join(CLIENT, 'index.html'), 'utf8');
  return Array.from(html.matchAll(/<script src="([^"]+)"><\/script>/g)).map(m => m[1]).filter(s => s !== 'main.js' && s !== 'lib/CSInterface.js'); // CSInterface는 아래 스텁으로
}

function loadPanel(opts = {}) {
  const ctx = vm.createContext({ console, setTimeout, clearTimeout, Promise, Date, Map, Set, JSON, Math });
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  ctx.self = ctx;
  ctx.localStorage = opts.storage === 'throw' ? throwingStorage() : opts.storage || memoryStorage();
  // 문서에 건 리스너를 모아 둔다. 테스트가 입력 이벤트를 직접 흘려보낼 수 있게 (fireDoc).
  ctx.docListeners = {};
  ctx.document = {
    addEventListener(type, fn) { (ctx.docListeners[type] = ctx.docListeners[type] || []).push(fn); },
    getElementById: () => fakeEl(),
    querySelector: () => fakeEl(),
    querySelectorAll: () => [],
    createElement: () => fakeCanvas(ctx),
  };
  // 빠른 그리기 합성을 보려고 캔버스 호출을 ctx.drawLog에 남긴다. 그림은 지정 즉시 읽힌 것으로 친다.
  ctx.drawLog = [];
  ctx.Image = function () {
    const img = this;
    Object.defineProperty(img, 'src', { set(v) { img.url = v; Promise.resolve().then(() => img.onload && img.onload()); }, get() { return img.url; } });
  };
  ctx.CSInterface = function () { this.getSystemPath = () => '/ext'; this.evalScript = (s, cb) => cb('null'); this.getExtensionID = () => 'x'; };
  ctx.SystemPath = { EXTENSION: 'ext', USER_DATA: 'data' };
  ctx.CSEvent = function () {};
  // opts.files를 넘기면 패널을 다시 연 것처럼 디스크 내용을 이어 쓴다.
  ctx.cepFiles = opts.files || {};
  ctx.cep = { encoding: { UTF8: 'UTF8' }, fs: fakeFs(ctx.cepFiles) };
  for (const src of scriptOrder()) {
    const file = path.resolve(CLIENT, src);
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  }
  // const 로 선언된 전역(LMState, LMUI …)은 전역 객체의 속성이 아니므로 이름으로 꺼낸다.
  // 쓰기는 전역 객체에 (예: ctx.confirm = () => false 로 확인창 스텁).
  const api = new Proxy({}, {
    get: (_, name) => vm.runInContext(String(name), ctx),
    set: (_, name, value) => { ctx[name] = value; return true; },
  });
  return { ctx: api, el: (w, h) => fakeEl(w, h) };
}

module.exports = { loadPanel, fakeEl, memoryStorage };
