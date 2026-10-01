# LayerMemorier 내보내기 옵션 확장 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 내보내기를 레퍼런스(Export Layers To Files Fast) 수준으로 넓힌다. 형식 7종과 형식별 옵션, 잘라내기(각자/공통 영역), 크기 %, 여백 px, 접미사·대소문자·덮어쓰기, 폴더 묶기(누적/값만)를 내보내기 탭으로 옮기고, 설정은 PSD마다 저장하면서 마지막 설정을 기억한다.

**Architecture:** 설정 규칙은 새 순수 모듈 `core/output.js`(기본값·정리·확장자·빠른 길 판정·영역 합치기)에 두고, `core/naming.js`가 그것으로 최종 경로를 만든다. 호스트 `exportOne`은 가시성만 원본에 적용(히스토리 1칸)한 뒤, 빠른 길이면 원본에서 웹용 저장, 아니면 합친 복제본을 만들어 자르기·크기·여백·형식 저장 후 닫는다. 공통 영역은 새 `LM.measureBounds`로 먼저 잰다. 패널은 `client/ui/output-options.js`가 설정 칸을, `client/export-defaults.js`가 마지막 설정 파일을 맡는다.

**Tech Stack:** CEP 9 패널(Chromium 63), ExtendScript ES3 호스트, Node `node --test`, 포토샵 2020 COM(`tools/ps-eval.ps1`), DevTools 프로토콜, `pngjs`.

**Spec:** `Plans/20261002_LayerMemorier_export_spec.md` (기반: `Plans/V 20260915_LayerMemorier_spec.md`, `Plans/20261001_LayerMemorier_combos_spec.md`)

## Global Constraints

- 브랜치 `feature/combos`에서 이어서 한다 (조합 작업 위에 올라간다).
- **E2E는 포토샵에 열린 문서를 저장하지 않고 전부 닫는다** (`buildFixture`). 첫 E2E 실행 전에 `psCall('getOpenDocKeys')`로 열린 문서를 확인하고, `test/out/` 아래가 아니거나 `lm-`로 시작하지 않는 문서가 하나라도 있으면 멈추고 사용자에게 저장·닫기를 요청한다.
- 패널 코드: Chromium 63. `?.`, `??`, `Object.fromEntries`, `Array.prototype.flat`, 매개변수 없는 `catch {}` 금지. 새 CSS는 flex `gap` 대신 margin.
- `host/host.jsx`: ES3, ASCII만. 사용자에게 보일 오류는 코드(`LM_EMPTY`, `LM_PNG8_TOO_LARGE`, `LM_NAME_EXHAUSTED`)로 던지고 패널이 한국어로 바꾼다.
- `core/*.js`: UMD (`LMCore.<이름>` / `module.exports`). DOM·CEP 의존 없음.
- 문서 데이터는 version 2 그대로, 선택 필드 `output`을 더한다. 값의 모양과 범위는 spec §3.1~3.2 그대로.
- 기본값(= `output`이 없고 마지막 설정도 없을 때)의 결과는 지금과 같다: PNG-24 투명, 잘라내기 없음, 100%, 여백 0, 덮어쓰기 켬, 폴더 이름 누적. 골든 테스트 80개가 그대로 통과해야 한다.
- 마지막 설정 파일: `%APPDATA%\LayerMemorier\export-defaults.json` (`output` 객체만, 출력명·구분자·폴더 제외).
- 커밋 메시지는 한국어, 끝에 `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- E2E는 `--test-concurrency=1`. 단일 파일은 `node --test --test-concurrency=1 test/e2e/<파일>`.
- 매니페스트 버전을 바꾸면 포토샵 재시작 뒤에 적용된다 (패널 크기 때 확인한 사실).

## Review Focus

1. 복제 길 도중 오류(저장 실패 등) → 임시 복제본이 남지 않고 원본이 활성 문서로 돌아온다 (Task 4 테스트).
2. 배경 레이어만 있는 PSD에서 잘라내기·TGA 알파 → 배경은 불투명이므로 전체 크기 그대로, 알파는 전부 255 (Task 4에서 배경 문서로 한 번 더 돌린다).
3. 덮어쓰기 끔 + 같은 이름이 이미 여러 개 → `(2)`, `(3)`… 순서대로, 다른 폴더의 같은 이름은 영향 없음 (Task 3 테스트).
4. 사용자의 실제 `export-defaults.json`이 테스트를 오염 → 패널 테스트 파일 전체가 시작 때 백업·삭제하고 끝날 때 복원 (Task 5).
5. 숫자 칸에 빈 값·소수·범위 밖 값 입력 → 기본값 또는 잘린 값으로 저장되고 칸도 그 값으로 다시 그려진다 (Task 1, Task 6).

---

## File Structure

| 파일 | 할 일 | 책임 |
|---|---|---|
| `core/output.js` | 새로 | 기본값, `normalize`, `extension`, `isFastPath`, `unionBounds` |
| `core/naming.js` | 고침 | 폴더 이름 방식, 접미사, 대소문자, 형식별 확장자 |
| `host/host.jsx` | 고침 | `exportOne` 재구성(가시성 → 빠른 길/복제 길), 형식별 저장, 고유 이름, `measureBounds` |
| `client/export-defaults.js` | 새로 | 마지막 설정 파일 읽기·쓰기 |
| `client/ui/output-options.js` | 새로 | 파일명 옵션·폴더 묶기·형식·형식별 옵션·크기 칸 그리기와 변경 처리 |
| `client/ui/export.js` | 고침 | 배치, `<details>` 접기, 실행 흐름(영역 재기 → 내보내기), 오류 코드 번역, 요약 |
| `client/ui/categories.js` | 고침 | 폴더 체크박스 삭제 |
| `client/state.js` | 고침 | `output` 채우기, `exportOpen` 상태 |
| `client/index.html` | 고침 | `core/output.js`, `export-defaults.js`, `ui/output-options.js` 로드 |
| `client/style.css` | 고침 | 내보내기 설정 칸 |
| `test/helpers/cells.js` | 새로 | fixture 칸 표, `expectedOn`, `visibleBounds`, `pixel` |
| `test/unit/output.test.js` | 새로 | output 규칙 |
| `test/unit/naming.test.js` | 고침 | 새 파일명 규칙 |
| `test/e2e/formats.test.js` | 새로 | 형식·잘라내기·크기·여백·덮어쓰기·정리 E2E |
| `test/e2e/export.test.js` | 고침 | 칸 표를 `cells.js`에서 가져옴 |
| `test/e2e/panel.test.js` | 고침 | 마지막 설정 격리, 실행 흐름, 설정 칸 |
| `README.md`, `CSXS/manifest.xml`, `package.json`, `Plans/V 20260915_LayerMemorier_spec.md` | 고침 | 문서, 0.3.0 |

---

### Task 1: core/output.js — 기본값과 정리

**Files:**
- Create: `core/output.js`
- Test: `test/unit/output.test.js`

**Interfaces:**
- Produces (`LMCore.output` / `require('../../core/output')`):
  - `DEFAULTS` — spec §3.1 객체.
  - `normalize(o) → output` — 무엇을 받든 완전한 새 객체. 입력 불변.
  - `extension(format) → 'png'|'jpg'|'tif'|'tga'|'bmp'|'psd'`
  - `isFastPath(o) → boolean` (o는 normalize된 값)
  - `unionBounds(list) → {left, top, right, bottom} | null` (`list`의 원소는 같은 모양 또는 null)

- [ ] **Step 1: 실패하는 테스트 쓰기**

`test/unit/output.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const O = require('../../core/output');

const deepFreeze = o => { Object.values(o).forEach(v => { if (v && typeof v === 'object') deepFreeze(v); }); return Object.freeze(o); };

test('normalize of nothing is the defaults (current behaviour: PNG-24, no trim)', () => {
  assert.deepEqual(O.normalize(undefined), O.DEFAULTS);
  assert.deepEqual(O.normalize(null), O.DEFAULTS);
  assert.deepEqual(O.normalize('junk'), O.DEFAULTS);
  assert.equal(O.DEFAULTS.format, 'png24');
  assert.equal(O.DEFAULTS.trim, 'none');
  assert.equal(O.DEFAULTS.overwrite, true);
  assert.equal(O.DEFAULTS.folderName, 'cumulative');
});

test('normalize keeps valid values and fills the rest', () => {
  const o = O.normalize({ format: 'jpg', jpg: { quality: 55 } });
  assert.equal(o.format, 'jpg');
  assert.equal(o.jpg.quality, 55);
  assert.equal(o.jpg.optimized, true);
  assert.deepEqual(o.png8, O.DEFAULTS.png8, 'other formats keep their defaults');
});

test('normalize replaces unknown enum values and wrong types with defaults', () => {
  const o = O.normalize({ format: 'gif', trim: 'some', letterCase: 'title', folderName: 'flat', overwrite: 'yes',
    png24: { matte: 'pink', transparency: 1 }, png8: { reduction: 'magic', dither: 'x' }, tif: { compression: 'rar' } });
  assert.equal(o.format, 'png24');
  assert.equal(o.trim, 'none');
  assert.equal(o.letterCase, 'keep');
  assert.equal(o.folderName, 'cumulative');
  assert.equal(o.overwrite, true);
  assert.equal(o.png24.matte, 'white');
  assert.equal(o.png24.transparency, true);
  assert.equal(o.png8.reduction, 'selective');
  assert.equal(o.png8.dither, 'diffusion');
  assert.equal(o.tif.compression, 'lzw');
});

test('normalize clamps and rounds numbers, accepts numeric strings, rejects blanks', () => {
  const o = O.normalize({ scale: 0, padding: -5, jpg: { quality: '150' }, png8: { colors: 1, ditherAmount: 33.6 }, tif: { quality: '' } });
  assert.equal(o.scale, 1);
  assert.equal(o.padding, 0);
  assert.equal(o.jpg.quality, 100);
  assert.equal(o.png8.colors, 2);
  assert.equal(o.png8.ditherAmount, 34);
  assert.equal(o.tif.quality, 100, 'blank falls back to the default');
  assert.equal(O.normalize({ scale: 5000 }).scale, 1000);
  assert.equal(O.normalize({ padding: 9999 }).padding, 2000);
  assert.equal(O.normalize({ scale: 'abc' }).scale, 100);
});

test('normalize accepts bit depths as numbers or strings and rejects others', () => {
  assert.equal(O.normalize({ tga: { depth: '24' } }).tga.depth, 24);
  assert.equal(O.normalize({ bmp: { depth: 16 } }).bmp.depth, 16);
  assert.equal(O.normalize({ bmp: { depth: 8 } }).bmp.depth, 32);
});

test('normalize sanitizes the suffix like file names and drops unknown keys', () => {
  const o = O.normalize({ suffix: 'a/b:c', extra: 1, png24: { extra: 2 } });
  assert.equal(o.suffix, 'a-b-c');
  assert.equal('extra' in o, false);
  assert.equal('extra' in o.png24, false);
});

test('normalize does not mutate its input', () => {
  const input = deepFreeze({ format: 'jpg', scale: 0, jpg: { quality: 500 } });
  O.normalize(input);
  assert.equal(input.scale, 0);
  assert.equal(input.jpg.quality, 500);
});

test('extension per format', () => {
  assert.deepEqual(['png24', 'png8', 'jpg', 'tif', 'tga', 'bmp', 'psd'].map(O.extension), ['png', 'png', 'jpg', 'tif', 'tga', 'bmp', 'psd']);
});

test('isFastPath: only PNG/JPG with no trim, scale or padding', () => {
  const n = o => O.normalize(o);
  assert.equal(O.isFastPath(n({})), true);
  assert.equal(O.isFastPath(n({ format: 'png8' })), true);
  assert.equal(O.isFastPath(n({ format: 'jpg' })), true);
  assert.equal(O.isFastPath(n({ format: 'tif' })), false);
  assert.equal(O.isFastPath(n({ format: 'psd' })), false);
  assert.equal(O.isFastPath(n({ trim: 'each' })), false);
  assert.equal(O.isFastPath(n({ scale: 50 })), false);
  assert.equal(O.isFastPath(n({ padding: 1 })), false);
});

