'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const TMP = path.join(ROOT, 'test', 'out', 'tmp');
const PS_EVAL = path.join(ROOT, 'tools', 'ps-eval.ps1');

// jsx 코드를 임시 파일에 써서 실행한다. 마지막 식의 값을 문자열로 돌려준다.
function psRun(code, { host = true } = {}) {
  fs.mkdirSync(TMP, { recursive: true });
  const file = path.join(TMP, `run_${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.jsx`);
  fs.writeFileSync(file, '\uFEFF' + code, 'utf8');
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS_EVAL, '-ScriptFile', file];
  if (!host) args.push('-NoHost');
  try {
    return execFileSync('powershell.exe', args, { encoding: 'utf8', timeout: 180000 }).replace(/\r?\n$/, '');
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

module.exports = { psRun, psCall, ROOT };
