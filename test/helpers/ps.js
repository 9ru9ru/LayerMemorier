'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const TMP = path.join(ROOT, 'test', 'out', 'tmp');
const PS_EVAL = path.join(ROOT, 'tools', 'ps-eval.ps1');

// 테스트가 만든 문서: test/out/ 아래 파일, 또는 이름이 lm- / lm_ 로 시작하는 새 문서.
function isTestDoc(key) {
  return /[\\/]test[\\/]out[\\/]/i.test(key) || /^lm[-_]/.test(key);
}

// 테스트는 포토샵 문서를 저장하지 않고 닫는다. 테스트가 만든 것이 아닌 문서가 열려 있으면
// 아무것도 닫지 않고 멈춘다 (2026-10-02: 사용자가 열어 둔 PSB를 테스트가 닫은 사고).
function assertOnlyTestDocs() {
  const foreign = psCall('getOpenDocKeys').filter(k => !isTestDoc(k));
  if (foreign.length) {
    throw new Error('테스트가 만들지 않은 문서가 열려 있어 멈춥니다. 저장하고 닫은 뒤 다시 실행하세요: ' + foreign.join(', '));
  }
}

const CLOSE_ALL = /while\s*\(\s*app\.documents\.length\s*\)/;

function runFile(file, host) {
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS_EVAL, '-ScriptFile', file];
  if (!host) args.push('-NoHost');
  return execFileSync('powershell.exe', args, { encoding: 'utf8', timeout: 180000 }).replace(/\r?\n$/, '');
}

function runCode(code) {
  fs.mkdirSync(TMP, { recursive: true });
  const file = path.join(TMP, `run_${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.jsx`);
  fs.writeFileSync(file, '\uFEFF' + code, 'utf8');
  try {
    return runFile(file, false);
  } finally {
    fs.unlinkSync(file);
  }
}

// 호환성 최대화 설정이 "묻기"면 PSD를 저장할 때 창이 떠서 테스트가 사람을 기다린다 (2026-11-06).
// 테스트 프로세스 동안만 "항상"으로 두고, 끝나면 원래 값으로 되돌린다.
let promptOff = false;
function turnOffFormatPrompt() {
  if (promptOff) return;
  promptOff = true;
  const was = runCode('String(app.preferences.maximizeCompatibility)');
  runCode('app.preferences.maximizeCompatibility = QueryStateType.ALWAYS; "x"');
  process.on('exit', () => runCode(`app.preferences.maximizeCompatibility = ${was}; "x"`));
}

// jsx 코드를 임시 파일에 써서 실행한다. 마지막 식의 값을 문자열로 돌려준다.
function psRun(code, { host = true } = {}) {
  turnOffFormatPrompt();
  if (CLOSE_ALL.test(code)) assertOnlyTestDocs();
  fs.mkdirSync(TMP, { recursive: true });
  const file = path.join(TMP, `run_${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.jsx`);
  fs.writeFileSync(file, '\uFEFF' + code, 'utf8');
  try {
    return runFile(file, host);
  } finally {
    fs.unlinkSync(file);
  }
}

// LM.<fn>(arg) 호출. 결과 JSON을 파싱한다. {error}면 throw.
function psCall(fn, arg) {
  const code = arg === undefined
    ? `LM.${fn}()`
    : `LM.${fn}(${JSON.stringify(JSON.stringify(arg))})`;
  const out = psRun(code);
  if (out === '' || out === 'undefined' || out === 'null') return null;
  let v;
  try { v = JSON.parse(out); } catch (e) { throw new Error(`${fn}: non-JSON result: ${out.slice(0, 200)}`); }
  if (v && typeof v === 'object' && v.error) throw new Error(`${fn}: ${v.error}`);
  return v;
}

module.exports = { psRun, psCall, ROOT, assertOnlyTestDocs };