test('unionBounds merges rectangles and skips nulls', () => {
  assert.equal(O.unionBounds([]), null);
  assert.equal(O.unionBounds([null, null]), null);
  assert.deepEqual(O.unionBounds([{ left: 40, top: 0, right: 240, bottom: 80 }, null, { left: 0, top: 10, right: 120, bottom: 40 }]),
    { left: 0, top: 0, right: 240, bottom: 80 });
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/unit/output.test.js`
Expected: FAIL — `Cannot find module '../../core/output'`

- [ ] **Step 3: 구현**

`core/output.js`:

```js
// export spec §3, §4 내보내기 설정. UMD: 브라우저는 LMCore.output, Node는 module.exports.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.LMCore = root.LMCore || {}; root.LMCore.output = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULTS = {
    format: 'png24',
    trim: 'none',
    scale: 100,
    padding: 0,
    letterCase: 'keep',
    suffix: '',
    overwrite: true,
    folderName: 'cumulative',
    png24: { transparency: true, interlaced: false, matte: 'white' },
    png8: {
      reduction: 'selective', colors: 256, dither: 'diffusion', ditherAmount: 100,
      transparency: true, transparencyDither: 'none', transparencyDitherAmount: 100,
      interlaced: false, matte: 'white',
    },
    jpg: { quality: 100, matte: 'white', icc: false, optimized: true, progressive: false },
    tif: { compression: 'lzw', quality: 100, alpha: true, icc: false, transparency: true },
    tga: { depth: 32, alpha: true, rle: true },
    bmp: { depth: 32, alpha: true, rle: false, flipRowOrder: false },
    psd: {},
  };

  const MATTES = ['none', 'white', 'black', 'gray', 'background', 'foreground'];
  const DITHERS = ['none', 'diffusion', 'pattern', 'noise'];
  const DEPTHS = [16, 24, 32];

  // 키마다 규칙: ['enum', 값들] | ['int', 최소, 최대] | ['bool'] | ['text']. 객체는 하위 키.
  const RULES = {
    format: ['enum', ['png24', 'png8', 'jpg', 'tif', 'tga', 'bmp', 'psd']],
    trim: ['enum', ['none', 'each', 'combined']],
    scale: ['int', 1, 1000],
    padding: ['int', 0, 2000],
    letterCase: ['enum', ['keep', 'lower', 'upper']],
    suffix: ['text'],
    overwrite: ['bool'],
    folderName: ['enum', ['cumulative', 'value']],
    png24: { transparency: ['bool'], interlaced: ['bool'], matte: ['enum', MATTES] },
    png8: {
      reduction: ['enum', ['perceptual', 'selective', 'adaptive', 'restrictive', 'blackWhite', 'grayscale', 'mac', 'windows']],
      colors: ['int', 2, 256],
      dither: ['enum', DITHERS],
      ditherAmount: ['int', 0, 100],
      transparency: ['bool'],
      transparencyDither: ['enum', DITHERS],
      transparencyDitherAmount: ['int', 0, 100],
      interlaced: ['bool'],
      matte: ['enum', MATTES],
    },
    jpg: { quality: ['int', 0, 100], matte: ['enum', MATTES], icc: ['bool'], optimized: ['bool'], progressive: ['bool'] },
    tif: { compression: ['enum', ['none', 'lzw', 'zip', 'jpg']], quality: ['int', 0, 100], alpha: ['bool'], icc: ['bool'], transparency: ['bool'] },
    tga: { depth: ['enum', DEPTHS], alpha: ['bool'], rle: ['bool'] },
    bmp: { depth: ['enum', DEPTHS], alpha: ['bool'], rle: ['bool'], flipRowOrder: ['bool'] },
    psd: {},
  };

  function clean(rule, value, fallback) {
    switch (rule[0]) {
      case 'enum': {
        // select 값은 문자열로 온다. 숫자 enum(비트 깊이)도 문자열로 받아 준다.
        const hit = rule[1].find(v => v === value || String(v) === String(value));
        return hit === undefined ? fallback : hit;
      }
      case 'int': {
        if (value === '' || value == null || typeof value === 'boolean') return fallback;
        const n = Number(value);
        if (!isFinite(n)) return fallback;
        return Math.min(rule[2], Math.max(rule[1], Math.round(n)));
      }
      case 'bool':
        return typeof value === 'boolean' ? value : fallback;
      case 'text':
        return typeof value === 'string' ? value.replace(/[\\/:*?"<>|]/g, '-') : fallback;
    }
    return fallback;
  }

  function normalizeWith(rules, defaults, input) {
    const src = input && typeof input === 'object' ? input : {};
    const out = {};
    for (const key of Object.keys(rules)) {
      const rule = rules[key];
      out[key] = Array.isArray(rule) ? clean(rule, src[key], defaults[key]) : normalizeWith(rule, defaults[key], src[key]);
    }
    return out;
  }

  function normalize(o) {
    return normalizeWith(RULES, DEFAULTS, o);
  }

  const EXT = { png24: 'png', png8: 'png', jpg: 'jpg', tif: 'tif', tga: 'tga', bmp: 'bmp', psd: 'psd' };

  function extension(format) {
    return EXT[format] || 'png';
  }

  // 원본에서 바로 웹용 저장을 할 수 있는가 (export spec §5.1).
  function isFastPath(o) {
    return (o.format === 'png24' || o.format === 'png8' || o.format === 'jpg') && o.trim === 'none' && o.scale === 100 && o.padding === 0;
  }

  function unionBounds(list) {
    let u = null;
    for (const b of list) {
      if (!b) continue;
      if (!u) u = { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
      else {
        u.left = Math.min(u.left, b.left);
        u.top = Math.min(u.top, b.top);
        u.right = Math.max(u.right, b.right);
        u.bottom = Math.max(u.bottom, b.bottom);
      }
    }
    return u;
  }

  return { DEFAULTS, normalize, extension, isFastPath, unionBounds };
});
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/unit/output.test.js`
Expected: PASS (10 tests)

Run: `npm test`
Expected: PASS (전부)

- [ ] **Step 5: 커밋**

```bash
git add core/output.js test/unit/output.test.js
git commit -m "core: 내보내기 설정 규칙 (기본값·정리·확장자·빠른 길·영역 합치기).

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: core/naming.js — 폴더 이름 방식·접미사·대소문자·확장자

**Files:**
- Modify: `core/naming.js`, `client/index.html`
- Test: `test/unit/naming.test.js`

**Interfaces:**
- Consumes: `output.normalize`, `output.extension`.
- Produces: `LMCore.naming.relativePath(doc, variation)` — `doc.output`(없으면 기본값)을 반영한 최종 상대 경로. `sanitize`, `token`은 그대로.

- [ ] **Step 1: 실패하는 테스트 덧붙이기**

`test/unit/naming.test.js` 끝에:

```js
// export spec §4: 폴더 이름 방식, 접미사, 대소문자, 형식별 확장자.
function birthDoc(output) {
  const costume = cat('C', '의상', ['기본의상'], '{v}');
  const clothes = cat('O', '옷', ['0', '1', '2'], '{c}{v}', true);
  return { baseName: '출산', delimiter: '_', categories: [costume, clothes], output };
}
const birthVariation = { C: 'C:기본의상', O: 'O:2' };

test('cumulative folder names carry the base name and every token so far (default)', () => {
  assert.equal(relativePath(birthDoc(undefined), birthVariation), '출산_기본의상_옷2/출산_기본의상_옷2.png');
  assert.equal(relativePath(birthDoc({ folderName: 'cumulative' }), birthVariation), '출산_기본의상_옷2/출산_기본의상_옷2.png');
});

test('value folder names use only that category token', () => {
  assert.equal(relativePath(birthDoc({ folderName: 'value' }), birthVariation), '옷2/출산_기본의상_옷2.png');
});

test('value folder with an empty label adds no folder level', () => {
  const doc = birthDoc({ folderName: 'value' });
  doc.categories[1].values[2].label = '';
  assert.equal(relativePath(doc, birthVariation), '출산_기본의상.png');
});

test('suffix and format extension go at the end of the file name', () => {
  const doc = { baseName: 'fx', delimiter: '_', categories: [cat('A', 'A', ['0', '1'], '{c}{v}'), cat('B', 'B', ['x'])] };
  const v = { A: 'A:1', B: 'B:x' };
  assert.equal(relativePath(Object.assign({ output: { format: 'jpg', suffix: '@2x' } }, doc), v), 'fx_A1_x@2x.jpg');
  for (const [format, ext] of [['png8', 'png'], ['tif', 'tif'], ['tga', 'tga'], ['bmp', 'bmp'], ['psd', 'psd']]) {
    assert.equal(relativePath(Object.assign({ output: { format } }, doc), v), 'fx_A1_x.' + ext);
  }
});

test('letter case applies to folders and the whole file name', () => {
  const doc = { baseName: 'Fx', delimiter: '_', categories: [cat('A', 'Ab', ['0'], '{c}{v}', true)] };
  const v = { A: 'A:0' };
  assert.equal(relativePath(Object.assign({ output: { letterCase: 'upper', suffix: 'x' } }, doc), v), 'FX_AB0/FX_AB0X.PNG');
  assert.equal(relativePath(Object.assign({ output: { letterCase: 'lower' } }, doc), v), 'fx_ab0/fx_ab0.png');
  assert.equal(relativePath(Object.assign({ output: { letterCase: 'keep' } }, doc), v), 'Fx_Ab0/Fx_Ab0.png');
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/unit/naming.test.js`
Expected: FAIL — value 폴더·접미사·대소문자 테스트 (지금은 무시하고 `.png`만 붙인다). 골든과 기존 테스트는 통과.

- [ ] **Step 3: 구현**

`core/naming.js` 전체:

```js
// spec §5.3 파일명, §5.4 폴더 + export spec §4 (폴더 이름 방식, 접미사, 대소문자, 확장자).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./output'));
  else { root.LMCore = root.LMCore || {}; root.LMCore.naming = factory(root.LMCore.output); }
})(typeof self !== 'undefined' ? self : this, function (output) {
  'use strict';

  const FORBIDDEN = /[\\/:*?"<>|]/g;

  function sanitize(s) {
    return String(s == null ? '' : s).replace(FORBIDDEN, '-').trim();
  }

  // 값 라벨이 빈 문자열이면 형식과 무관하게 빈 토큰.
  function token(category, value) {
    const label = sanitize(value.label);
    if (label === '') return '';
    const c = sanitize(category.name);
    switch (category.labelFormat) {
      case '{c}{v}': return c + label;
      case '{c}_{v}': return c + '_' + label;
      default: return label;
    }
  }

  function join(parts, delimiter) {
    return parts.filter(p => p !== '').join(delimiter);
  }

  function relativePath(doc, variation) {
    const out = output.normalize(doc.output);
    const base = sanitize(doc.baseName);
    const delimiter = doc.delimiter == null ? '_' : doc.delimiter;
    const tokens = [];
    const folders = [];
    for (const category of doc.categories) {
      const value = category.values.find(v => v.id === variation[category.id]);
      const t = value ? token(category, value) : '';
      tokens.push(t);
      if (!category.folder) continue;
      if (out.folderName === 'value') { if (t !== '') folders.push(t); }
      else folders.push(join([base].concat(tokens), delimiter));
    }
    const file = join([base].concat(tokens), delimiter) + out.suffix + '.' + output.extension(out.format);
    const path = folders.concat([file]).join('/');
    if (out.letterCase === 'lower') return path.toLowerCase();
    if (out.letterCase === 'upper') return path.toUpperCase();
    return path;
  }

  return { sanitize, token, relativePath };
});
```

`client/index.html`에서 `<script src="../core/combos.js"></script>` 다음 줄에 추가 (`naming.js`보다 앞이어야 한다):

```html
<script src="../core/output.js"></script>
```

- [ ] **Step 4: 통과 확인**

Run: `npm test`
Expected: PASS — naming 새 테스트 5개 포함, 골든 80개 그대로.

- [ ] **Step 5: 커밋**

```bash
git add core/naming.js client/index.html test/unit/naming.test.js
git commit -m "core: 파일명에 폴더 이름 방식·접미사·대소문자·형식별 확장자를 반영한다.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 호스트 — exportOne 재구성, 빠른 길 형식(PNG-24·PNG-8·JPG), 고유 이름

**Files:**
- Create: `test/helpers/cells.js`, `test/e2e/formats.test.js`
- Modify: `host/host.jsx`, `test/e2e/export.test.js`

**Interfaces:**
- Consumes: `LMCore.output.normalize/isFastPath` (테스트), 기존 `checkExpectedDoc`, `setVisibleMany`, `ensureFolder`.
- Produces (호스트):
  - `LM.exportOne({on, off, path, output?, fast?, crop?}) → {ok: true, path}` — `path`는 실제로 쓴 파일(`/` 구분). `output`이 없으면 PNG-24 기본 + 빠른 길.
  - 오류 코드: `LM_PNG8_TOO_LARGE`, `LM_NAME_EXHAUSTED`. 복제 길(`fast: false`)은 이 Task에서 `LM_COPY_PATH_NOT_READY`를 던진다 (Task 4가 채운다).
  - 내부: `applyVisibilityAs(name, on, off)`, `saveWeb(doc, file, o)`, `targetFile(path, overwrite)`, `extensionCase(o)`, `matteRgb(matte)`.
- Produces (테스트 헬퍼 `test/helpers/cells.js`): `CELL`, `expectedOn(name, variation)`, `visibleBounds(variation, hidden = [])`, `pixel(png, x, y)`.

- [ ] **Step 0: 열린 문서 확인 (Global Constraints)**

Run: `node -e "console.log(JSON.stringify(require('./test/helpers/ps').psCall('getOpenDocKeys')))"`
Expected: `[]` 또는 `test/out/` 아래 경로·`lm-`로 시작하는 이름만. 다른 문서가 있으면 멈추고 사용자에게 저장·닫기를 요청한다.

- [ ] **Step 1: 칸 표 헬퍼와 export.test.js 정리**

`test/helpers/cells.js`:

```js
'use strict';
// fixture 칸 표 (test/fixture/make-fixture.jsx). 이름 → [열, 행, rgb]. 칸은 40×40, 캔버스 240×160.
const CELL = {
  A0: [0, 0, [255, 0, 0]], A1: [1, 0, [0, 255, 0]], B0: [2, 0, [0, 0, 255]], B1: [3, 0, [255, 255, 0]],
  B2: [4, 0, [0, 255, 255]], N1: [5, 0, [255, 0, 255]], N2: [0, 1, [128, 128, 128]],
  GA: [1, 1, [255, 128, 0]], GB: [2, 1, [128, 0, 255]], H: [3, 1, [0, 0, 0]], BG: [4, 1, [255, 255, 255]],
};

// fixture 문서 데이터(조합)로 배리에이션 v 에서 그 칸이 보이는가. G 그룹(A1)이 꺼지면 GA·GB 도 안 보인다.
function expectedOn(name, v) {
  switch (name) {
    case 'A0': return v.cA === 'a0';
    case 'A1': return v.cA === 'a1';
    case 'B0': return v.cB === 'b0';
    case 'B1': return v.cB === 'b1';
    case 'B2': return v.cB === 'b2';
    case 'N1': return v.cN === 'n1';
    case 'N2': return v.cN === 'n2';
    case 'GA': return v.cA === 'a1' && v.cB === 'b0';
    case 'GB': return v.cA === 'a1';
    case 'H': return false;
    case 'BG': return true;
  }
  throw new Error(name);
}

// 배리에이션에서 보이는 칸들의 영역(px). hidden: 강제로 꺼 둔 레이어 이름들 (예: ['BG']).
function visibleBounds(v, hidden = []) {
  let b = null;
  for (const name of Object.keys(CELL)) {
    if (hidden.includes(name) || !expectedOn(name, v)) continue;
    const [col, row] = CELL[name];
    const r = { left: col * 40, top: row * 40, right: col * 40 + 40, bottom: row * 40 + 40 };
    b = b ? { left: Math.min(b.left, r.left), top: Math.min(b.top, r.top), right: Math.max(b.right, r.right), bottom: Math.max(b.bottom, r.bottom) } : r;
  }
  return b;
}

// pngjs 이미지의 (x, y) RGBA.
function pixel(png, x, y) {
  const i = (y * png.width + x) * 4;
  return [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]];
}

module.exports = { CELL, expectedOn, visibleBounds, pixel };
```

`test/e2e/export.test.js`에서 `const CELL = {…};` 블록과 `function expectedOn(name, v) {…}` 함수를 지우고, `require` 줄들 아래에 추가:

```js
const { CELL, expectedOn } = require('../helpers/cells');
```

(파일 안의 `pixel(png, col, row)` 함수는 칸 중앙을 읽는 다른 함수이므로 그대로 둔다.)

- [ ] **Step 2: 실패하는 E2E 쓰기**

`test/e2e/formats.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const { psRun, psCall, ROOT } = require('../helpers/ps');
const { buildFixture, docDataFor } = require('../helpers/fixture');
const { visibleBounds, pixel } = require('../helpers/cells');
const { enumerate } = require('../../core/variation');
const { buildJobs } = require('../../core/jobs');
const { managedLayerIds } = require('../../core/combos');
const { normalize, isFastPath, unionBounds } = require('../../core/output');

const DEST = path.join(ROOT, 'test', 'out', 'formats').replace(/\\/g, '/');
const out = name => path.join(DEST, name);
const head = (name, n) => fs.readFileSync(out(name)).subarray(0, n);
const png = name => PNG.sync.read(fs.readFileSync(out(name)));

// fixture 를 새로 만든다. hideBg 면 늘 보이는 배경 칸(BG, 조합 밖 레이어)을 꺼서 잘라내기 영역이 조합마다 달라지게 한다.
function setup({ hideBg = false } = {}) {
  const { byName } = buildFixture();
  if (hideBg) psCall('applyVisibility', { on: [], off: [byName.BG] });
  const docData = docDataFor(byName);
  return { layers: psCall('getLayers'), byName, docData, variations: enumerate(docData.categories) };
}

const V = (ctx, a, b, n) => ctx.variations.find(v => v.cA === a && v.cB === b && v.cN === n);

// 배리에이션 하나를 내보내는 exportOne 인자. output 은 normalize 전 값.
function jobFor(ctx, v, output, file, crop = null) {
  const o = normalize(output);
  const { jobs } = buildJobs(ctx.docData, ctx.layers, [v]);
  return { on: jobs[0].on, off: jobs[0].off, path: DEST + '/' + file, output: o, fast: isFastPath(o), crop };
}

// exportBegin → exportOne… → exportEnd 를 COM 호출 한 번으로. 각 결과(파싱된 객체)를 돌려준다.
function run(ctx, jobs) {
  const ids = managedLayerIds(ctx.docData.combos, ctx.layers);
  const lines = [`LM.exportBegin(${JSON.stringify(JSON.stringify({ layerIds: ids }))});`, 'var results = [];'];
  for (const j of jobs) lines.push(`results.push(LM.exportOne(${JSON.stringify(JSON.stringify(j))}));`);
  lines.push('LM.exportEnd();', 'JSON.stringify(results)');
  return JSON.parse(psRun(lines.join('\n'))).map(r => JSON.parse(r));
}

const okAll = rs => rs.forEach(r => assert.equal(r.ok, true, JSON.stringify(r)));

test('fast path: PNG-24 without transparency fills empty cells with the matte', () => {
  fs.rmSync(DEST, { recursive: true, force: true });
  const ctx = setup();
  const v = V(ctx, 'a0', 'b0', 'n1');
  okAll(run(ctx, [jobFor(ctx, v, { png24: { transparency: false, matte: 'white' } }, 'p24-opaque.png')]));
  const img = png('p24-opaque.png');
  assert.deepEqual(pixel(img, 60, 20), [255, 255, 255, 255], 'A1 cell is off in A0: white matte, opaque');
  assert.deepEqual(pixel(img, 20, 20).slice(0, 3), [255, 0, 0], 'A0 cell is red');
});

test('fast path: PNG-24 interlace flag, PNG-8 palette with transparency', () => {
  const ctx = setup();
  const v = V(ctx, 'a0', 'b0', 'n1');
  okAll(run(ctx, [
    jobFor(ctx, v, { png24: { interlaced: true } }, 'p24-inter.png'),
    jobFor(ctx, v, { format: 'png8' }, 'p8.png'),
    jobFor(ctx, v, { format: 'png8', png8: { interlaced: true, colors: 16 } }, 'p8-inter.png'),
  ]));
  assert.equal(head('p24-inter.png', 29)[28], 1, 'PNG-24 interlaced');
  const p8 = head('p8.png', 29);
  assert.equal(p8[25], 3, 'PNG-8 is a palette PNG (color type 3)');
  assert.equal(p8[28], 0);
  assert.equal(head('p8-inter.png', 29)[28], 1, 'PNG-8 interlaced');
  const img = png('p8.png');
  const red = pixel(img, 20, 20);
  assert.ok(red[0] > 240 && red[1] < 16 && red[2] < 16 && red[3] === 255, 'red survives the palette: ' + red);
  assert.equal(pixel(img, 60, 20)[3], 0, 'empty cell stays transparent');
});

test('fast path: JPG has a JPEG header and quality changes the size', () => {
  const ctx = setup();
  const v = V(ctx, 'a0', 'b0', 'n1');
  okAll(run(ctx, [
    jobFor(ctx, v, { format: 'jpg', jpg: { quality: 10 } }, 'q10.jpg'),
    jobFor(ctx, v, { format: 'jpg', jpg: { quality: 100 } }, 'q100.jpg'),
  ]));
  assert.deepEqual([...head('q10.jpg', 2)], [0xff, 0xd8]);
  assert.ok(fs.statSync(out('q10.jpg')).size < fs.statSync(out('q100.jpg')).size, 'quality 10 is smaller');
});

test('overwrite off saves "name (2)", "name (3)"; on replaces; other folders are independent', () => {
  fs.rmSync(DEST, { recursive: true, force: true });
  const ctx = setup();
  const v = V(ctx, 'a0', 'b0', 'n1');
  const [first] = run(ctx, [jobFor(ctx, v, {}, 'same.png')]);
  const [second] = run(ctx, [jobFor(ctx, v, { overwrite: false }, 'same.png')]);
  const [third] = run(ctx, [jobFor(ctx, v, { overwrite: false }, 'same.png')]);
  const [other] = run(ctx, [jobFor(ctx, v, { overwrite: false }, 'sub/same.png')]);
  assert.match(first.path, /\/same\.png$/);
  assert.match(second.path, /\/same \(2\)\.png$/);
  assert.match(third.path, /\/same \(3\)\.png$/);
  assert.match(other.path, /\/sub\/same\.png$/, 'a different folder starts fresh');
  const [replaced] = run(ctx, [jobFor(ctx, v, { overwrite: true }, 'same.png')]);
  assert.match(replaced.path, /\/same\.png$/);
  assert.deepEqual(fs.readdirSync(DEST).filter(f => f.startsWith('same')).sort(), ['same (2).png', 'same (3).png', 'same.png']);
});

test('fast path on a document wider than 8192px: PNG-8 refuses, PNG-24 and JPG fall back to saveAs', () => {
  psRun('while (app.documents.length) app.activeDocument.close(SaveOptions.DONOTSAVECHANGES); app.documents.add(8200, 10, 72, "lm-wide", NewDocumentMode.RGB, DocumentFill.WHITE); "ok"');
  try {
    const job = (format, file) => ({ on: [], off: [], path: DEST + '/' + file, output: normalize({ format }), fast: true, crop: null });
    const lines = ['var results = [];'];
    for (const j of [job('png8', 'wide8.png'), job('png24', 'wide24.png'), job('jpg', 'wide.jpg')]) {
      lines.push(`results.push(LM.exportOne(${JSON.stringify(JSON.stringify(j))}));`);
    }
    lines.push('JSON.stringify(results)');
    const res = JSON.parse(psRun(lines.join('\n'))).map(r => JSON.parse(r));
    assert.match(res[0].error, /LM_PNG8_TOO_LARGE/);
    assert.equal(fs.existsSync(out('wide8.png')), false);
    assert.equal(res[1].ok, true, JSON.stringify(res[1]));
    assert.equal(res[2].ok, true, JSON.stringify(res[2]));
    assert.equal(PNG.sync.read(fs.readFileSync(out('wide24.png'))).width, 8200);
    assert.deepEqual([...head('wide.jpg', 2)], [0xff, 0xd8]);
  } finally {
    psRun('while (app.documents.length) app.activeDocument.close(SaveOptions.DONOTSAVECHANGES); "closed"');
  }
});

test('exportOne without output still writes a transparent PNG-24 (old callers)', () => {
  const ctx = setup();
  const v = V(ctx, 'a0', 'b0', 'n1');
  const { jobs } = buildJobs(ctx.docData, ctx.layers, [v]);
  const [r] = run(ctx, [{ on: jobs[0].on, off: jobs[0].off, path: DEST + '/legacy.png' }]);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(pixel(png('legacy.png'), 60, 20)[3], 0);
});
```

- [ ] **Step 3: 실패 확인**

Run: `node --test --test-concurrency=1 test/e2e/formats.test.js`
Expected: FAIL — 결과에 `path`가 없음(`first.path` undefined), PNG-24 투명도 끔이 무시됨, PNG-8·JPG가 PNG-24로 저장됨 등. `exportOne without output` 테스트는 통과할 수 있다(기존 동작).

- [ ] **Step 4: 호스트 구현**

`host/host.jsx`:

(a) `var currentJob = null;` 줄을 지운다.

(b) `  function saveForWebPng24(file) {`부터 `LM.exportOne = wrap(...)` 블록의 끝(`  });`, 바로 다음이 `  LM.exportEnd = wrap`)까지를 아래로 바꾼다:

```js
  // Visibility changes on the original go into one history step (export and preview).
  function applyVisibilityAs(name, on, off) {
    var hasOn = on && on.length;
    var hasOff = off && off.length;
    if (!hasOn && !hasOff) return;
    pendingVisibility = { on: on || [], off: off || [] };
    try {
      app.activeDocument.suspendHistory(name, 'LM._runVisibility()');
    } finally {
      pendingVisibility = null;
    }
  }

  // Older callers send no output: transparent PNG-24 on the fast path, as before.
  var LEGACY_OUTPUT = {
    format: 'png24', trim: 'none', scale: 100, padding: 0, letterCase: 'keep', overwrite: true,
    png24: { transparency: true, interlaced: false, matte: 'white' }
  };

  function matteRgb(matte) {
    if (matte === 'white') return { r: 255, g: 255, b: 255 };
    if (matte === 'black') return { r: 0, g: 0, b: 0 };
    if (matte === 'gray') return { r: 127, g: 127, b: 127 };
    if (matte === 'background' || matte === 'foreground') {
      var c = (matte === 'background' ? app.backgroundColor : app.foregroundColor).rgb;
      return { r: Math.round(c.red), g: Math.round(c.green), b: Math.round(c.blue) };
    }
    return null;
  }

  function putMatte(d, matte) {
    var c = matteRgb(matte);
    d.putBoolean(cid('Mtt '), c !== null);
    if (c) {
      d.putInteger(cid('MttR'), c.r);
      d.putInteger(cid('MttG'), c.g);
      d.putInteger(cid('MttB'), c.b);
    }
  }

  function runSaveForWeb(d2, file) {
    d2.putBoolean(cid('SHTM'), false);
    d2.putBoolean(cid('SImg'), true);
    d2.putBoolean(cid('SSSO'), false);
    d2.putList(cid('SSLt'), new ActionList());
    d2.putBoolean(cid('DIDr'), false);
    d2.putPath(cid('In  '), file);
    var desc = new ActionDescriptor();
    desc.putObject(cid('Usng'), sid('SaveForWeb'), d2);
    executeAction(cid('Expr'), desc, DialogModes.NO);
  }

  function sfwPng24(file, o) {
    var d2 = new ActionDescriptor();
    d2.putEnumerated(cid('Op  '), cid('SWOp'), cid('OpSa'));
    d2.putEnumerated(cid('Fmt '), cid('IRFm'), cid('PN24'));
    d2.putBoolean(cid('Intr'), o.interlaced);
    d2.putBoolean(cid('Trns'), o.transparency);
    putMatte(d2, o.matte);
    runSaveForWeb(d2, file);
  }

  var PNG8_REDUCTION = { perceptual: 'Prcp', selective: 'Sltv', adaptive: 'Adpt', restrictive: 'Web ',
    blackWhite: 'FlBs', grayscale: 'FlBs', mac: 'FlBs', windows: 'FlBs' };
  var PNG8_PALETTE = { blackWhite: 'Black & White', grayscale: 'Grayscale', mac: 'Mac OS', windows: 'Windows' };
  var DITHER = { none: 'None', diffusion: 'Dfsn', pattern: 'Ptrn', noise: 'BNoi' };

  // Same keys as exportPng8AM in the reference script (Export Layers To Files Fast).
  function sfwPng8(file, o) {
    var d2 = new ActionDescriptor();
    d2.putEnumerated(cid('Op  '), cid('SWOp'), cid('OpSa'));
    d2.putEnumerated(cid('Fmt '), cid('IRFm'), cid('PNG8'));
    d2.putBoolean(cid('Intr'), o.interlaced);
    d2.putEnumerated(cid('RedA'), cid('IRRd'), cid(PNG8_REDUCTION[o.reduction]));
    if (PNG8_PALETTE[o.reduction]) d2.putString(cid('FBPl'), PNG8_PALETTE[o.reduction]);
    d2.putBoolean(cid('RChT'), false);
    d2.putBoolean(cid('RChV'), false);
    d2.putBoolean(cid('AuRd'), false);
    d2.putInteger(cid('NCol'), o.colors);
    d2.putEnumerated(cid('Dthr'), cid('IRDt'), cid(DITHER[o.dither]));
    d2.putInteger(cid('DthA'), o.ditherAmount);
    d2.putInteger(cid('DChS'), 0);
    d2.putInteger(cid('DCUI'), 0);
    d2.putBoolean(cid('DChT'), false);
    d2.putBoolean(cid('DChV'), false);
    d2.putInteger(cid('WebS'), 0);
    d2.putEnumerated(cid('TDth'), cid('IRDt'), cid(DITHER[o.transparencyDither]));
    d2.putInteger(cid('TDtA'), o.transparencyDitherAmount);
    d2.putBoolean(cid('Trns'), o.transparency);
    putMatte(d2, o.matte);
    runSaveForWeb(d2, file);
  }

  function sfwJpg(doc, file, o) {
    var opts = new ExportOptionsSaveForWeb();
    opts.format = SaveDocumentType.JPEG;
    opts.quality = o.quality;
    opts.optimized = o.optimized;
    opts.interlaced = o.progressive;
    opts.includeProfile = o.icc;
    var c = matteRgb(o.matte);
    if (c) {
      var m = new RGBColor();
      m.red = c.r;
      m.green = c.g;
      m.blue = c.b;
      opts.matteColor = m;
    }
    doc.exportDocument(file, ExportType.SAVEFORWEB, opts);
  }

  var JPEG_MATTE = { none: 'NONE', white: 'WHITE', black: 'BLACK', gray: 'SEMIGRAY', background: 'BACKGROUND', foreground: 'FOREGROUND' };

  function saveAsJpg(doc, file, o, ext) {
    var j = new JPEGSaveOptions();
    j.quality = Math.round(o.quality * 12 / 100);
    j.embedColorProfile = o.icc;
    j.matte = MatteType[JPEG_MATTE[o.matte]];
    if (o.progressive) {
      j.formatOptions = FormatOptions.PROGRESSIVE;
      j.scans = 3;
    } else {
      j.formatOptions = o.optimized ? FormatOptions.OPTIMIZEDBASELINE : FormatOptions.STANDARDBASELINE;
    }
    doc.saveAs(file, j, true, ext);
  }

  function extensionCase(o) {
    return o.letterCase === 'upper' ? Extension.UPPERCASE : Extension.LOWERCASE;
  }

  function tooBigForWeb(doc) {
    return doc.width.as('px') > 8192 || doc.height.as('px') > 8192;
  }

  // PNG-24 / PNG-8 / JPG through Save for Web on the active document `doc`,
  // with the 8192px fallbacks of export spec section 5.3.
  function saveWeb(doc, file, o) {
    var big = tooBigForWeb(doc);
    if (o.format === 'png8') {
      if (big) throw new Error('LM_PNG8_TOO_LARGE');
      sfwPng8(file, o.png8);
    } else if (o.format === 'jpg') {
      if (big) saveAsJpg(doc, file, o.jpg, extensionCase(o));
      else sfwJpg(doc, file, o.jpg);
    } else if (big) {
      var p = new PNGSaveOptions();
      p.compression = 6;
      p.interlaced = o.png24.interlaced;
      doc.saveAs(file, p, true, extensionCase(o));
    } else {
      sfwPng24(file, o.png24);
    }
  }

  // Overwrite off: "name (2).ext", "name (3).ext", ... (export spec 5.1 step 2).
  function targetFile(path, overwrite) {
    var f = new File(path);
    if (overwrite || !f.exists) return f;
    var slash = path.lastIndexOf('/');
    var dot = path.lastIndexOf('.');
    var stem = dot > slash ? path.substring(0, dot) : path;
    var ext = dot > slash ? path.substring(dot) : '';
    for (var n = 2; n <= 9999; n++) {
      var c = new File(stem + ' (' + n + ')' + ext);
      if (!c.exists) return c;
    }
    throw new Error('LM_NAME_EXHAUSTED');
  }

  // Filled in by the copy-path task (merged duplicate, trim, scale, padding, other formats).
  function saveCopy(doc, file, o, crop) {
    throw new Error('LM_COPY_PATH_NOT_READY');
  }

  LM.exportOne = wrap(function (job) {
    if (!hasDoc()) throw new Error('no document');
    var doc = app.activeDocument;
    var o = job.output || LEGACY_OUTPUT;
    var fast = job.output ? job.fast === true : true;
    applyVisibilityAs('LayerMemorier export', job.on, job.off);
    var target = targetFile(job.path, o.overwrite);
    ensureFolder(target.parent);
    if (target.exists) target.remove();
    if (fast) saveWeb(doc, target, o);
    else saveCopy(doc, target, o, job.crop || null);
    if (!target.exists) throw new Error('save failed, file not found: ' + target.fsName);
    return { ok: true, path: String(target.fsName).replace(/\\/g, '/') };
  });
```

(c) `LM.applyVisibility`의 본문에서 `var hasOn = …`부터 `return { ok: true };` 직전까지(직접 `pendingVisibility`를 세팅하고 `suspendHistory`를 부르는 부분)를 아래 한 줄로 바꾼다. `checkExpectedDoc` 줄은 그대로 둔다:

```js
    applyVisibilityAs('LayerMemorier \uBBF8\uB9AC\uBCF4\uAE30', a && a.on, a && a.off);
```

(`var pendingVisibility = null;`과 `LM._runVisibility`는 미리보기 섹션에 그대로 둔다. `var`는 IIFE 안에서 끌어올려지므로 위의 `applyVisibilityAs`가 쓸 수 있다.)

- [ ] **Step 5: 통과 확인**

Run: `node -e "const s=require('fs').readFileSync('host/host.jsx','utf8');console.log([...s].filter(c=>c.charCodeAt(0)>127).length)"`
Expected: `0`

Run: `node --test --test-concurrency=1 test/e2e/formats.test.js test/e2e/export.test.js test/e2e/host.test.js`
Expected: PASS — formats 6, export 2, host 전부 (미리보기 `applyVisibility` 테스트 포함).

- [ ] **Step 6: 커밋**

```bash
git add host/host.jsx test/helpers/cells.js test/e2e/formats.test.js test/e2e/export.test.js
git commit -m "host: 내보내기를 가시성 적용과 저장으로 나누고 PNG-24·PNG-8·JPG 옵션, 덮어쓰기 끔(번호)을 지원한다.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 호스트 — 복제 길(잘라내기·크기·여백), TIFF·TGA·BMP·PSD, measureBounds

**Files:**
- Modify: `host/host.jsx`
- Test: `test/e2e/formats.test.js`

**Interfaces:**
- Consumes: Task 3의 `applyVisibilityAs`, `saveWeb`, `extensionCase`, `targetFile`, `exportOne`.
- Produces:
  - `LM.measureBounds({on, off}) → {bounds: {left, top, right, bottom} | null}`
  - `exportOne`의 `fast: false` 경로 (spec §5.1 4단계), 오류 코드 `LM_EMPTY`.
  - 내부: `saveCopy(doc, file, o, crop)`, `contentBounds(d)`, `addAlphaFromTransparency(d)`, `saveByFormat(d, file, o)`.

- [ ] **Step 1: 실패하는 E2E 덧붙이기**

`test/e2e/formats.test.js` 끝에:

```js
// TGA(무압축 2) 픽셀: [B, G, R(, A)]. 머리 17번째 바이트 0x20 비트가 위→아래 순서.
function tgaPixel(buf, x, y) {
  const w = buf.readUInt16LE(12), h = buf.readUInt16LE(14), bpp = buf[16] / 8;
  const top = (buf[17] & 0x20) !== 0;
  const i = 18 + buf[0] + ((top ? y : h - 1 - y) * w + x) * bpp;
  return [...buf.subarray(i, i + bpp)];
}

// BMP 픽셀: [B, G, R(, A)]. 높이가 양수면 아래→위 순서, 행은 4바이트 정렬.
function bmpPixel(buf, x, y) {
  const off = buf.readUInt32LE(10), w = buf.readInt32LE(18), h = buf.readInt32LE(22), bpp = buf.readUInt16LE(28) / 8;
  const stride = Math.ceil(Math.abs(w) * bpp / 4) * 4;
  const i = off + (h > 0 ? h - 1 - y : y) * stride + x * bpp;
  return [...buf.subarray(i, i + bpp)];
}

test('measureBounds returns the visible area, null when nothing is visible', () => {
  const ctx = setup({ hideBg: true });
  const v = V(ctx, 'a1', 'b2', 'n1');
  const j = jobFor(ctx, v, {}, 'unused.png');
  assert.deepEqual(psCall('measureBounds', { on: j.on, off: j.off }).bounds, visibleBounds(v, ['BG']));
  const all = ctx.layers.map(l => l.id);
  assert.equal(psCall('measureBounds', { on: [], off: all }).bounds, null);
  assert.equal(Number(psRun('app.documents.length')), 1, 'no temporary document left');
});

test('copy path: trim each crops to the visible area; scale and padding resize; original untouched', () => {
  fs.rmSync(DEST, { recursive: true, force: true });
  const ctx = setup({ hideBg: true });
  const v = V(ctx, 'a1', 'b2', 'n1');
  const b = visibleBounds(v, ['BG']);
  const before = psCall('getLayers').map(l => [l.name, l.visible]);
  okAll(run(ctx, [
    jobFor(ctx, v, { trim: 'each' }, 'trim.png'),
    jobFor(ctx, v, { trim: 'each', scale: 50 }, 'trim50.png'),
    jobFor(ctx, v, { trim: 'each', padding: 10 }, 'trimpad.png'),
  ]));
  const t = png('trim.png');
  assert.deepEqual([t.width, t.height], [b.right - b.left, b.bottom - b.top]);
  assert.deepEqual(pixel(t, 20, 20), [0, 255, 0, 255], 'top-left of the crop is the A1 cell');
  const half = png('trim50.png');
  assert.deepEqual([half.width, half.height], [(b.right - b.left) / 2, (b.bottom - b.top) / 2]);
  const pad = png('trimpad.png');
  assert.deepEqual([pad.width, pad.height], [b.right - b.left + 20, b.bottom - b.top + 20]);
  assert.equal(pixel(pad, 0, 0)[3], 0, 'padding is transparent');
  assert.deepEqual(pixel(pad, 30, 30), [0, 255, 0, 255], 'content shifted by the padding');
  assert.equal(Number(psRun('app.documents.length')), 1);
  assert.equal(psRun('app.activeDocument.name'), 'fixture.psd');
  assert.deepEqual(psCall('getLayers').map(l => [l.name, l.visible]), before, 'visibility restored');
});

test('copy path: combined crop gives every file the union size', () => {
  const ctx = setup({ hideBg: true });
  const vs = [V(ctx, 'a1', 'b2', 'n1'), V(ctx, 'a0', 'b0', 'n2')];
  const jobs = vs.map((v, i) => jobFor(ctx, v, { trim: 'combined' }, `comb${i}.png`));
  const crop = unionBounds(jobs.map(j => psCall('measureBounds', { on: j.on, off: j.off }).bounds));
  assert.deepEqual(crop, unionBounds(vs.map(v => visibleBounds(v, ['BG']))));
  okAll(run(ctx, jobs.map(j => Object.assign({}, j, { crop }))));
  for (const name of ['comb0.png', 'comb1.png']) {
    const img = png(name);
    assert.deepEqual([img.width, img.height], [crop.right - crop.left, crop.bottom - crop.top], name);
  }
});

test('copy path formats: TIFF, TGA, BMP, PSD; 32-bit TGA/BMP keep transparency in alpha', () => {
  const ctx = setup({ hideBg: true });
  const v = V(ctx, 'a0', 'b0', 'n1');
  okAll(run(ctx, [
    jobFor(ctx, v, { format: 'tif' }, 'f.tif'),
    jobFor(ctx, v, { format: 'tga', tga: { rle: false } }, 'f.tga'),
    jobFor(ctx, v, { format: 'tga', tga: { depth: 24, rle: false } }, 'f24.tga'),
    jobFor(ctx, v, { format: 'bmp' }, 'f.bmp'),
    jobFor(ctx, v, { format: 'psd' }, 'f.psd'),
  ]));
  assert.ok(['II*\u0000', 'MM\u0000*'].includes(head('f.tif', 4).toString('latin1')), 'TIFF header');
  assert.equal(head('f.psd', 4).toString('latin1'), '8BPS');
  const tga = fs.readFileSync(out('f.tga'));
  assert.equal(tga[2], 2, 'uncompressed true-color');
  assert.equal(tga[16], 32);
  assert.deepEqual(tgaPixel(tga, 20, 20), [0, 0, 255, 255], 'A0 red, opaque');
  assert.equal(tgaPixel(tga, 60, 20)[3], 0, 'empty cell transparent in alpha');
  assert.equal(fs.readFileSync(out('f24.tga'))[16], 24);
  const bmp = fs.readFileSync(out('f.bmp'));
  assert.equal(bmp.toString('latin1', 0, 2), 'BM');
  assert.equal(bmp.readUInt16LE(28), 32);
  assert.deepEqual(bmpPixel(bmp, 20, 20), [0, 0, 255, 255]);
  assert.equal(bmpPixel(bmp, 60, 20)[3], 0);
});

test('copy path edge cases: empty + trim fails without a file, empty without trim saves, errors leave no temp document', () => {
  fs.rmSync(DEST, { recursive: true, force: true });
  setup();
  const all = psCall('getLayers').map(l => l.id);
  const lines = ['var results = [];'];
  const jobs = [
    { on: [], off: all, path: DEST + '/empty-trim.png', output: normalize({ trim: 'each' }), fast: false, crop: null },
    { on: [], off: all, path: DEST + '/empty-scale.png', output: normalize({ scale: 50 }), fast: false, crop: null },
    // 복제본을 만든 뒤 그 안에서 실패하게 한다 (뒤집힌 자르기 영역).
    { on: [], off: [], path: DEST + '/bad-crop.tif', output: normalize({ format: 'tif' }), fast: false, crop: { left: 50, top: 50, right: 10, bottom: 10 } },
  ];
  for (const j of jobs) lines.push(`results.push(LM.exportOne(${JSON.stringify(JSON.stringify(j))}));`);
  lines.push('JSON.stringify({ results: results, docs: app.documents.length, active: app.activeDocument.name })');
  const r = JSON.parse(psRun(lines.join('\n')));
  const res = r.results.map(x => JSON.parse(x));
  assert.match(res[0].error, /LM_EMPTY/);
  assert.equal(fs.existsSync(out('empty-trim.png')), false);
  assert.equal(res[1].ok, true, JSON.stringify(res[1]));
  assert.equal(png('empty-scale.png').width, 120);
  assert.ok(res[2].error, 'a failure inside the duplicate is reported');
  assert.equal(fs.existsSync(out('bad-crop.tif')), false);
  assert.equal(r.docs, 1, 'no temporary duplicate left behind');
  assert.equal(r.active, 'fixture.psd');
});

test('copy path on a Background-only document: trim keeps the full canvas, TGA alpha is opaque', () => {
  psRun('while (app.documents.length) app.activeDocument.close(SaveOptions.DONOTSAVECHANGES); app.documents.add(30, 20, 72, "lm-bg", NewDocumentMode.RGB, DocumentFill.WHITE); "ok"');
  try {
    const lines = ['var results = [];'];
    for (const j of [
      { on: [], off: [], path: DEST + '/bg-trim.png', output: normalize({ trim: 'each' }), fast: false, crop: null },
      { on: [], off: [], path: DEST + '/bg.tga', output: normalize({ format: 'tga', tga: { rle: false } }), fast: false, crop: null },
    ]) lines.push(`results.push(LM.exportOne(${JSON.stringify(JSON.stringify(j))}));`);
    lines.push('JSON.stringify(results)');
    const res = JSON.parse(psRun(lines.join('\n'))).map(x => JSON.parse(x));
    okAll(res);
    const img = png('bg-trim.png');
    assert.deepEqual([img.width, img.height], [30, 20]);
    assert.equal(tgaPixel(fs.readFileSync(out('bg.tga')), 5, 5)[3], 255);
  } finally {
    psRun('while (app.documents.length) app.activeDocument.close(SaveOptions.DONOTSAVECHANGES); "closed"');
  }
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test --test-concurrency=1 --test-name-pattern="measureBounds|copy path" test/e2e/formats.test.js`
Expected: FAIL — `LM.measureBounds`가 함수가 아님, 복제 길 결과가 `LM_COPY_PATH_NOT_READY`.

- [ ] **Step 3: 구현**

`host/host.jsx`에서 Task 3의 임시 `saveCopy` 함수(주석 포함)를 아래로 바꾼다:

```js
  function px(v) {
    return new UnitValue(v, 'px');
  }

  // Content area of the single merged layer of a duplicate; null when empty.
  function contentBounds(d) {
    var b = d.activeLayer.bounds;
    var r = { left: b[0].as('px'), top: b[1].as('px'), right: b[2].as('px'), bottom: b[3].as('px') };
    return (r.right - r.left <= 0 || r.bottom - r.top <= 0) ? null : r;
  }

  function cropTo(d, r) {
    d.crop([px(r.left), px(r.top), px(r.right), px(r.bottom)]);
  }

  // TGA/BMP keep transparency only through an alpha channel. 2026-10-02 probe:
  // a 32-bit TGA saved without one came out opaque white.
  function addAlphaFromTransparency(d) {
    var ch = d.channels.add();
    ch.name = 'Alpha 1';
    try {
      if (d.activeLayer.isBackgroundLayer) {
        d.selection.selectAll();
      } else {
        var ref = new ActionReference();
        ref.putProperty(cid('Chnl'), cid('fsel'));
        var desc = new ActionDescriptor();
        desc.putReference(cid('null'), ref);
        var to = new ActionReference();
        to.putEnumerated(cid('Chnl'), cid('Chnl'), cid('Trsp'));
        desc.putReference(cid('T   '), to);
        executeAction(cid('setd'), desc, DialogModes.NO);
      }
      d.selection.store(ch);
    } catch (e) {
      // Nothing to select (empty layer): the new channel stays black = fully transparent.
    }
    try { d.selection.deselect(); } catch (e2) {}
    d.activeChannels = d.componentChannels;
  }

  var TIFF_ENCODING = { none: 'NONE', lzw: 'TIFFLZW', zip: 'TIFFZIP', jpg: 'JPEG' };

  function saveTif(d, file, o, ext) {
    var t = new TiffSaveOptions();
    t.imageCompression = TIFFEncoding[TIFF_ENCODING[o.compression]];
    if (o.compression === 'jpg') t.jpegQuality = Math.round(o.quality * 12 / 100);
    t.alphaChannels = o.alpha;
    t.transparency = o.transparency;
    t.embedColorProfile = o.icc;
    t.layers = false;
    d.saveAs(file, t, true, ext);
  }

  function saveTga(d, file, o, ext) {
    var alpha = o.depth === 32 && o.alpha;
    if (alpha) addAlphaFromTransparency(d);
    var t = new TargaSaveOptions();
    t.resolution = o.depth === 16 ? TargaBitsPerPixels.SIXTEEN : o.depth === 24 ? TargaBitsPerPixels.TWENTYFOUR : TargaBitsPerPixels.THIRTYTWO;
    t.alphaChannels = alpha;
    t.rleCompression = o.rle;
    d.saveAs(file, t, true, ext);
  }

  function saveBmp(d, file, o, ext) {
    var alpha = o.depth === 32 && o.alpha;
    if (alpha) addAlphaFromTransparency(d);
    var b = new BMPSaveOptions();
    b.depth = o.depth === 16 ? BMPDepthType.SIXTEEN : o.depth === 24 ? BMPDepthType.TWENTYFOUR : BMPDepthType.THIRTYTWO;
    b.alphaChannels = alpha;
    b.rleCompression = o.rle;
    b.flipRowOrder = o.flipRowOrder;
    b.osType = OperatingSystem.WINDOWS;
    d.saveAs(file, b, true, ext);
  }

  function savePsd(d, file, ext) {
    var p = new PhotoshopSaveOptions();
    p.layers = false;
    p.alphaChannels = false;
    d.saveAs(file, p, true, ext);
  }

  function saveByFormat(d, file, o) {
    var ext = extensionCase(o);
    if (o.format === 'tif') return saveTif(d, file, o.tif, ext);
    if (o.format === 'tga') return saveTga(d, file, o.tga, ext);
    if (o.format === 'bmp') return saveBmp(d, file, o.bmp, ext);
    if (o.format === 'psd') return savePsd(d, file, ext);
    return saveWeb(d, file, o);
  }

  // Runs fn(dup) on a merged duplicate of doc in pixel units, then always closes
  // the duplicate and makes doc active again (export spec 5.1 step 4-6).
  function withMergedDuplicate(doc, name, fn) {
    var units = app.preferences.rulerUnits;
    var dup = null;
    app.preferences.rulerUnits = Units.PIXELS;
    try {
      dup = doc.duplicate(name, true);
      return fn(dup);
    } finally {
      if (dup) {
        try { dup.close(SaveOptions.DONOTSAVECHANGES); } catch (e) {}
      }
      app.activeDocument = doc;
      app.preferences.rulerUnits = units;
    }
  }

  function saveCopy(doc, file, o, crop) {
    withMergedDuplicate(doc, 'lm_export_tmp', function (dup) {
      if (crop) {
        cropTo(dup, crop);
      } else if (o.trim === 'each') {
        var b = contentBounds(dup);
        if (!b) throw new Error('LM_EMPTY');
        cropTo(dup, b);
      }
      if (o.scale !== 100) {
        dup.resizeImage(
          px(Math.max(1, Math.round(dup.width.as('px') * o.scale / 100))),
          px(Math.max(1, Math.round(dup.height.as('px') * o.scale / 100))),
          undefined, ResampleMethod.BICUBICSHARPER);
      }
      if (o.padding > 0) {
        dup.resizeCanvas(px(dup.width.as('px') + 2 * o.padding), px(dup.height.as('px') + 2 * o.padding), AnchorPosition.MIDDLECENTER);
      }
      saveByFormat(dup, file, o);
    });
  }

  // Content area of one variation (export spec 5.2); null when empty.
  LM.measureBounds = wrap(function (a) {
    if (!hasDoc()) throw new Error('no document');
    var doc = app.activeDocument;
    applyVisibilityAs('LayerMemorier export', a.on, a.off);
    return { bounds: withMergedDuplicate(doc, 'lm_measure_tmp', contentBounds) };
  });
```

- [ ] **Step 4: 통과 확인**

Run: `node -e "const s=require('fs').readFileSync('host/host.jsx','utf8');console.log([...s].filter(c=>c.charCodeAt(0)>127).length)"`
Expected: `0`

Run: `node --test --test-concurrency=1 test/e2e/formats.test.js test/e2e/export.test.js test/e2e/host.test.js`
Expected: PASS — formats 12개.

BMP RLE 확인 (spec이 옵션을 노출하므로 실제로 되는지): `jobFor(ctx, v, { format: 'bmp', bmp: { rle: true } }, 'rle.bmp')` 한 줄을 copy path formats 테스트의 run 목록에 넣고 다시 돌린다. 오류가 나면 Ruling으로 기록하고 Task 6에서 BMP RLE 칸을 비활성 + `title="16·24·32비트 BMP에는 RLE가 적용되지 않습니다"`로 둔다. 통과하면 그 줄을 남긴다.

- [ ] **Step 5: 커밋**

```bash
git add host/host.jsx test/e2e/formats.test.js
git commit -m "host: 합친 복제본으로 잘라내기·크기·여백, TIFF·TGA·BMP·PSD 저장, 공통 영역용 measureBounds.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 패널 — 마지막 설정 파일, output 채우기, 실행 흐름(영역 재기 → 내보내기)

**Files:**
- Create: `client/export-defaults.js`
- Modify: `client/index.html`, `client/state.js`, `client/ui/export.js`
- Test: `test/e2e/panel.test.js`

**Interfaces:**
- Consumes: `LMCore.output.{normalize, isFastPath, unionBounds}`, `LM.measureBounds`, `LM.exportOne` (Task 3·4).
- Produces:
  - `LMExportDefaults.load() → object | null`, `LMExportDefaults.save(output)`, `LMExportDefaults.file`.
  - `LMState.docData.output`은 늘 `normalize`된 객체 (refresh가 채운다).
  - `LMState.progress = {phase: 'measure'|'export', done, total, current}`.
  - `LMState.summary = {done, succeeded, renamed, failures, aborted}`.
  - `LMUI.export.run()`이 공통 영역이면 모든 `measureBounds`를 먼저 부른다.

- [ ] **Step 1: 실패하는 패널 테스트 쓰기**

`test/e2e/panel.test.js` 위쪽 `require` 줄에 `before`, `after`를 더한다:

```js
const { test, before, after } = require('node:test');
```

(기존 `const test = require('node:test');` 줄을 이것으로 바꾼다.)

`PRESETS` 상수 정의 바로 아래에:

```js
// 내보내기 설정을 바꾸는 테스트는 마지막 설정 파일을 쓴다. 사용자의 실제 파일이 테스트에
// 섞이지 않도록 파일 전체가 시작할 때 비우고, 끝나면 되돌린다 (export plan Review Focus 4).
const EXPORT_DEFAULTS = path.join(process.env.APPDATA, 'LayerMemorier', 'export-defaults.json');
let exportDefaultsBackup = null;
before(() => {
  if (fs.existsSync(EXPORT_DEFAULTS)) {
    exportDefaultsBackup = fs.readFileSync(EXPORT_DEFAULTS);
    fs.unlinkSync(EXPORT_DEFAULTS);
  }
});
after(() => {
  if (exportDefaultsBackup) fs.writeFileSync(EXPORT_DEFAULTS, exportDefaultsBackup);
  else if (fs.existsSync(EXPORT_DEFAULTS)) fs.unlinkSync(EXPORT_DEFAULTS);
});
const clearExportDefaults = () => { if (fs.existsSync(EXPORT_DEFAULTS)) fs.unlinkSync(EXPORT_DEFAULTS); };
```

파일 위쪽 `require`에 칸 표와 core를 더한다:

```js
const { PNG } = require('pngjs');
const { visibleBounds } = require('../helpers/cells');
const { enumerate } = require('../../core/variation');
const { unionBounds } = require('../../core/output');
```

파일 끝에:

```js
// export spec §3.3·3.4: 설정이 없는 PSD 는 마지막 설정에서 시작한다.
test('a PSD without export settings starts from export-defaults.json, otherwise from built-in defaults', async () => {
  try {
    fs.mkdirSync(path.dirname(EXPORT_DEFAULTS), { recursive: true });
    fs.writeFileSync(EXPORT_DEFAULTS, JSON.stringify({ format: 'jpg', jpg: { quality: 55 } }), 'utf8');
    const { byName } = buildFixture();
    psCall('writeDocData', docDataFor(byName));
    let p = await freshPanel();
    try {
      assert.equal(await p.eval('LMState.docData.output.format'), 'jpg');
      assert.equal(await p.eval('LMState.docData.output.jpg.quality'), 55);
      assert.equal(await p.eval('LMState.docData.output.scale'), 100, 'missing keys come from the defaults');
    } finally {
      p.close();
    }
    clearExportDefaults();
    p = await freshPanel();
    try {
      assert.equal(await p.eval('LMState.docData.output.format'), 'png24');
    } finally {
      p.close();
    }
  } finally {
    clearExportDefaults();
  }
});

// export spec §7: 공통 영역이면 모든 조합을 먼저 재고(measureBounds), 그다음 내보낸다.
test('export run with combined trim measures every job first; all files share the union size', async () => {
  const DEST = path.join(__dirname, '..', 'out', 'panel-combined');
  fs.rmSync(DEST, { recursive: true, force: true });
  const { byName } = buildFixture();
  psCall('applyVisibility', { on: [], off: [byName.BG] });
  const data = docDataFor(byName, DEST.replace(/\\/g, '/'));
  data.output = { trim: 'combined' };
  psCall('writeDocData', data);
  const p = await freshPanel();
  try {
    await p.eval(`document.querySelector('#tabs [data-tab=export]').click(); true`);
    await p.eval(`
      window.__calls = [];
      window.__origLMHostCall = LMHost.call;
      LMHost.call = (fn, arg) => { window.__calls.push(fn); return window.__origLMHostCall(fn, arg); };
      true`);
    await p.eval('LMUI.export.run()');
    const calls = (await p.eval('window.__calls')).filter(f => f === 'measureBounds' || f === 'exportOne');
    assert.deepEqual(calls, Array(12).fill('measureBounds').concat(Array(12).fill('exportOne')));
    const summary = await p.eval('LMState.summary');
    assert.deepEqual(summary.failures, []);
    assert.equal(summary.succeeded, 12);
    const crop = unionBounds(enumerate(data.categories).map(v => visibleBounds(v, ['BG'])));
    const files = [];
    for (const dir of fs.readdirSync(DEST)) for (const f of fs.readdirSync(path.join(DEST, dir))) files.push(path.join(DEST, dir, f));
    assert.equal(files.length, 12);
    for (const f of files) {
      const img = PNG.sync.read(fs.readFileSync(f));
      assert.deepEqual([img.width, img.height], [crop.right - crop.left, crop.bottom - crop.top], f);
    }
    assert.equal(JSON.parse(fs.readFileSync(EXPORT_DEFAULTS, 'utf8')).trim, 'combined', 'last-used settings saved after the run');
  } finally {
    await p.eval(`if (window.__origLMHostCall) { LMHost.call = window.__origLMHostCall; delete window.__origLMHostCall; } true`).catch(() => {});
    clearExportDefaults();
    p.close();
  }
});

// 호스트 오류 코드는 한국어로, 번호를 붙여 저장한 수는 요약에.
test('export run reports host error codes in Korean and counts renamed files', async () => {
  const DEST = path.join(__dirname, '..', 'out', 'panel-renamed');
  fs.rmSync(DEST, { recursive: true, force: true });
  const { byName } = buildFixture();
  const data = docDataFor(byName, DEST.replace(/\\/g, '/'));
  data.output = { overwrite: false };
  psCall('writeDocData', data);
  const p = await freshPanel();
  try {
    await p.eval(`document.querySelector('#tabs [data-tab=export]').click(); true`);
    await p.eval('LMUI.export.run()');
    assert.equal((await p.eval('LMState.summary')).renamed, 0);
    await p.eval('LMUI.export.run()');
    const second = await p.eval('LMState.summary');
    assert.equal(second.succeeded, 12);
    assert.equal(second.renamed, 12);
    assert.match(await p.eval(`document.querySelector('#tab-export .summary').textContent`), /번호를 붙여 저장 12개/);
    // 모든 레이어를 끄고 조합마다 각자 잘라내기 → 조합마다 "내용이 없어" 실패.
    // 가시성을 먼저 바꾸고 패널 새로고침(XMP 다시 읽기)이 끝난 뒤에 메모리 설정을 바꾼다.
    psCall('applyVisibility', { on: [], off: psCall('getLayers').map(l => l.id) });
    await new Promise(r => setTimeout(r, 1000));
    await p.eval(`LMState.docData.output = LMCore.output.normalize({ trim: 'each' }); LMState.docData.combos = []; LMApp.render(); true`);
    await p.eval('LMUI.export.run()');
    const third = await p.eval('LMState.summary');
    assert.equal(third.failures.length, 12);
    assert.equal(third.failures[0].error, '내용이 없어 잘라낼 수 없습니다');
  } finally {
    clearExportDefaults();
    p.close();
  }
});
```

- [ ] **Step 2: 실패 확인**

먼저 Global Constraints대로 열린 문서를 확인한다 (Task 3 Step 0과 같음).

Run: `node --test --test-concurrency=1 --test-name-pattern="export-defaults|combined trim measures|error codes" test/e2e/panel.test.js`
Expected: FAIL — `LMState.docData.output` undefined, `measureBounds` 호출 없음, `renamed` undefined.

- [ ] **Step 3: export-defaults.js**

`client/export-defaults.js`:

```js
// %APPDATA%\LayerMemorier\export-defaults.json (export spec §3.4): 마지막에 쓴 내보내기 설정.
const LMExportDefaults = (() => {
  const fs = window.cep.fs;
  const dir = LMHost.cs.getSystemPath(SystemPath.USER_DATA) + '/LayerMemorier';
  const file = dir + '/export-defaults.json';

  // 없거나 깨졌으면 null. 깨진 파일은 그대로 두고 다음 저장 때 새로 쓴다.
  function load() {
    const r = fs.readFile(file, cep.encoding.UTF8);
    if (r.err !== fs.NO_ERROR) return null;
    try {
      return JSON.parse(r.data);
    } catch (e) {
      return null;
    }
  }

  function save(output) {
    fs.makedir(dir);
    const r = fs.writeFile(file, JSON.stringify(output, null, 2), cep.encoding.UTF8);
    if (r.err !== fs.NO_ERROR) throw new Error('export-defaults.json 쓰기 실패 (' + r.err + ')');
  }

  return { load, save, file };
})();
```

`client/index.html`에서 `<script src="presets.js"></script>` 다음 줄에:

```html
<script src="export-defaults.js"></script>
```

- [ ] **Step 4: state.js — output 채우기**

`client/state.js`의 `refresh()`에서 문서 데이터를 정한 `if (info) { … }` 블록 끝(`docData = stored || this.newDocData(…)`를 감싼 `else` 블록을 닫은 직후, `if (info)` 블록 안)에:

```js
        // export spec §3.3: 내보내기 설정이 없는 PSD는 마지막에 쓴 설정에서 시작한다.
        docData.output = LMCore.output.normalize(docData.output || LMExportDefaults.load());
```

- [ ] **Step 5: export.js — 실행 흐름**

`client/ui/export.js`에서 `warningText` 함수 바로 아래에:

```js
  // 호스트 오류 코드(export spec §5) → 사용자에게 보일 글.
  const HOST_ERRORS = {
    LM_EMPTY: '내용이 없어 잘라낼 수 없습니다',
    LM_PNG8_TOO_LARGE: 'PNG-8은 가로·세로 8192px 이하 문서만 내보낼 수 있습니다',
    LM_NAME_EXHAUSTED: '같은 이름의 파일이 너무 많습니다 (9999개)',
  };

  function hostMessage(e) {
    const m = /LM_[A-Z0-9_]+/.exec(e.message);
    return m && HOST_ERRORS[m[0]] ? HOST_ERRORS[m[0]] : e.message;
  }

  function phaseText(p) {
    return (p.phase === 'measure' ? '영역 재는 중 ' : '내보내기 ') + p.done + ' / ' + p.total;
  }
```

`runBlock`의 진행 표시 줄을 다음으로 바꾼다 (`LMState.progress`가 있을 때의 `progress = …` 대입):

```js
      const p = LMState.progress;
      progress = `<div class="progress"><div style="width:${p.total ? Math.round(p.done / p.total * 100) : 0}%"></div></div><div class="row"><span>${esc(phaseText(p))}</span><span>${esc(p.current || '')}</span></div>`;
```

(기존 `const { done, total, current } = LMState.progress;` 구조 분해 줄은 지운다.)

같은 함수의 요약 줄을 다음으로 바꾼다:

```js
      summary = `<div class="summary"><b>${s.succeeded}개 성공</b>${s.renamed ? `, 번호를 붙여 저장 ${s.renamed}개` : ''}${s.failures.length ? `, ${s.failures.length}개 실패<ul class="err">${s.failures.map(f => `<li>${esc(f.path)}: ${esc(f.error)}</li>`).join('')}</ul>` : ''}${s.aborted ? ' (중단됨)' : ''}</div>`;
```

`renderProgressOnly`의 진행 글자 줄을 다음으로 바꾼다:

```js
    if (row) { row.children[0].textContent = phaseText(LMState.progress); row.children[1].textContent = current || ''; }
```

`run()` 전체를 다음으로 바꾼다:

```js
  async function run() {
    const d = LMState.docData;
    const pv = preview();
    if (pv.conflicts.length || !pv.jobs.length) return;
    const dest = d.destination.trim().replace(/\\/g, '/').replace(/\/+$/, '');
    // spec §9: 출력 폴더는 시작 전에 한 번 만들어 보고 쓸 수 있는지 확인한다.
    try {
      await LMHost.call('ensureDestination', { path: dest });
    } catch (e) {
      return LMApp.status('출력 폴더를 쓸 수 없습니다: ' + e.message);
    }
    const output = LMCore.output.normalize(d.output);
    const fast = LMCore.output.isFastPath(output);
    LMState.exporting = true; LMState.abort = false; LMState.summary = null;
    const failures = [];
    let done = 0;
    let succeeded = 0;
    let renamed = 0;
    LMApp.render();
    try {
      await LMApp.saveDocData();
      await LMHost.call('exportBegin', { layerIds: LMCore.combos.managedLayerIds(d.combos, LMState.layers) });
      let crop = null;
      let skip = false;
      // export spec §7 3단계: 공통 영역은 모든 조합을 먼저 잰다.
      if (output.trim === 'combined') {
        LMState.progress = { phase: 'measure', done: 0, total: pv.jobs.length, current: '' };
        renderProgressOnly();
        const measured = [];
        try {
          for (const job of pv.jobs) {
            if (LMState.abort) break;
            LMState.progress.current = job.relativePath;
            renderProgressOnly();
            const r = await LMHost.call('measureBounds', { on: job.on, off: job.off });
            measured.push(r.bounds);
            LMState.progress.done++;
            renderProgressOnly();
          }
          crop = LMCore.output.unionBounds(measured);
          if (!LMState.abort && !crop) { failures.push({ path: '(전체)', error: '모든 조합이 비어 있습니다' }); skip = true; }
        } catch (e) {
          failures.push({ path: '(영역 재기)', error: hostMessage(e) });
          skip = true;
        }
      }
      if (!skip && !LMState.abort) {
        LMState.progress = { phase: 'export', done: 0, total: pv.jobs.length, current: '' };
        renderProgressOnly();
        for (const job of pv.jobs) {
          if (LMState.abort) break;
          LMState.progress.current = job.relativePath;
          renderProgressOnly();
          const path = dest + '/' + job.relativePath;
          try {
            const r = await LMHost.call('exportOne', { on: job.on, off: job.off, path, output, fast, crop });
            succeeded++;
            if (r && r.path && r.path.toLowerCase() !== path.toLowerCase()) renamed++;
          } catch (e) {
            failures.push({ path: job.relativePath, error: hostMessage(e) });
          }
          done++;
          LMState.progress.done = done;
          renderProgressOnly();
        }
      }
    } catch (e) {
      failures.push({ path: '(시작)', error: hostMessage(e) });
    } finally {
      try { await LMHost.call('exportEnd'); } catch (e) { failures.push({ path: '(복원)', error: e.message }); }
      LMState.exporting = false;
      LMState.summary = { done, succeeded, renamed, failures, aborted: LMState.abort };
      LMState.progress = null;
      try { LMExportDefaults.save(output); } catch (e) { LMApp.status(e.message); }
      try { await LMApp.refresh(); } catch (e) { LMApp.status(e.message); }
    }
  }
```

- [ ] **Step 6: 통과 확인**

Run: `node --test --test-concurrency=1 test/e2e/panel.test.js`
Expected: PASS — 새 테스트 3개와 기존 패널 테스트 전부 (시작 실패 테스트의 `(시작)`·`0개 성공` 포함).

- [ ] **Step 7: 커밋**

```bash
git add client/export-defaults.js client/index.html client/state.js client/ui/export.js test/e2e/panel.test.js
git commit -m "panel: 마지막 내보내기 설정 기억, 공통 영역은 먼저 재고 내보내기, 오류 코드 한국어, 번호 저장 수 요약.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 패널 — 내보내기 설정 칸, 폴더 묶기 이동, 접기

**Files:**
- Create: `client/ui/output-options.js`
- Modify: `client/ui/export.js`, `client/ui/categories.js`, `client/state.js`, `client/index.html`, `client/style.css`
- Test: `test/e2e/panel.test.js`

**Interfaces:**
- Consumes: `LMState.docData.output`(Task 5), `LMExportDefaults.save`, `LMCore.output.normalize`, `LMCore.naming.relativePath`, `LMCore.variation.enumerate`.
- Produces:
  - `LMUI.outputOptions.render(docData) → html`. DOM 계약: 설정 칸은 `[data-out="<점 경로>"]`(예 `format`, `png8.colors`), 폴더 체크는 `[data-folder-cat="<catId>"]`, 형식 옵션 묶음 `.format-options`.
  - `<details data-open="include|exclude|warnings">`, 요약 글 `이번만 내보낼 값 (저장 안 됨)`, `항상 뺄 조합 (PSD에 저장)`, `경고 n개`.
  - `LMState.exportOpen = {include?, exclude?, warnings?}` (세션).
  - 카테고리 탭에는 `[data-field=folder]`가 없다.

- [ ] **Step 1: 실패하는 패널 테스트 쓰기**

`test/e2e/panel.test.js` 끝에:

```js
const firstPreviewLine = `document.querySelector('#tab-export .preview').textContent.split('\\n')[0]`;

test('export tab: format options follow the format; numbers are clamped; other formats keep their values', async () => {
  const { byName } = buildFixture();
  psCall('writeDocData', docDataFor(byName));
  const p = await freshPanel();
  try {
    await p.eval(`document.querySelector('#tabs [data-tab=export]').click(); true`);
    const has = sel => p.eval(`!!document.querySelector('#tab-export ${sel}')`);
    assert.equal(await has('[data-out="png24.interlaced"]'), true);
    await p.eval(setField('#tab-export select[data-out=format]', 'png8'));
    await settle();
    assert.equal(await has('[data-out="png24.interlaced"]'), false);
    assert.equal(await has('[data-out="png8.colors"]'), true);
    assert.equal(psCall('readDocData').output.format, 'png8');
    await p.eval(setField('#tab-export select[data-out="png8.dither"]', 'noise'));
    await settle();
    assert.equal(await p.eval(`document.querySelector('#tab-export [data-out="png8.ditherAmount"]').disabled`), true, 'amount only for diffusion');
    await p.eval(setField('#tab-export select[data-out=format]', 'jpg'));
    await settle();
    await p.eval(setField('#tab-export [data-out="jpg.quality"]', '150'));
    await settle();
    assert.equal(psCall('readDocData').output.jpg.quality, 100);
    assert.equal(await p.eval(`document.querySelector('#tab-export [data-out="jpg.quality"]').value`), '100', 'field redrawn with the clamped value');
    assert.equal(psCall('readDocData').output.png8.dither, 'noise', 'PNG-8 settings survive a format switch');
    assert.equal(JSON.parse(fs.readFileSync(EXPORT_DEFAULTS, 'utf8')).format, 'jpg', 'every change updates the last-used settings');
  } finally {
    clearExportDefaults();
    p.close();
  }
});

test('export tab: suffix, letter case, format and folder grouping show in the preview paths', async () => {
  const { byName } = buildFixture();
  psCall('writeDocData', docDataFor(byName));
  const p = await freshPanel();
  try {
    await p.eval(`document.querySelector('#tabs [data-tab=export]').click(); true`);
    assert.equal(await p.eval(firstPreviewLine), 'fx_A0/fx_A0_0_1.png');
    await p.eval(setField('#tab-export [data-out=suffix]', '@2x'));
    await settle();
    await p.eval(setField('#tab-export select[data-out=letterCase]', 'upper'));
    await settle();
    await p.eval(setField('#tab-export select[data-out=format]', 'jpg'));
    await settle();
    assert.equal(await p.eval(firstPreviewLine), 'FX_A0/FX_A0_0_1@2X.JPG');
    await p.eval(`document.querySelector('#tab-export [data-folder-cat=cB]').click(); true`);
    await settle();
    assert.equal(psCall('readDocData').categories.find(c => c.id === 'cB').folder, true);
    assert.equal(await p.eval(firstPreviewLine), 'FX_A0/FX_A0_0/FX_A0_0_1@2X.JPG');
    await p.eval(setField('#tab-export select[data-out=folderName]', 'value'));
    await settle();
    assert.equal(await p.eval(firstPreviewLine), 'A0/0/FX_A0_0_1@2X.JPG');
    await p.eval(`document.querySelector('#tabs [data-tab=categories]').click(); true`);
    assert.equal(await p.eval(`document.querySelector('#tab-categories [data-field=folder]')`), null, 'folder checkbox lives only in the export tab');
  } finally {
    clearExportDefaults();
    p.close();
  }
});

test('export tab: run-only values, always-excluded combos and warnings are collapsible', async () => {
  const { byName } = buildFixture();
  psCall('writeDocData', docDataFor(byName));
  const p = await freshPanel();
  try {
    await p.eval(`document.querySelector('#tabs [data-tab=export]').click(); true`);
    const det = name => p.eval(`(() => { const d = document.querySelector('#tab-export details[data-open=${name}]'); return d ? { open: d.open, text: d.querySelector('summary').textContent } : null; })()`);
    assert.deepEqual(await det('include'), { open: false, text: '이번만 내보낼 값 (저장 안 됨)' });
    assert.deepEqual(await det('exclude'), { open: false, text: '항상 뺄 조합 (PSD에 저장)' });
    assert.equal(await det('warnings'), null, 'no warnings, no box');
    await p.eval(`document.querySelector('#tab-export .include input[data-category=cN][data-value=n1]').click(); true`);
    assert.equal((await det('include')).open, true, 'opens once a value is unchecked');
    await p.eval(`LMState.docData.combos.push({ when: { cA: 'a0' }, layers: [999999] }); LMApp.render(); true`);
    assert.deepEqual(await det('warnings'), { open: false, text: '경고 1개' });
    for (const [label, w, h] of [['export-520', 520, 760], ['export-900', 900, 760]]) {
      await p.emulate(w, h);
      await p.eval('LMApp.render(); true');
      await p.shot(label);
      assert.ok(await p.eval(`document.documentElement.scrollWidth <= window.innerWidth + 1`), label + ': no horizontal scroll');
    }
  } finally {
    await p.emulate(null).catch(() => {});
    p.close();
  }
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test --test-concurrency=1 --test-name-pattern="export tab: format options|export tab: suffix|collapsible" test/e2e/panel.test.js`
Expected: FAIL — `select[data-out=format]` 없음.

- [ ] **Step 3: output-options.js**

`client/ui/output-options.js`:

```js
// 내보내기 설정 칸 (export spec §6): 파일명 옵션, 폴더 묶기, 형식과 형식별 옵션, 크기.
// 값은 LMState.docData.output(normalize된 것). 바뀌면 PSD와 마지막 설정 파일에 쓴다.
LMUI.outputOptions = (() => {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const MATTES = [['none', '없음'], ['white', '흰색'], ['black', '검정'], ['gray', '회색'], ['background', '배경색'], ['foreground', '전경색']];
  const DITHERS = [['none', '없음'], ['diffusion', '확산'], ['pattern', '패턴'], ['noise', '노이즈']];
  const FORMATS = [['png24', 'PNG-24'], ['png8', 'PNG-8'], ['jpg', 'JPG'], ['tif', 'TIFF'], ['tga', 'TGA'], ['bmp', 'BMP'], ['psd', 'PSD']];
  const REDUCTIONS = [['perceptual', '지각적'], ['selective', '선택적'], ['adaptive', '적응적'], ['restrictive', '제한적 (웹)'],
    ['blackWhite', '흑백'], ['grayscale', '회색조'], ['mac', 'Mac OS'], ['windows', 'Windows']];
  const COMPRESSIONS = [['none', '없음'], ['lzw', 'LZW'], ['zip', 'ZIP'], ['jpg', 'JPG']];
  const DEPTHS = [[16, '16비트'], [24, '24비트'], [32, '32비트']];
  const TRIMS = [['none', '안 함'], ['each', '조합마다 각자'], ['combined', '모든 조합 공통 영역']];
  const CASES = [['keep', '그대로'], ['lower', '소문자'], ['upper', '대문자']];
  const TRIM_TIP = '모든 조합 공통 영역: 모든 파일의 크기·위치가 같아집니다. 영역을 먼저 재므로 시간이 약 2배 걸립니다.';

  function get(o, key) {
    return key.split('.').reduce((x, k) => x[k], o);
  }

  function select(o, key, items, disabled, title) {
    const cur = String(get(o, key));
    const opts = items.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === cur ? 'selected' : ''}>${esc(t)}</option>`).join('');
    return `<select data-out="${key}" ${disabled ? 'disabled' : ''} ${title ? `title="${esc(title)}"` : ''}>${opts}</select>`;
  }

  function check(o, key, label, disabled) {
    return `<label class="opt"><input type="checkbox" data-out="${key}" ${get(o, key) ? 'checked' : ''} ${disabled ? 'disabled' : ''}>${esc(label)}</label>`;
  }

  function number(o, key, min, max, disabled) {
    return `<input type="number" class="num" data-out="${key}" min="${min}" max="${max}" value="${esc(get(o, key))}" ${disabled ? 'disabled' : ''}>`;
  }

  // label 은 글자, control 은 이미 만든 html.
  function field(label, control, unit) {
    return `<label class="opt">${esc(label)}${control}${unit ? esc(unit) : ''}</label>`;
  }

  // 비활성 규칙은 export spec §6 그대로.
  function formatOptions(o) {
    switch (o.format) {
      case 'png24':
        return check(o, 'png24.transparency', '투명도') + check(o, 'png24.interlaced', '인터레이스') +
          field('매트', select(o, 'png24.matte', MATTES, o.png24.transparency));
      case 'png8': {
        const p = o.png8;
        return field('색상 감소', select(o, 'png8.reduction', REDUCTIONS)) +
          field('색', number(o, 'png8.colors', 2, 256)) +
          field('디더', select(o, 'png8.dither', DITHERS)) +
          field('양', number(o, 'png8.ditherAmount', 0, 100, p.dither !== 'diffusion'), '%') +
          check(o, 'png8.transparency', '투명도') +
          field('투명도 디더', select(o, 'png8.transparencyDither', DITHERS, !p.transparency)) +
          field('양', number(o, 'png8.transparencyDitherAmount', 0, 100, !p.transparency || p.transparencyDither !== 'diffusion'), '%') +
          check(o, 'png8.interlaced', '인터레이스') +
          field('매트', select(o, 'png8.matte', MATTES, p.transparency));
      }
      case 'jpg':
        return field('품질', number(o, 'jpg.quality', 0, 100)) + field('매트', select(o, 'jpg.matte', MATTES)) +
          check(o, 'jpg.icc', 'ICC 프로파일') + check(o, 'jpg.optimized', '최적화') + check(o, 'jpg.progressive', '프로그레시브');
      case 'tif':
        return field('압축', select(o, 'tif.compression', COMPRESSIONS)) +
          field('품질', number(o, 'tif.quality', 0, 100, o.tif.compression !== 'jpg')) +
          check(o, 'tif.alpha', '알파 채널') + check(o, 'tif.icc', 'ICC 프로파일') + check(o, 'tif.transparency', '투명도');
      case 'tga':
        return field('비트 깊이', select(o, 'tga.depth', DEPTHS)) + check(o, 'tga.alpha', '알파 채널', o.tga.depth !== 32) + check(o, 'tga.rle', 'RLE 압축');
      case 'bmp':
        return field('비트 깊이', select(o, 'bmp.depth', DEPTHS)) + check(o, 'bmp.alpha', '알파 채널', o.bmp.depth !== 32) +
          check(o, 'bmp.rle', 'RLE 압축') + check(o, 'bmp.flipRowOrder', '행 순서 뒤집기');
      default:
        return '<span class="hint">레이어를 합친 사본으로 저장합니다.</span>';
    }
  }

  // 폴더 이름 예시: 지금 문서의 첫 배리에이션으로 만든 폴더 경로.
  function folderExample(d, mode) {
    const v = LMCore.variation.enumerate(d.categories)[0];
    if (!v) return '폴더 없음';
    const doc = Object.assign({}, d, { output: Object.assign({}, d.output, { folderName: mode, suffix: '', letterCase: 'keep' }) });
    const parts = LMCore.naming.relativePath(doc, v).split('/');
    return parts.length > 1 ? parts.slice(0, -1).join('/') : '폴더 없음';
  }

  function render(d) {
    const o = d.output;
    const folders = d.categories.map(c =>
      `<label class="opt"><input type="checkbox" data-folder-cat="${esc(c.id)}" ${c.folder ? 'checked' : ''}><span class="dot" style="background:${LMColors.hex(c.color)}"></span>${esc(c.name)}</label>`).join('');
    const names = [['cumulative', `누적 (${folderExample(d, 'cumulative')})`], ['value', `값만 (${folderExample(d, 'value')})`]];
    return `
      <div class="out-row"><b class="out-label"></b>${field('접미사', `<input data-out="suffix" class="short" value="${esc(o.suffix)}">`)}${field('대소문자', select(o, 'letterCase', CASES))}${check(o, 'overwrite', '기존 파일 덮어쓰기')}</div>
      <div class="out-row folders"><b class="out-label">폴더</b>${folders || '<span class="hint">카테고리 없음</span>'}${field('이름', select(o, 'folderName', names))}</div>
      <div class="out-row"><b class="out-label">형식</b>${select(o, 'format', FORMATS)}</div>
      <div class="out-row format-options">${formatOptions(o)}</div>
      <div class="out-row"><b class="out-label">크기</b>${field('잘라내기', select(o, 'trim', TRIMS, false, TRIM_TIP))}${field('크기', number(o, 'scale', 1, 1000), '%')}${field('여백', number(o, 'padding', 0, 2000), 'px')}</div>`;
  }

  function setPath(o, key, value) {
    const parts = key.split('.');
    const last = parts.pop();
    parts.reduce((x, k) => x[k], o)[last] = value;
  }

  async function onChange(input) {
    const d = LMState.docData;
    if (input.dataset.folderCat) {
      const c = d.categories.find(c => c.id === input.dataset.folderCat);
      if (c) c.folder = input.checked;
    } else {
      const next = JSON.parse(JSON.stringify(d.output));
      setPath(next, input.dataset.out, input.type === 'checkbox' ? input.checked : input.value);
      d.output = LMCore.output.normalize(next);
      try { LMExportDefaults.save(d.output); } catch (e) { LMApp.status(e.message); }
    }
    await LMApp.saveDocData();
    LMApp.render();
  }

  // 리스너는 동기로 두고 비동기 본문의 거부를 한곳에서 받는다 (컨벤션 #2).
  document.addEventListener('change', e => {
    const input = e.target.closest('#tab-export [data-out], #tab-export [data-folder-cat]');
    if (!input) return;
    onChange(input).catch(err => LMApp.status(err.message));
  });

  return { render };
})();
```

`client/index.html`에서 `<script src="ui/layers.js"></script>` 다음, `ui/export.js` 앞에:

```html
<script src="ui/output-options.js"></script>
```

- [ ] **Step 4: export.js 배치와 접기**

`client/ui/export.js`:

`settings(d)` 전체를 다음으로 바꾼다:

```js
  function settings(d) {
    return `
      <div class="out-row"><b class="out-label">출력</b>
        <label class="opt">출력명<input data-field="baseName" value="${esc(d.baseName)}"></label>
        <label class="opt">구분자<input data-field="delimiter" value="${esc(d.delimiter)}" style="width:3em"></label></div>
      <div class="out-row"><b class="out-label"></b>
        <label class="opt">출력 폴더<input data-field="destination" value="${esc(d.destination)}" style="width:260px"></label>
        <button data-action="pick-folder">폴더…</button></div>`;
  }

  // <details> 는 사용자가 펼치거나 접은 상태를 세션 동안 기억하고, 처음에는 내용이 있으면 펼친다.
  function openAttr(name, defaultOpen) {
    const s = LMState.exportOpen[name];
    return (s == null ? defaultOpen : s) ? 'open' : '';
  }
```

`includeBlock`의 반환 줄을 다음으로 바꾼다:

```js
    return `<details class="include" data-open="include" ${openAttr('include', Object.keys(LMState.include).length > 0)}><summary>이번만 내보낼 값 (저장 안 됨)</summary>${lines}</details>`;
```

`excludeBlock`의 반환 줄을 다음으로 바꾼다:

```js
    return `<details class="exclude" data-open="exclude" ${openAttr('exclude', d.excluded.length > 0)}><summary>항상 뺄 조합 (PSD에 저장)</summary>${rows}<div class="row exclude-new">${selects}<button data-action="exclude-add">추가</button></div></details>`;
```

`previewBlock`의 `warnings` 줄을 다음으로 바꾼다:

```js
    const warnings = pv.warnings.length ? `<details class="warnings" data-open="warnings" ${openAttr('warnings', false)}><summary>경고 ${pv.warnings.length}개</summary><ul class="warn">${pv.warnings.map(w => `<li>${esc(warningText(w))}</li>`).join('')}</ul></details>` : '';
```

`render(el)`의 `el.innerHTML = …` 줄을 다음으로 바꾼다:

```js
    el.innerHTML = settings(d) + LMUI.outputOptions.render(d) + includeBlock(d) + excludeBlock(d) + previewBlock(pv) + runBlock(pv);
```

파일 끝 `return { render, run, preview };` 바로 앞에:

```js
  // toggle 은 버블링하지 않으므로 캡처로 받는다.
  document.addEventListener('toggle', e => {
    const det = e.target;
    if (!det || !det.dataset || !det.dataset.open || !det.closest('#tab-export')) return;
    LMState.exportOpen[det.dataset.open] = det.open;
  }, true);
```

`client/state.js`의 `LMState`에 (`previews` 줄 다음):

```js
  exportOpen: {},     // 내보내기 탭 <details> 펼침 상태 {include, exclude, warnings} (세션)
```

- [ ] **Step 5: 카테고리 탭에서 폴더 체크 삭제, CSS**

`client/ui/categories.js`의 `categoryBlock`에서 다음 줄을 지운다:

```js
          <label title="이 단계에서 폴더로 묶기"><input type="checkbox" data-field="folder" ${c.folder ? 'checked' : ''}> 폴더</label>
```

`client/style.css` 끝에:

```css
/* 내보내기 설정 (export spec §6). Chromium 63은 flex gap을 모르므로 margin으로 띄운다. */
.out-row { display: flex; align-items: center; flex-wrap: wrap; margin: 3px 0; }
.out-row > * { margin: 2px 12px 2px 0; }
.out-row .out-label { flex: 0 0 34px; margin-right: 6px; }
.out-row .opt { display: inline-flex; align-items: center; white-space: nowrap; }
.out-row .opt > input, .out-row .opt > select { margin: 0 4px; }
.out-row .opt > .dot { margin: 0 4px 0 2px; }
.out-row .num { width: 5em; }
.out-row .short { width: 6em; }
.out-row select { font: inherit; }
.format-options { padding-left: 40px; }
#tab-export details { margin: 6px 0; }
#tab-export details > summary { cursor: pointer; color: #bbb; }
```

- [ ] **Step 6: 통과 확인**

Run: `node --test --test-concurrency=1 test/e2e/panel.test.js`
Expected: PASS — 새 테스트 3개와 기존 전부 (`.include`·`.exclude-new` 선택자, `5개 성공`, 한글 왕복 포함).

스크린샷 `test/out/shots/export-520.png`, `export-900.png`를 Read로 열어 확인한다:
- 520: 칸들이 줄바꿈되고 잘리지 않음, 형식 옵션이 형식 줄 아래 들여쓰기, 요소 사이에 간격이 있음.
- 900: 한 줄에 더 많이 펼쳐짐, `<details>` 세 개가 접힌 상태(이번만 내보낼 값은 펼침).
- 이상하면 CSS를 고치고 이 Step을 다시 한다.

Task 4에서 BMP RLE가 실패한 Ruling이 있으면 여기서 `check(o, 'bmp.rle', 'RLE 압축', true)`로 비활성하고 `title`을 단다.

- [ ] **Step 7: 커밋**

```bash
git add client/ui/output-options.js client/ui/export.js client/ui/categories.js client/state.js client/index.html client/style.css test/e2e/panel.test.js
git commit -m "panel: 내보내기 설정 칸(형식·형식별 옵션·크기·파일명), 폴더 묶기를 내보내기 탭으로, 범위·경고 접기.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 문서·버전, 속도 측정, 전체 검증

**Files:**
- Modify: `README.md`, `CSXS/manifest.xml`, `package.json`, `Plans/V 20260915_LayerMemorier_spec.md`

**Interfaces:**
- Consumes: 앞 Task 전부.
- Produces: 0.3.0, 사용 설명, 속도 수치.

- [ ] **Step 1: 버전 0.3.0**

`CSXS/manifest.xml`의 `0.2.0` 두 곳(`ExtensionBundleVersion`, `Extension Version`)과 `package.json`의 `"version": "0.2.0"`을 `0.3.0`으로 바꾼다.

- [ ] **Step 2: README**

`README.md`의 사용법 3번(`3. **내보내기** 탭에서 …`과 그 아래 들여쓴 줄 전부)을 교체:

```markdown
3. **내보내기** 탭에서 출력명·출력 폴더를 정하고 미리보기를 확인한 뒤 "내보내기".
   - **폴더**: 체크한 카테고리마다 폴더 한 단계. 이름은 `누적`(예: `출산_기본의상_옷2`) 또는 `값만`(예: `옷2`).
     폴더 순서는 카테고리 순서와 같다 (카테고리 탭의 ▲▼).
   - **형식**: PNG-24, PNG-8, JPG, TIFF, TGA, BMP, PSD. 고른 형식의 옵션만 보인다.
     회색으로 막힌 칸은 지금 설정에서 의미가 없는 칸이다 (예: 투명도를 켠 PNG의 매트).
   - **크기**:
     - 잘라내기 `조합마다 각자` = 파일마다 투명한 가장자리를 잘라낸다 (크기가 제각각).
     - 잘라내기 `모든 조합 공통 영역` = 모든 파일의 크기·위치가 같다. 영역을 먼저 재므로 시간이 약 2배.
     - 크기 % 와 여백 px 은 잘라낸 뒤에 적용된다.
   - 접미사는 확장자 바로 앞에 붙는다. 대소문자는 폴더 이름에도 적용된다.
   - "기존 파일 덮어쓰기"를 끄면 같은 이름이 있을 때 `이름 (2).png`처럼 따로 저장한다.
   - 설정은 PSD 안에 저장된다. 설정이 없는 새 PSD는 마지막에 쓴 설정으로 시작한다.
   - **이번만 내보낼 값 (저장 안 됨)**: 일부 값만 체크하면 이번에 그 조합만 내보낸다.
   - **항상 뺄 조합 (PSD에 저장)**: 특정 값 조합을 영구히 뺀다.
   - 끝나면 레이어 가시성은 시작 전 상태로 돌아온다. 원본 문서는 가시성 말고 바뀌지 않는다.
```

1번 항목의 `- "폴더" 체크 = 그 카테고리 단계에서 폴더로 묶는다. 순서는 ▲▼로 바꾼다. 파일명 순서 = 폴더 순서.` 줄을 다음으로 바꾼다:

```markdown
   - 순서는 ▲▼로 바꾼다. 파일명 순서 = 폴더 순서. 폴더로 묶을지는 내보내기 탭에서 정한다.
```

`spec:` 줄을:

```markdown
spec: `Plans/V 20260915_LayerMemorier_spec.md`, 조합 중심 변경은 `Plans/20261001_LayerMemorier_combos_spec.md`, 내보내기 옵션은 `Plans/20261002_LayerMemorier_export_spec.md`
```

- [ ] **Step 3: 기존 spec 안내**

`Plans/V 20260915_LayerMemorier_spec.md` 맨 위 안내 인용(`> 2026-10-01: …`) 다음 줄에:

```markdown
> 2026-10-02: §1 비목표의 "PNG-24 이외 형식, 트림, 리사이즈", §5.3 확장자, §6.1 폴더 체크, §6.3 내보내기 탭, §7 `exportOne`은 `Plans/20261002_LayerMemorier_export_spec.md`로 대체되었다.
```

- [ ] **Step 4: 속도 측정 (spec §9.4)**

사용자의 실제 PSB는 건드리지 않는다. 같은 크기의 합성 문서로 잰다.

1. Global Constraints대로 열린 문서를 확인한다.
2. 아래 스크립트를 `test/out/tmp/timing.jsx`로 쓰고 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/ps-eval.ps1 -ScriptFile test/out/tmp/timing.jsx`로 돌린다 (host를 먼저 읽는다). 4000×6000, 레이어 40개, 레이어마다 사각형 하나.

```js
while (app.documents.length) app.activeDocument.close(SaveOptions.DONOTSAVECHANGES);
app.preferences.rulerUnits = Units.PIXELS;
var doc = app.documents.add(4000, 6000, 72, 'lm-timing', NewDocumentMode.RGB, DocumentFill.TRANSPARENT);
var ids = [];
for (var i = 0; i < 40; i++) {
  var l = doc.artLayers.add();
  var x = (i % 8) * 450, y = Math.floor(i / 8) * 1100;
  doc.selection.select([[x, y], [x + 400, y], [x + 400, y + 1000], [x, y + 1000]]);
  var c = new SolidColor(); c.rgb.red = (i * 37) % 256; c.rgb.green = (i * 91) % 256; c.rgb.blue = (i * 53) % 256;
  doc.selection.fill(c);
  ids.push(l.id);
}
doc.selection.deselect();
var OUT = 'D:/Project/LayerMemorier/test/out/timing/';
function t(output, fast, name) {
  var t0 = new Date().getTime();
  var r = LM.exportOne(JSON.stringify({ on: ids.slice(0, 20), off: ids.slice(20), path: OUT + name, output: output, fast: fast, crop: null }));
  return name + ' ' + (new Date().getTime() - t0) + 'ms ' + r;
}
var base = { format: 'png24', trim: 'none', scale: 100, padding: 0, letterCase: 'keep', overwrite: true, suffix: '', folderName: 'cumulative',
  png24: { transparency: true, interlaced: false, matte: 'white' } };
var trim = JSON.parse(JSON.stringify(base)); trim.trim = 'each';
var res = [t(base, true, 'fast.png'), t(trim, false, 'copy-trim.png'), t(base, true, 'fast2.png'), t(trim, false, 'copy-trim2.png')];
var t1 = new Date().getTime(); LM.measureBounds(JSON.stringify({ on: ids.slice(0, 20), off: ids.slice(20) })); res.push('measure ' + (new Date().getTime() - t1) + 'ms');
doc.close(SaveOptions.DONOTSAVECHANGES);
res.join(' | ');
```

3. 결과(빠른 길 장당, 복제 길 장당, 영역 재기 한 번)를 원장에 `Task 7: timing: …`으로 남기고 최종 보고에 쓴다.

- [ ] **Step 5: 전체 검증**

Run: `npm test`
Expected: PASS.

Run: `npm run test:e2e`
Expected: PASS (host, export, formats, panel 전부).

Run: `grep -rn "부분 출력\|제외 조합\|data-field=\"folder\"" client`
Expected: 출력 없음.

- [ ] **Step 6: 커밋**

```bash
git add README.md CSXS/manifest.xml package.json "Plans/V 20260915_LayerMemorier_spec.md"
git commit -m "0.3.0: README에 내보내기 옵션 사용법, 기존 spec 대체 안내.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 7: 사용자에게 넘길 확인 항목**

- 포토샵 재시작 뒤 버전 0.3.0과 새 내보내기 탭.
- 실제 PSB로 형식·잘라내기를 한 번씩 내보내 보고 결과 파일이 기대와 같은지.
