# LayerMemorier 조합 중심 마킹 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 마크를 "조합 → 켜질 레이어 목록"으로 바꾸고, 레이어 탭을 고정 조합 선택 영역 + 따로 스크롤되는 트리(행마다 체크박스) + 포토샵 미리보기 토글로 다시 만든다. 네이티브 레이어 색 기능은 지운다.

**Architecture:** 규칙은 새 순수 모듈 `core/combos.js`(UMD)에 모으고 `core/jobs.js`가 그것을 쓴다. 패널은 문서 데이터 version 1을 읽을 때 `combos.migrate`로 바꾼다. 호스트에는 미리보기용 `applyVisibility`(히스토리 1칸)와 `getOpenDocKeys`를 더하고 `setLayerColor`를 지운다. 미리보기 상태는 새 패널 모듈 `client/preview.js`가 문서별로 가진다.

**Tech Stack:** CEP 9 패널(HTML/JS, Chromium 63), ExtendScript(ES3) 호스트, Node `node --test`, 포토샵 2020 COM(`tools/ps-eval.ps1`), DevTools 프로토콜(`chrome-remote-interface`), `pngjs`.

**Spec:** `Plans/20261001_LayerMemorier_combos_spec.md` (바뀌지 않은 부분은 `Plans/V 20260915_LayerMemorier_spec.md`)

## Global Constraints

- 포토샵 2020 21.0.2, CEP 9 = Chromium 63. 패널 코드에서 `?.`, `??`, `Object.fromEntries`, `Array.prototype.flat`, 매개변수 없는 `catch {}` 금지 (Chromium 63 미지원). Node 테스트 코드는 써도 된다.
- `host/host.jsx`는 ES3, ASCII만. 한글 문자열은 `\uXXXX`로 쓴다. `let`/`const`/화살표 함수 금지.
- `core/*.js`는 UMD: 브라우저는 `LMCore.<이름>`, Node는 `module.exports`. DOM·CEP 의존 없음.
- 문서 데이터 version 2: `{version: 2, baseName, delimiter, destination, categories, combos: [{when: {catId: valueId}, layers: [layerId]}], excluded}`. `marks`, `nativeColor` 없음.
- 같은 `when`(키 집합·값 동일) 항목은 하나만, `layers`가 빈 항목은 저장하지 않는다.
- 화면 문구는 "마크" 대신 "조합".
- 레이어 색을 바꾸는 호출은 패널 어디에도 없어야 한다.
- 패널 크기: 기본 520×760, 최소 320×300, 최대 2000×3000. 버전 0.2.0.
- 커밋 메시지는 한국어, 이슈 번호 없음, 끝에 `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- `npm run test:e2e`는 `--test-concurrency=1` (포토샵 하나를 같이 쓴다). 단일 파일은 `node --test --test-concurrency=1 test/e2e/<파일>`.
- 패널 E2E는 포토샵 2020에 LayerMemorier 패널이 열려 있어야 한다 (DevTools 포트 8092, `.debug`). 확장 폴더는 저장소로 향하는 정션이라 `p.reload()`가 디스크의 최신 코드를 읽는다.

## Review Focus

1. 미리보기 중 포토샵에서 관리 레이어를 지움 → 미리보기를 끌 때 오류 없이 나머지 레이어만 복원 (Task 7 테스트).
2. 레이어 탭에서 고른 조합이 가리키는 값·카테고리를 카테고리 탭에서 지움 → `LMState.combo`에서도 그 키가 빠져 낡은 조합 항목이 생기지 않음 (Task 5 테스트).
3. 레이어 수백 개 + 조합 수백 개 → 레이어 탭 다시 그리기가 체감 지연 없이 끝남 (Task 6 성능 테스트: 600 레이어 × 150 조합 < 300ms).
4. 미리보기를 켠 채 내보내기 → 내보내기 뒤 가시성은 미리보기 상태, 미리보기를 끄면 원래 상태 (Task 7 테스트).
5. 미리보기를 켠 채 다른 문서로 갔다 오거나 문서를 닫음 → 스냅샷은 문서별로 유지되고 닫힌 문서 것은 버려짐 (Task 7 테스트).

---

## File Structure

| 파일 | 할 일 | 책임 |
|---|---|---|
| `core/combos.js` | 새로 | 조합 일치·편집·판정·이름·정렬·미리보기 배리에이션·v1 변환 |
| `core/jobs.js` | 고침 | 배리에이션별 on/off를 combos로 계산, 경고 3종 |
| `core/visibility.js` | 삭제 | (combos로 대체) |
| `host/host.jsx` | 고침 | `applyVisibility`, `getOpenDocKeys` 추가, `setLayerColor` 삭제 |
| `client/index.html` | 고침 | `combos.js`, `preview.js` 로드, `visibility.js` 제거 |
| `client/state.js` | 고침 | v2 기본값, 읽을 때 변환, `combo`/`anchorId`/`previews` 상태, `muteEcho`, 레이어 탭 레이아웃 클래스 |
| `client/colors.js` | 고침 | 네이티브 색 매핑 삭제 |
| `client/ui/categories.js` | 고침 | 삭제·프리셋 적용 시 combos 정리, 문구 |
| `client/ui/export.js` | 고침 | 색 옵션 삭제, 관리 레이어 id, 경고 문구 |
| `client/ui/layers.js` | 다시 씀 | 고정 조합 영역 + 트리 + 체크박스 + 선택 |
| `client/preview.js` | 새로 | 포토샵 미리보기 토글 (문서별 스냅샷) |
| `client/style.css` | 고침 | 레이어 탭 레이아웃·체크박스 스타일, 배지·마킹 영역 스타일 삭제 |
| `CSXS/manifest.xml`, `package.json` | 고침 | 크기, 0.2.0 |
| `test/unit/combos.test.js` | 새로 | combos 전부 + 변환 의미 보존 |
| `test/unit/jobs.test.js` | 다시 씀 | combos 기반 |
| `test/unit/visibility.test.js` | 삭제 | |
| `test/fixture/fixture-docdata.json`, `test/helpers/fixture.js` | 고침 | v2 `combosByName` |
| `test/helpers/panel.js` | 고침 | `emulate(width, height)` 추가 |
| `test/e2e/host.test.js`, `export.test.js`, `panel.test.js` | 고침 | 새 API·v2 데이터·새 레이어 탭 |
| `README.md`, `Plans/V 20260915_LayerMemorier_spec.md` | 고침 | 사용법, 대체 안내 한 줄 |

---

### Task 1: core/combos.js — 일치·편집·판정·이름

**Files:**
- Create: `core/combos.js`
- Test: `test/unit/combos.test.js`

**Interfaces:**
- Produces (모두 `LMCore.combos.*` / `require('../../core/combos')`). `when`·`variation`은 `{categoryId: valueId}`, `combos`는 `[{when, layers: number[]}]`, `layers`(문서)는 호스트 `getLayers` 결과 `[{id: number, ...}]`, `categories`는 spec §4.1 배열.
  - `matches(when, variation) → boolean`
  - `covers(a, b) → boolean` (a의 모든 쌍이 b에 있음)
  - `sameWhen(a, b) → boolean`
  - `onLayerIds(combos, variation) → number[]` (오름차순, 문서에 없는 id 포함)
  - `managedLayerIds(combos, layers) → number[]` (문서에 있는 것, 오름차순)
  - `orphanLayerIds(combos, layers) → number[]` (오름차순)
  - `pruneOrphans(combos, layers) → combos`
  - `toggle(combos, when, layerIds, on) → combos`
  - `removeLayers(combos, layerIds) → combos`
  - `countWithLayers(combos, layerIds) → number`
  - `removeFor(combos, categoryId, valueId|null) → combos`, `countFor(combos, categoryId, valueId|null) → number`
  - `layerState(combos, when, layerId) → {state: 'checked'|'inherited'|'none', from: when|null}`
  - `isStale(when, categories) → boolean`
  - `comboName(when, categories) → string`
  - `sortCombos(combos, categories) → combos` (새 배열)
  - `combosOfLayer(combos, layerId, categories) → combos` (정렬됨)
  - `previewVariation(when, categories) → variation|null`
  - 편집 함수는 입력 배열·객체를 바꾸지 않는다.

- [ ] **Step 1: 실패하는 테스트 쓰기**

`test/unit/combos.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../core/combos');

function cat(id, valueIds) {
  return { id, name: id, color: 'red', labelFormat: '{v}', folder: false, values: valueIds.map(v => ({ id: v, name: v.slice(1), label: v.slice(1) })) };
}
const cats = [cat('A', ['a0', 'a1']), cat('B', ['b0', 'b1', 'b2']), cat('N', ['n1', 'n2'])];
const layers = [10, 11, 20, 21, 30].map(id => ({ id, name: 'L' + id, kind: 'layer', visible: true, depth: 0, parentId: null, color: 'none' }));
const deepFreeze = o => { Object.values(o).forEach(v => { if (v && typeof v === 'object') deepFreeze(v); }); return Object.freeze(o); };

test('matches: empty when matches everything, keys must all agree', () => {
  assert.equal(C.matches({}, { A: 'a0', B: 'b0' }), true);
  assert.equal(C.matches({ A: 'a0' }, { A: 'a0', B: 'b2' }), true);
  assert.equal(C.matches({ A: 'a0', B: 'b2' }, { A: 'a0', B: 'b1' }), false);
  assert.equal(C.matches({ Z: 'z0' }, { A: 'a0', B: 'b0' }), false, 'missing category never matches');
  assert.equal(C.matches({ A: 'gone' }, { A: 'a0', B: 'b0' }), false, 'missing value never matches');
});

test('covers / sameWhen ignore key order', () => {
  assert.equal(C.covers({ A: 'a0' }, { B: 'b2', A: 'a0' }), true);
  assert.equal(C.covers({ A: 'a0', B: 'b2' }, { A: 'a0' }), false);
  assert.equal(C.sameWhen({ A: 'a0', B: 'b2' }, { B: 'b2', A: 'a0' }), true);
  assert.equal(C.sameWhen({ A: 'a0' }, { A: 'a0', B: 'b2' }), false);
  assert.equal(C.sameWhen({}, {}), true);
});

test('onLayerIds is the union of matching entries', () => {
  const combos = [
    { when: { A: 'a0' }, layers: [20] },
    { when: { A: 'a0', B: 'b2' }, layers: [21, 20] },
    { when: { A: 'a1', B: 'b0' }, layers: [21] },
    { when: {}, layers: [30] },
  ];
  assert.deepEqual(C.onLayerIds(combos, { A: 'a0', B: 'b2', N: 'n1' }), [20, 21, 30]);
  assert.deepEqual(C.onLayerIds(combos, { A: 'a0', B: 'b0', N: 'n1' }), [20, 30]);
  assert.deepEqual(C.onLayerIds(combos, { A: 'a1', B: 'b0', N: 'n2' }), [21, 30]);
  assert.deepEqual(C.onLayerIds(combos, { A: 'a1', B: 'b2', N: 'n2' }), [30]);
});

test('managed / orphan layer ids', () => {
  const combos = [{ when: { A: 'a0' }, layers: [21, 999] }, { when: { B: 'b0' }, layers: [10, 21] }];
  assert.deepEqual(C.managedLayerIds(combos, layers), [10, 21]);
  assert.deepEqual(C.orphanLayerIds(combos, layers), [999]);
  assert.deepEqual(C.pruneOrphans(combos, layers), [{ when: { A: 'a0' }, layers: [21] }, { when: { B: 'b0' }, layers: [10, 21] }]);
  assert.deepEqual(C.pruneOrphans([{ when: {}, layers: [999] }], layers), [], 'entry left empty is removed');
});

test('toggle adds to the exact entry, creates it, never duplicates, drops empty entries', () => {
  const start = deepFreeze([{ when: { A: 'a0' }, layers: [20] }]);
  let c = C.toggle(start, { A: 'a0' }, [21, 20], true);
  assert.deepEqual(c, [{ when: { A: 'a0' }, layers: [20, 21] }]);
  c = C.toggle(c, { B: 'b2', A: 'a0' }, [30], true);
  assert.deepEqual(c, [{ when: { A: 'a0' }, layers: [20, 21] }, { when: { B: 'b2', A: 'a0' }, layers: [30] }]);
  c = C.toggle(c, { A: 'a0', B: 'b2' }, [30], false);
  assert.deepEqual(c, [{ when: { A: 'a0' }, layers: [20, 21] }]);
  assert.deepEqual(C.toggle(c, { N: 'n1' }, [10], false), c, 'removing from a missing entry changes nothing');
  assert.deepEqual(start, [{ when: { A: 'a0' }, layers: [20] }], 'input untouched');
});

test('toggle copies the when object it stores', () => {
  const when = { A: 'a1' };
  const c = C.toggle([], when, [10], true);
  when.B = 'b0';
  assert.deepEqual(c[0].when, { A: 'a1' });
});

test('removeLayers / countWithLayers', () => {
  const combos = deepFreeze([{ when: { A: 'a0' }, layers: [20, 21] }, { when: { B: 'b0' }, layers: [21] }, { when: { N: 'n1' }, layers: [30] }]);
  assert.equal(C.countWithLayers(combos, [21]), 2);
  assert.equal(C.countWithLayers(combos, [21, 30]), 3);
  assert.equal(C.countWithLayers(combos, [11]), 0);
  assert.deepEqual(C.removeLayers(combos, [21]), [{ when: { A: 'a0' }, layers: [20] }, { when: { N: 'n1' }, layers: [30] }]);
});

test('removeFor / countFor by category or by value', () => {
  const combos = deepFreeze([{ when: { A: 'a0' }, layers: [20] }, { when: { A: 'a1', B: 'b0' }, layers: [21] }, { when: { B: 'b0' }, layers: [10] }, { when: {}, layers: [30] }]);
  assert.equal(C.countFor(combos, 'A', null), 2);
  assert.equal(C.countFor(combos, 'B', 'b0'), 2);
  assert.equal(C.countFor(combos, 'B', 'b1'), 0);
  assert.deepEqual(C.removeFor(combos, 'A', null), [{ when: { B: 'b0' }, layers: [10] }, { when: {}, layers: [30] }]);
  assert.deepEqual(C.removeFor(combos, 'B', 'b0'), [{ when: { A: 'a0' }, layers: [20] }, { when: {}, layers: [30] }]);
});

test('layerState: checked, inherited from the narrowest broader entry, none', () => {
  const combos = [
    { when: {}, layers: [10] },
    { when: { A: 'a0' }, layers: [10, 20] },
    { when: { B: 'b2' }, layers: [20] },
    { when: { A: 'a0', B: 'b2' }, layers: [21] },
    { when: { A: 'a0', B: 'b2', N: 'n1' }, layers: [30] },
  ];
  const S = { A: 'a0', B: 'b2' };
  assert.deepEqual(C.layerState(combos, S, 21), { state: 'checked', from: null });
  assert.deepEqual(C.layerState(combos, S, 10), { state: 'inherited', from: { A: 'a0' } }, 'A0 is narrower than {}');
  assert.deepEqual(C.layerState(combos, S, 20), { state: 'inherited', from: { A: 'a0' } }, 'same size: earlier entry wins');
  assert.deepEqual(C.layerState(combos, S, 30), { state: 'none', from: null }, 'narrower entries do not count');
  assert.deepEqual(C.layerState(combos, S, 11), { state: 'none', from: null });
  assert.deepEqual(C.layerState(combos, {}, 10), { state: 'checked', from: null });
  assert.deepEqual(C.layerState(combos, { A: 'a1' }, 10), { state: 'inherited', from: {} });
});

test('isStale / comboName', () => {
  assert.equal(C.isStale({ A: 'a0', B: 'b2' }, cats), false);
  assert.equal(C.isStale({ Z: 'z0' }, cats), true);
  assert.equal(C.isStale({ A: 'gone' }, cats), true);
  assert.equal(C.comboName({ B: 'b2', A: 'a0' }, cats), 'A0_B2', 'category order, not key order');
  assert.equal(C.comboName({}, cats), '모든 조합');
  assert.equal(C.comboName({ A: 'gone', N: 'n2' }, cats), 'A?_N2');
  assert.equal(C.comboName({ Z: 'z0', A: 'a1' }, cats), 'A1_?');
});

test('sortCombos: category order, "all" before values, then value order; stable', () => {
  const combos = [
    { when: { A: 'a1' }, layers: [1] },
    { when: { A: 'a0', B: 'b2' }, layers: [2] },
    { when: { B: 'b0' }, layers: [3] },
    { when: { A: 'a0' }, layers: [4] },
    { when: {}, layers: [5] },
    { when: { N: 'n2' }, layers: [6] },
  ];
  assert.deepEqual(C.sortCombos(combos, cats).map(c => C.comboName(c.when, cats)), ['모든 조합', 'N2', 'B0', 'A0', 'A0_B2', 'A1']);
  assert.deepEqual(combos[0].when, { A: 'a1' }, 'input order untouched');
});

test('combosOfLayer returns sorted entries containing the layer', () => {
  const combos = [{ when: { A: 'a1' }, layers: [20] }, { when: { B: 'b0' }, layers: [20, 21] }, { when: { A: 'a0' }, layers: [21] }];
  assert.deepEqual(C.combosOfLayer(combos, 20, cats).map(c => C.comboName(c.when, cats)), ['B0', 'A1']);
  assert.deepEqual(C.combosOfLayer(combos, 30, cats), []);
});

test('previewVariation fills "all" categories with their first value', () => {
  assert.deepEqual(C.previewVariation({ B: 'b2' }, cats), { A: 'a0', B: 'b2', N: 'n1' });
  assert.deepEqual(C.previewVariation({}, cats), { A: 'a0', B: 'b0', N: 'n1' });
  assert.equal(C.previewVariation({}, cats.concat(cat('E', []))), null, 'empty category: no preview');
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/unit/combos.test.js`
Expected: FAIL — `Cannot find module '../../core/combos'`

- [ ] **Step 3: 구현**

`core/combos.js`:

```js
// combos spec §5 조합 항목. UMD: 브라우저는 LMCore.combos, Node는 module.exports.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.LMCore = root.LMCore || {}; root.LMCore.combos = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const asc = (a, b) => a - b;

  // when의 모든 (카테고리→값)이 배리에이션과 같으면 true. {}는 항상 true.
  // 없는 카테고리·값을 가리키는 키는 배리에이션 값과 같아질 수 없어 자연히 false.
  function matches(when, variation) {
    return Object.keys(when).every(k => variation[k] === when[k]);
  }

  // a의 모든 쌍이 b에도 있다 = a가 b보다 넓거나 같다.
  function covers(a, b) {
    return Object.keys(a).every(k => b[k] === a[k]);
  }

  function sameWhen(a, b) {
    return Object.keys(a).length === Object.keys(b).length && covers(a, b);
  }

  function allLayerIds(combos) {
    const set = new Set();
    for (const c of combos) for (const id of c.layers) set.add(id);
    return set;
  }

  function existingIds(layers) {
    return new Set(layers.map(l => l.id));
  }

  function onLayerIds(combos, variation) {
    const set = new Set();
    for (const c of combos) if (matches(c.when, variation)) for (const id of c.layers) set.add(id);
    return Array.from(set).sort(asc);
  }

  function managedLayerIds(combos, layers) {
    const existing = existingIds(layers);
    return Array.from(allLayerIds(combos)).filter(id => existing.has(id)).sort(asc);
  }

  function orphanLayerIds(combos, layers) {
    const existing = existingIds(layers);
    return Array.from(allLayerIds(combos)).filter(id => !existing.has(id)).sort(asc);
  }

  // 빈 항목은 저장하지 않는다 (spec §4.1).
  function compact(combos) {
    return combos.filter(c => c.layers.length > 0);
  }

  function pruneOrphans(combos, layers) {
    const existing = existingIds(layers);
    return compact(combos.map(c => ({ when: c.when, layers: c.layers.filter(id => existing.has(id)) })));
  }

  function toggle(combos, when, layerIds, on) {
    let found = false;
    const out = combos.map(c => {
      if (!sameWhen(c.when, when)) return c;
      found = true;
      const set = new Set(c.layers);
      for (const id of layerIds) { if (on) set.add(id); else set.delete(id); }
      return { when: c.when, layers: Array.from(set) };
    });
    if (!found && on && layerIds.length) out.push({ when: Object.assign({}, when), layers: Array.from(new Set(layerIds)) });
    return compact(out);
  }

  function removeLayers(combos, layerIds) {
    const drop = new Set(layerIds);
    return compact(combos.map(c => ({ when: c.when, layers: c.layers.filter(id => !drop.has(id)) })));
  }

  function countWithLayers(combos, layerIds) {
    const ids = new Set(layerIds);
    return combos.filter(c => c.layers.some(id => ids.has(id))).length;
  }

  function refersTo(when, categoryId, valueId) {
    if (!has(when, categoryId)) return false;
    return valueId == null || when[categoryId] === valueId;
  }

  function removeFor(combos, categoryId, valueId) {
    return combos.filter(c => !refersTo(c.when, categoryId, valueId));
  }

  function countFor(combos, categoryId, valueId) {
    return combos.filter(c => refersTo(c.when, categoryId, valueId)).length;
  }

  // spec §5.3. inherited면 from = 이동할 항목(더 넓은 것 중 가장 좁은 것, 같으면 앞의 것)의 when.
  function layerState(combos, when, layerId) {
    let from = null;
    for (const c of combos) {
      if (c.layers.indexOf(layerId) === -1) continue;
      if (sameWhen(c.when, when)) return { state: 'checked', from: null };
      if (covers(c.when, when) && (!from || Object.keys(c.when).length > Object.keys(from).length)) from = c.when;
    }
    return from ? { state: 'inherited', from } : { state: 'none', from: null };
  }

  function isStale(when, categories) {
    return Object.keys(when).some(k => {
      const c = categories.find(c => c.id === k);
      return !c || !c.values.some(v => v.id === when[k]);
    });
  }

  function comboName(when, categories) {
    const parts = [];
    for (const c of categories) {
      if (!has(when, c.id)) continue;
      const v = c.values.find(v => v.id === when[c.id]);
      parts.push(c.name + (v ? v.name : '?'));
    }
    for (const k of Object.keys(when)) if (!categories.some(c => c.id === k)) parts.push('?');
    return parts.length ? parts.join('_') : '모든 조합';
  }

  // 카테고리마다 0 = 전체, 1.. = 값 순서, 없는 값은 맨 뒤. 마지막 칸은 낡은 항목 표시.
  function sortKey(when, categories) {
    const key = categories.map(c => {
      if (!has(when, c.id)) return 0;
      const i = c.values.findIndex(v => v.id === when[c.id]);
      return i === -1 ? c.values.length + 1 : i + 1;
    });
    key.push(isStale(when, categories) ? 1 : 0);
    return key;
  }

  function sortCombos(combos, categories) {
    const keyed = combos.map((c, i) => ({ c, i, k: sortKey(c.when, categories) }));
    keyed.sort((a, b) => {
      for (let j = 0; j < a.k.length; j++) if (a.k[j] !== b.k[j]) return a.k[j] - b.k[j];
      return a.i - b.i;
    });
    return keyed.map(x => x.c);
  }

  function combosOfLayer(combos, layerId, categories) {
    return sortCombos(combos.filter(c => c.layers.indexOf(layerId) !== -1), categories);
  }

  function previewVariation(when, categories) {
    const v = {};
    for (const c of categories) {
      if (has(when, c.id)) v[c.id] = when[c.id];
      else if (c.values.length) v[c.id] = c.values[0].id;
      else return null;
    }
    return v;
  }

  return {
    matches, covers, sameWhen, onLayerIds, managedLayerIds, orphanLayerIds, pruneOrphans,
    toggle, removeLayers, countWithLayers, removeFor, countFor, layerState,
    isStale, comboName, sortCombos, combosOfLayer, previewVariation,
  };
});
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/unit/combos.test.js`
Expected: PASS (13 tests)

- [ ] **Step 5: 커밋**

```bash
git add core/combos.js test/unit/combos.test.js
git commit -m "core: 조합 항목 규칙 (일치·편집·판정·이름·정렬).

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: core/combos.js — version 1 변환과 의미 보존

**Files:**
- Modify: `core/combos.js` (`migrate` 추가, export 목록)
- Test: `test/unit/combos.test.js` (아래 테스트 덧붙임)

**Interfaces:**
- Consumes: Task 1의 `sameWhen`, `onLayerIds`, `managedLayerIds`.
- Produces: `migrate(dataV1) → {data: dataV2, dropped: number}`. 입력을 바꾸지 않는다. `data`는 입력의 다른 필드를 그대로 두고 `version: 2`, `combos`를 넣고 `marks`, `nativeColor`를 뺀다.

- [ ] **Step 1: 실패하는 테스트 덧붙이기**

`test/unit/combos.test.js` 끝에:

```js
// 기존 core/visibility.js 의 judge (변환 전 의미). 비교용으로 그대로 옮겨 둔다.
function oldJudge(mark, variation, categories) {
  if (!mark) return null;
  const known = new Map(categories.map(c => [c.id, new Set(c.values.map(v => v.id))]));
  let considered = 0;
  for (const categoryId of Object.keys(mark)) {
    const valid = known.get(categoryId);
    if (!valid) continue;
    considered++;
    const allowed = (mark[categoryId] || []).filter(id => valid.has(id));
    if (allowed.indexOf(variation[categoryId]) === -1) return false;
  }
  return considered === 0 ? null : true;
}

test('migrate expands value sets into entries and merges equal combos', () => {
  const v1 = deepFreeze({
    version: 1, baseName: 'fx', delimiter: '_', destination: 'D:/x', nativeColor: true, categories: cats, excluded: [{ A: 'a1' }],
    marks: {
      '20': { B: ['b2'], A: ['a0', 'a1'] },
      '21': { A: ['a0'], B: ['b2'] },
      '30': {},
    },
  });
  const { data, dropped } = C.migrate(v1);
  assert.equal(dropped, 0, 'an empty mark is not counted as dropped');
  assert.equal(data.version, 2);
  assert.equal('marks' in data, false);
  assert.equal('nativeColor' in data, false);
  assert.equal(data.destination, 'D:/x');
  assert.deepEqual(data.excluded, [{ A: 'a1' }]);
  assert.deepEqual(data.combos, [
    { when: { A: 'a0', B: 'b2' }, layers: [20, 21] },
    { when: { A: 'a1', B: 'b2' }, layers: [20] },
  ]);
});

test('migrate drops missing categories/values and counts marks it had to discard', () => {
  const v1 = {
    version: 1, categories: cats, excluded: [],
    marks: {
      '10': { Z: ['z0'] },                 // 없는 카테고리뿐 → 버림 (전에도 안 건드림)
      '11': { A: ['gone'] },               // 값이 전부 없음 → 버림 (전에는 항상 꺼짐)
      '20': { Z: ['z0'], A: ['a1', 'gone'] }, // 없는 키·값만 빼고 남김
    },
  };
  const { data, dropped } = C.migrate(v1);
  assert.equal(dropped, 2);
  assert.deepEqual(data.combos, [{ when: { A: 'a1' }, layers: [20] }]);
});

test('migrate preserves on/off/untouched for every variation (seeded random marks)', () => {
  let seed = 12345; // mulberry32
  const rand = () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const variation = require('../../core/variation');
  for (let round = 0; round < 50; round++) {
    const marks = {};
    for (let id = 1; id <= 20; id++) {
      const mark = {};
      for (const c of cats) {
        if (rand() < 0.5) continue;
        const values = c.values.map(v => v.id).filter(() => rand() < 0.6);
        if (values.length) mark[c.id] = values;
      }
      if (Object.keys(mark).length) marks[String(id)] = mark;
    }
    const docLayers = Array.from({ length: 20 }, (_, i) => ({ id: i + 1 }));
    const { data, dropped } = C.migrate({ version: 1, categories: cats, excluded: [], marks });
    assert.equal(dropped, 0);
    const managed = new Set(C.managedLayerIds(data.combos, docLayers));
    for (const v of variation.enumerate(cats)) {
      const on = new Set(C.onLayerIds(data.combos, v));
      for (let id = 1; id <= 20; id++) {
        const expected = oldJudge(marks[String(id)], v, cats);
        const actual = managed.has(id) ? on.has(id) : null;
        assert.equal(actual, expected, `round ${round} layer ${id} ${JSON.stringify(v)}`);
      }
    }
  }
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/unit/combos.test.js`
Expected: FAIL — `C.migrate is not a function`

- [ ] **Step 3: 구현**

`core/combos.js`의 `previewVariation` 뒤, `return {` 앞에:

```js
  // version 1 → 2 (combos spec §4.2). 레이어 마크의 값 집합을 카테고리 순서대로 펼친다.
  // 없는 카테고리 키·없는 값은 뺀다. 남는 것이 없으면 그 마크는 버리고 dropped로 센다.
  function migrate(data) {
    const categories = data.categories || [];
    const known = new Map(categories.map(c => [c.id, new Set(c.values.map(v => v.id))]));
    const marks = data.marks || {};
    const combos = [];
    let dropped = 0;
    for (const key of Object.keys(marks)) {
      const mark = marks[key] || {};
      if (!Object.keys(mark).length) continue;
      const id = Number(key);
      let partials = [{}];
      let considered = 0;
      let empty = false;
      for (const c of categories) {
        if (!has(mark, c.id)) continue;
        considered++;
        const values = (mark[c.id] || []).filter(v => known.get(c.id).has(v));
        if (!values.length) { empty = true; break; }
        const next = [];
        for (const p of partials) for (const v of values) next.push(Object.assign({}, p, { [c.id]: v }));
        partials = next;
      }
      if (empty || considered === 0) { dropped++; continue; }
      for (const when of partials) {
        const hit = combos.find(c => sameWhen(c.when, when));
        if (!hit) combos.push({ when, layers: [id] });
        else if (hit.layers.indexOf(id) === -1) hit.layers.push(id);
      }
    }
    const next = Object.assign({}, data, { version: 2, combos });
    delete next.marks;
    delete next.nativeColor;
    return { data: next, dropped };
  }
```

그리고 export 목록에 `migrate`를 더한다:

```js
  return {
    matches, covers, sameWhen, onLayerIds, managedLayerIds, orphanLayerIds, pruneOrphans,
    toggle, removeLayers, countWithLayers, removeFor, countFor, layerState,
    isStale, comboName, sortCombos, combosOfLayer, previewVariation, migrate,
  };
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/unit/combos.test.js`
Expected: PASS (16 tests)

- [ ] **Step 5: 커밋**

```bash
git add core/combos.js test/unit/combos.test.js
git commit -m "core: 문서 데이터 version 1 마크를 조합 항목으로 변환.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: core/jobs.js를 combos로, visibility.js 삭제

**Files:**
- Modify: `core/jobs.js` (전체 교체)
- Delete: `core/visibility.js`, `test/unit/visibility.test.js`
- Modify: `client/index.html` (스크립트 태그)
- Test: `test/unit/jobs.test.js` (전체 교체)

**Interfaces:**
- Consumes: `combos.managedLayerIds`, `combos.orphanLayerIds`, `combos.onLayerIds`, `combos.isStale`, `naming.relativePath(docData, variation)`.
- Produces: `LMCore.jobs.buildJobs(docData, layers, variations) → {jobs: [{on: number[], off: number[], relativePath}], conflicts: string[], warnings}`. warnings 순서: `{type:'orphan', layerId}` (id 오름차순) → `{type:'stale', detail:{when}}` (combos 순서) → `{type:'parentHidden', layerId, detail:{groupId}}` (id 오름차순). `orphanMarkIds`, `markedLayerIds`는 없어진다 (`combos.orphanLayerIds`, `combos.managedLayerIds`로 대체).

- [ ] **Step 1: 테스트 교체**

`test/unit/jobs.test.js` 전체:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildJobs } = require('../../core/jobs');
const { enumerate } = require('../../core/variation');

function cat(id, valueIds, labelFormat = '{c}{v}', folder = false) {
  return { id, name: id, color: 'red', labelFormat, folder, values: valueIds.map(v => ({ id: v, name: v.slice(1), label: v.slice(1) })) };
}
const categories = [cat('A', ['a0', 'a1']), cat('B', ['b0', 'b1'])];
const layers = [
  { id: 10, name: 'G', kind: 'group', visible: false, depth: 0, parentId: null, color: 'none' },
  { id: 11, name: 'inG', kind: 'layer', visible: true, depth: 1, parentId: 10, color: 'none' },
  { id: 20, name: 'A0', kind: 'layer', visible: true, depth: 0, parentId: null, color: 'none' },
  { id: 21, name: 'A1B1', kind: 'layer', visible: true, depth: 0, parentId: null, color: 'none' },
  { id: 30, name: 'plain', kind: 'layer', visible: true, depth: 0, parentId: null, color: 'none' },
];
function doc(combos, extra) {
  return Object.assign({ baseName: 'fx', delimiter: '_', categories, combos, excluded: [] }, extra);
}

test('jobs contain only managed layers, split into on/off per variation', () => {
  const d = doc([{ when: { A: 'a0' }, layers: [20] }, { when: { A: 'a1', B: 'b1' }, layers: [21] }]);
  const { jobs, conflicts, warnings } = buildJobs(d, layers, enumerate(categories));
  assert.equal(conflicts.length, 0);
  assert.equal(warnings.length, 0);
  assert.deepEqual(jobs.map(j => j.relativePath), ['fx_A0_B0.png', 'fx_A0_B1.png', 'fx_A1_B0.png', 'fx_A1_B1.png']);
  assert.deepEqual(jobs[0], { on: [20], off: [21], relativePath: 'fx_A0_B0.png' });
  assert.deepEqual(jobs[3], { on: [21], off: [20], relativePath: 'fx_A1_B1.png' });
});

test('a layer in A0_B1 and A1_B0 only is off in A0_B0 and A1_B1', () => {
  const d = doc([{ when: { A: 'a0', B: 'b1' }, layers: [21] }, { when: { A: 'a1', B: 'b0' }, layers: [21] }]);
  const { jobs } = buildJobs(d, layers, enumerate(categories));
  assert.deepEqual(jobs.map(j => j.on), [[], [21], [21], []]);
  assert.deepEqual(jobs.map(j => j.off), [[21], [], [], [21]]);
});

test('the "all combos" entry turns its layers on everywhere', () => {
  const d = doc([{ when: {}, layers: [30] }, { when: { B: 'b1' }, layers: [20] }]);
  const { jobs } = buildJobs(d, layers, enumerate(categories));
  assert.deepEqual(jobs.map(j => j.on), [[30], [20, 30], [30], [20, 30]]);
});

test('duplicate relative paths are reported as conflicts', () => {
  const cats = [cat('A', ['a0', 'a1'])];
  cats[0].values[1].label = '0';
  const d = { baseName: 'fx', delimiter: '_', categories: cats, combos: [], excluded: [] };
  const { jobs, conflicts } = buildJobs(d, layers, enumerate(cats));
  assert.equal(jobs.length, 2);
  assert.deepEqual(conflicts, ['fx_A0.png']);
});

test('orphan layers (not in document) produce warnings and are skipped', () => {
  const d = doc([{ when: { A: 'a0' }, layers: [999, 20] }]);
  const { jobs, warnings } = buildJobs(d, layers, enumerate(categories));
  assert.deepEqual(warnings, [{ type: 'orphan', layerId: 999 }]);
  assert.deepEqual(jobs[0].on, [20]);
  assert.deepEqual(jobs[2].off, [20]);
});

test('combos referring to missing categories/values warn stale and never match', () => {
  const d = doc([{ when: { Z: 'z0' }, layers: [20] }, { when: { A: 'gone' }, layers: [21] }]);
  const { jobs, warnings } = buildJobs(d, layers, enumerate(categories));
  assert.deepEqual(warnings, [
    { type: 'stale', detail: { when: { Z: 'z0' } } },
    { type: 'stale', detail: { when: { A: 'gone' } } },
  ]);
  for (const j of jobs) { assert.deepEqual(j.on, []); assert.deepEqual(j.off, [20, 21]); }
});

test('managed layer under an unmanaged hidden group warns parentHidden', () => {
  const d = doc([{ when: { A: 'a0' }, layers: [11] }]);
  const { warnings } = buildJobs(d, layers, enumerate(categories));
  assert.deepEqual(warnings, [{ type: 'parentHidden', layerId: 11, detail: { groupId: 10 } }]);
});

test('managed hidden group does not warn for children', () => {
  const d = doc([{ when: { A: 'a1' }, layers: [10] }, { when: { B: 'b0' }, layers: [11] }]);
  const { warnings, jobs } = buildJobs(d, layers, enumerate(categories));
  assert.equal(warnings.length, 0);
  // {A:a0,B:b0}: G(A1) 꺼짐, inG(B0) 켜짐 — 부모가 꺼져 있어도 판정은 각자 한다 (포토샵이 자식을 가린다)
  assert.deepEqual(jobs[0], { on: [11], off: [10], relativePath: 'fx_A0_B0.png' });
  assert.deepEqual(jobs[2], { on: [10, 11], off: [], relativePath: 'fx_A1_B0.png' });
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/unit/jobs.test.js`
Expected: FAIL — 첫 테스트에서 `on`이 `[]` (기존 jobs.js는 `docData.marks`만 본다).

- [ ] **Step 3: 구현**

`core/jobs.js` 전체:

```js
// combos spec §5.7 내보내기 작업 목록 + 경고.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./combos'), require('./naming'));
  } else {
    root.LMCore = root.LMCore || {};
    root.LMCore.jobs = factory(root.LMCore.combos, root.LMCore.naming);
  }
})(typeof self !== 'undefined' ? self : this, function (combosLib, naming) {
  'use strict';

  // 관리 레이어가 아닌 조상 그룹 중 꺼진 것이 있으면 그 그룹 id, 없으면 null.
  function hiddenUnmanagedAncestor(layer, byId, managed) {
    let parentId = layer.parentId;
    while (parentId != null) {
      const parent = byId.get(parentId);
      if (!parent) return null;
      if (!managed.has(parent.id) && !parent.visible) return parent.id;
      parentId = parent.parentId;
    }
    return null;
  }

  function buildJobs(docData, layers, variations) {
    const combos = docData.combos || [];
    const byId = new Map(layers.map(l => [l.id, l]));
    const managedIds = combosLib.managedLayerIds(combos, layers);
    const managed = new Set(managedIds);
    const warnings = [];

    for (const id of combosLib.orphanLayerIds(combos, layers)) warnings.push({ type: 'orphan', layerId: id });
    for (const c of combos) {
      if (combosLib.isStale(c.when, docData.categories)) warnings.push({ type: 'stale', detail: { when: c.when } });
    }
    for (const id of managedIds) {
      const groupId = hiddenUnmanagedAncestor(byId.get(id), byId, managed);
      if (groupId != null) warnings.push({ type: 'parentHidden', layerId: id, detail: { groupId } });
    }

    const seen = new Map();
    const conflicts = [];
    const jobs = variations.map(variation => {
      const onSet = new Set(combosLib.onLayerIds(combos, variation));
      const on = managedIds.filter(id => onSet.has(id));
      const off = managedIds.filter(id => !onSet.has(id));
      const relativePath = naming.relativePath(docData, variation);
      const count = (seen.get(relativePath) || 0) + 1;
      seen.set(relativePath, count);
      if (count === 2) conflicts.push(relativePath);
      return { on, off, relativePath };
    });

    return { jobs, conflicts, warnings };
  }

  return { buildJobs };
});
```

`client/index.html`에서:

```html
<script src="../core/visibility.js"></script>
```

를

```html
<script src="../core/combos.js"></script>
```

로 바꾼다 (`variation.js` 다음, `naming.js` 앞 — `jobs.js`보다 먼저 와야 한다).

삭제:

```bash
git rm core/visibility.js test/unit/visibility.test.js
```

- [ ] **Step 4: 통과 확인**

Run: `npm test`
Expected: PASS — combos 16, jobs 8, naming·variation·골든 기존 그대로. `visibility` 테스트는 없다.

Run: `grep -rln "visibility\.\|markedLayerIds\|orphanMarkIds" core client test/unit`
Expected: `client/ui/layers.js`, `client/ui/export.js` 두 파일만 나온다 (Task 5·6에서 지운다). `core`와 `test/unit`에서는 나오면 안 된다.

> 참고: 이 Task 뒤로 Task 6까지 패널의 레이어 탭·내보내기 탭은 깨진 상태다 (아직 `marks`를 본다). 중간 커밋이라 괜찮다.

- [ ] **Step 5: 커밋**

```bash
git add core/jobs.js test/unit/jobs.test.js client/index.html
git commit -m "core: 내보내기 작업 목록을 조합 항목으로 계산, visibility.js 삭제.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 호스트 — applyVisibility, getOpenDocKeys, setLayerColor 삭제, fixture v2

**Files:**
- Modify: `host/host.jsx` (`LM.setLayerColor` 블록 삭제, `LM.exportEnd` 뒤에 미리보기 섹션 추가)
- Modify: `test/fixture/fixture-docdata.json`, `test/helpers/fixture.js`
- Test: `test/e2e/host.test.js`, `test/e2e/export.test.js`

**Interfaces:**
- Consumes: `combos.managedLayerIds` (export E2E).
- Produces (호스트):
  - `LM.applyVisibility(JSON {on: number[], off: number[]}) → {ok: true}`. on·off가 모두 비면 아무것도 안 하고 히스토리도 남기지 않는다. 아니면 `suspendHistory('LayerMemorier 미리보기', ...)` 한 칸.
  - `LM.getOpenDocKeys() → string[]` (열린 문서마다 `fullName.fsName`, 저장 안 된 문서는 `name`).
- Produces (테스트 헬퍼): `docDataFor(byName, destination = '')` → version 2 문서 데이터 (`combos`의 `layers`는 layerId).

- [ ] **Step 1: fixture 데이터를 version 2로**

`test/fixture/fixture-docdata.json` 전체:

```json
{
  "version": 2,
  "baseName": "fx",
  "delimiter": "_",
  "destination": "",
  "categories": [
    { "id": "cA", "name": "A", "color": "red", "labelFormat": "{c}{v}", "folder": true,
      "values": [ { "id": "a0", "name": "0", "label": "0" }, { "id": "a1", "name": "1", "label": "1" } ] },
    { "id": "cB", "name": "B", "color": "blue", "labelFormat": "{v}", "folder": false,
      "values": [ { "id": "b0", "name": "0", "label": "0" }, { "id": "b1", "name": "1", "label": "1" }, { "id": "b2", "name": "2", "label": "2" } ] },
    { "id": "cN", "name": "N", "color": "green", "labelFormat": "{v}", "folder": false,
      "values": [ { "id": "n1", "name": "1", "label": "1" }, { "id": "n2", "name": "2", "label": "2" } ] }
  ],
  "combosByName": [
    { "when": { "cA": "a0" }, "layers": ["A0"] },
    { "when": { "cA": "a1" }, "layers": ["A1", "G"] },
    { "when": { "cB": "b0" }, "layers": ["B0", "GA"] },
    { "when": { "cB": "b1" }, "layers": ["B1"] },
    { "when": { "cB": "b2" }, "layers": ["B2"] },
    { "when": { "cN": "n1" }, "layers": ["N1"] },
    { "when": { "cN": "n2" }, "layers": ["N2"] }
  ],
  "excluded": []
}
```

(기존 마크와 같은 의미: G = A1, GA = B0. `export.test.js`의 `expectedOn`이 그대로 맞아야 한다.)

`test/helpers/fixture.js`의 `docDataFor`를 교체:

```js
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
```

- [ ] **Step 2: 호스트 테스트를 새 API로 (실패하는 테스트)**

`test/e2e/host.test.js`에서 `test('setLayerColor changes native color reported by getLayers', ...)` 블록 전체를 지우고 그 자리에:

```js
test('applyVisibility sets visibility as one history step', () => {
  const { byName } = buildFixture();
  const states = () => Number(psRun('app.activeDocument.historyStates.length'));
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
```

같은 파일의 `writeDocData keeps unicode intact` 테스트 데이터를 version 2 모양으로:

```js
  const data = { version: 2, baseName: '알싸기 テスト', delimiter: '_', destination: 'D:/출력', categories: [], combos: [], excluded: [] };
```

`test/e2e/export.test.js`에서:

```js
const { buildJobs, markedLayerIds } = require('../../core/jobs');
```

를

```js
const { buildJobs } = require('../../core/jobs');
const { managedLayerIds } = require('../../core/combos');
```

로, 그리고 두 곳의 `markedLayerIds(docData.marks, layers)`를 `managedLayerIds(docData.combos, layers)`로 바꾼다.

- [ ] **Step 3: 실패 확인**

Run: `node --test --test-concurrency=1 test/e2e/host.test.js`
Expected: FAIL — `applyVisibility: ...` (`LM.applyVisibility is not a function` 류의 오류 또는 non-JSON 결과), `getOpenDocKeys` 동일.

- [ ] **Step 4: 호스트 구현**

`host/host.jsx`에서 `LM.setLayerColor = wrap(function (a) { ... });` 블록 전체(주석 포함)를 지운다.

`checkExpectedDoc` 위 주석의 `// with document A's marks, which are keyed to A's layer ids.`를 `// with document A's combos, which are keyed to A's layer ids.`로 바꾼다.

`LM.exportEnd = wrap(...)` 블록 바로 뒤, IIFE를 닫는 `})();` 앞에:

```js
  // ---- preview (combos spec section 6.3) ----

  var pendingVisibility = null;

  LM._runVisibility = function () {
    setVisibleMany(pendingVisibility.on, true);
    setVisibleMany(pendingVisibility.off, false);
  };

  // One history step per call so the artist can step back over a preview.
  // History name is "LayerMemorier <preview in Korean>", escaped to keep this file ASCII.
  LM.applyVisibility = wrap(function (a) {
    if (!hasDoc()) throw new Error('no document');
    var hasOn = a && a.on && a.on.length;
    var hasOff = a && a.off && a.off.length;
    if (!hasOn && !hasOff) return { ok: true };
    pendingVisibility = { on: a.on || [], off: a.off || [] };
    try {
      app.activeDocument.suspendHistory('LayerMemorier \uBBF8\uB9AC\uBCF4\uAE30', 'LM._runVisibility()');
    } finally {
      pendingVisibility = null;
    }
    return { ok: true };
  });

  // Keys match the panel's docKey: full path when saved, otherwise the name.
  LM.getOpenDocKeys = wrap(function () {
    var keys = [];
    for (var i = 0; i < app.documents.length; i++) {
      var d = app.documents[i];
      var p = null;
      try { p = d.fullName.fsName; } catch (e) { p = null; }
      keys.push(p || d.name);
    }
    return keys;
  });
```

- [ ] **Step 5: 통과 확인**

Run: `grep -nP "[^\x00-\x7F]" host/host.jsx`
Expected: 출력 없음 (ASCII만).

Run: `node --test --test-concurrency=1 test/e2e/host.test.js test/e2e/export.test.js`
Expected: PASS — host 9개(색 테스트 1개 빠지고 2개 추가), export 2개. export는 12개 PNG의 픽셀 검사가 기존과 같이 통과해야 한다 (v2 fixture가 기존 마크와 같은 의미라는 증거).

- [ ] **Step 6: 커밋**

```bash
git add host/host.jsx test/fixture/fixture-docdata.json test/helpers/fixture.js test/e2e/host.test.js test/e2e/export.test.js
git commit -m "host: 미리보기용 applyVisibility·getOpenDocKeys 추가, setLayerColor 삭제. fixture를 조합 항목으로.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 패널 상태·카테고리 탭·내보내기 탭을 version 2로

**Files:**
- Modify: `client/state.js`, `client/colors.js`, `client/ui/categories.js`, `client/ui/export.js`
- Test: `test/e2e/panel.test.js`

**Interfaces:**
- Consumes: `LMCore.combos.migrate`, `countFor`, `removeFor`, `comboName`, `managedLayerIds`.
- Produces:
  - `LMState.combo` — 레이어 탭에서 고른 조합 `{categoryId: valueId}` (세션, 문서가 바뀌면 `{}`).
  - `LMState.anchorId` — Shift 범위 선택 시작 행 id 또는 `null`.
  - `LMState.previews` — `{[docKey]: {snapshot: {[layerId]: boolean}, touched: number[], combo: when}}` (Task 7이 채운다).
  - `LMApp.muteEcho()` — 300ms 동안 포토샵 이벤트를 패널 메아리로 보고 무시.
  - `LMApp.newDocData(baseName)` → version 2 빈 문서 데이터.
  - `LMColors.hex(name)`, `LMColors.ORDER` (`native` 없음).
  - `LMApp.removeMarksFor`, `LMApp.countMarksFor`는 없어진다.

- [ ] **Step 1: 패널 테스트를 고치고 추가 (실패하는 테스트)**

`test/e2e/panel.test.js`:

(a) `test('layer tab: badges, selection sync, marking writes XMP and native color', ...)` 블록 전체를 지운다 (Task 6이 새 레이어 탭 테스트를 넣는다).

(b) `confirm/prompt paths` 테스트의 값 삭제·카테고리 삭제·프리셋 적용 부분을 다음으로 바꾼다 (`// --- 값 삭제`부터 `// --- 프리셋 저장` 직전까지, 그리고 `// --- 마크가 남아 있는 문서에 프리셋 적용` 블록):

```js
      // --- 값 삭제: 그 값을 쓰는 조합이 있으면 먼저 묻고, 끝난 뒤 몇 개가 지워졌는지 알린다.
      // 레이어 탭에서 그 값을 골라 둔 상태였다면 그 선택도 같이 빠져야 한다.
      await p.eval(`LMState.combo = { cA: 'a1', cB: 'b0' }; true`);
      const valueDelete = `document.querySelector('#tab-categories [data-category=cB] [data-value=b0] [data-action=value-delete]').click(); true`;
      await p.eval(`window.__confirmResult = false; window.__dialogs = []; true`);
      await p.eval(valueDelete);
      await settle();
      assert.match(await p.eval(`window.__dialogs[0][1]`), /이 값을 쓰는 조합 1개도 지워집니다/);
      assert.equal(await p.eval(`LMState.docData.categories.find(c => c.id === 'cB').values.length`), 3, '취소하면 값이 남는다');

      await p.eval(`window.__confirmResult = true; true`);
      await p.eval(valueDelete);
      await settle();
      assert.equal(await p.eval(`LMState.docData.categories.find(c => c.id === 'cB').values.length`), 2);
      assert.match(await p.eval(`document.getElementById('status').textContent`), /조합 1개가 지워졌습니다/);
      assert.equal(await p.eval(`LMState.docData.combos.some(c => c.when.cB === 'b0')`), false);
      assert.deepEqual(await p.eval('LMState.combo'), { cA: 'a1' }, '지운 값은 레이어 탭 선택에서도 빠진다');

      // --- 카테고리 삭제: 카테고리와 그 카테고리를 쓰던 조합이 같이 사라진다.
      const catDelete = `document.querySelector('#tab-categories [data-category=cA] [data-action=cat-delete]').click(); true`;
      await p.eval(`window.__confirmResult = false; window.__dialogs = []; true`);
      await p.eval(catDelete);
      await settle();
      assert.match(await p.eval(`window.__dialogs[0][1]`), /카테고리 "A"를 지웁니다\. 이 카테고리를 쓰는 조합 2개도 지워집니다\./);
      assert.equal(await p.eval('LMState.docData.categories.length'), 3, '취소하면 카테고리가 남는다');

      await p.eval(`window.__confirmResult = true; true`);
      await p.eval(catDelete);
      await settle();
      assert.deepEqual(await p.eval('LMState.docData.categories.map(c => c.id)'), ['cB', 'cN']);
      assert.equal(await p.eval(`LMState.docData.combos.some(c => 'cA' in c.when)`), false);
      assert.deepEqual(await p.eval('LMState.combo'), {}, '지운 카테고리는 레이어 탭 선택에서도 빠진다');
      const afterDelete = psCall('readDocData');
      assert.deepEqual(afterDelete.categories.map(c => c.id), ['cB', 'cN'], 'XMP 에도 반영된다');
      assert.equal(afterDelete.combos.some(c => 'cA' in c.when), false);
```

```js
      // --- 조합이 남아 있는 문서에 프리셋 적용 → 확인 후 조합이 전부 지워진다.
      const applyPreset = `(() => {
        const sel = document.getElementById('preset-select');
        sel.value = sel.options[1].value;
        document.querySelector('[data-action=preset-apply]').click();
        return sel.options[1].textContent;
      })()`;
      assert.ok((await p.eval('LMState.docData.combos.length')) > 0, '아직 조합이 남아 있어야 의미가 있다');
      await p.eval(`window.__confirmResult = false; window.__dialogs = []; true`);
      assert.equal(await p.eval(applyPreset), '한글 프리셋');
      await settle();
      assert.match(await p.eval(`window.__dialogs[0][1]`), /현재 문서의 조합이 전부 지워집니다/);
      assert.ok((await p.eval('LMState.docData.combos.length')) > 0, '취소하면 조합이 남는다');

      await p.eval(`window.__confirmResult = true; LMState.combo = { cB: 'b1' }; true`);
      await p.eval(applyPreset);
      await settle();
      assert.deepEqual(await p.eval('LMState.docData.combos'), []);
      assert.deepEqual(await p.eval('LMState.combo'), {});
      assert.deepEqual(psCall('readDocData').combos, [], '조합이 지워진 상태가 XMP 에도 쓰인다');
```

(c) `export tab: preview, exclusion, ...` 테스트의 `assert.equal(... '[data-field=baseName]' ...)` 다음 줄에:

```js
    assert.equal(await p.eval(`document.querySelector('#tab-export [data-field=nativeColor]')`), null, '레이어 색 옵션은 없다');
```

(d) 파일 끝에 새 테스트:

```js
test('version 1 document data is converted on load and saved as version 2 on the next change', async () => {
  const { byName } = buildFixture();
  const v2 = docDataFor(byName);
  psCall('writeDocData', {
    version: 1, baseName: 'fx', delimiter: '_', destination: '', nativeColor: true, categories: v2.categories, excluded: [],
    marks: {
      [byName.A0]: { cA: ['a0'] },
      [byName.GA]: { cA: ['a1'], cB: ['b0', 'b1'] },
      [byName.H]: { cZ: ['zz'] },
    },
  });
  const sortCombos = list => list.slice().sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const p = await freshPanel();
  try {
    assert.equal(await p.eval('LMState.docData.version'), 2);
    assert.deepEqual(sortCombos(await p.eval('LMState.docData.combos')), sortCombos([
      { when: { cA: 'a0' }, layers: [byName.A0] },
      { when: { cA: 'a1', cB: 'b0' }, layers: [byName.GA] },
      { when: { cA: 'a1', cB: 'b1' }, layers: [byName.GA] },
    ]));
    assert.match(await p.eval(`document.getElementById('status').textContent`), /레이어 1개의 마크를 버렸습니다/);
    assert.equal(psCall('readDocData').version, 1, '읽기만 해서는 XMP 를 바꾸지 않는다');

    await p.eval(`document.querySelector('#tabs [data-tab=export]').click(); true`);
    await p.eval(setField('#tab-export [data-field=baseName]', 'fx2'));
    await settle();
    const stored = psCall('readDocData');
    assert.equal(stored.version, 2);
    assert.equal(stored.baseName, 'fx2');
    assert.equal('marks' in stored, false);
    assert.equal('nativeColor' in stored, false);
    assert.equal(stored.combos.length, 3);
  } finally {
    p.close();
  }
});
```

- [ ] **Step 2: 실패 확인**

포토샵 2020에 LayerMemorier 패널이 열려 있는지 먼저 확인: `node tools/panel.js shot t5-before` 가 `test/out/shots/t5-before.png`를 만들면 연결된 것이다.

Run: `node --test --test-concurrency=1 test/e2e/panel.test.js`
Expected: FAIL — `confirm/prompt paths`(문구 불일치, `LMState.docData.combos` undefined), `version 1 ...`(version 1 그대로), `export tab ...`(nativeColor 입력칸 존재).

- [ ] **Step 3: state.js 구현**

`client/state.js`의 `LMState`에 필드 추가 (`include` 줄 다음):

```js
  combo: {},          // 레이어 탭에서 고른 조합 {categoryId: valueId} (세션)
  anchorId: null,     // Shift 범위 선택의 시작 행 id
  previews: {},       // 포토샵 미리보기 {docKey: {snapshot: {layerId: visible}, touched: [layerId], combo: 반영한 조합}} (세션)
```

`LMApp.newDocData`:

```js
  newDocData(baseName) {
    return { version: 2, baseName: baseName || '', delimiter: '_', destination: '', categories: [], combos: [], excluded: [] };
  },
```

`removeMarksFor`, `countMarksFor` 두 메서드(주석 포함)를 지우고 그 자리에:

```js
  // 패널이 일으킨 포토샵 이벤트(선택·가시성 변경)는 그대로 되돌아온다. 그 메아리로
  // 레이어 목록을 통째로 다시 읽으면 클릭한 자리에서 스크롤이 튄다.
  // 300ms 동안은 main.js의 디바운스가 새로고침을 건너뛴다.
  muteEcho() { LMState.echoUntil = Date.now() + 300; },
```

`refresh()` 본문을 다음으로 교체:

```js
  async refresh() {
    let notice = '';
    try {
      const info = await LMHost.call('getDocInfo');
      LMState.docInfo = info;
      const key = info ? (info.path || info.name) : null;
      const fresh = key !== LMState.docKey;
      if (fresh) {
        // 문서가 바뀌었다. 부분 출력·조합 선택은 세션 값이라 저장되지 않으므로, 프리셋을
        // 공유하는 다른 PSD에 같은 카테고리 id로 그대로 걸리지 않게 여기서 비운다.
        LMState.include = {};
        LMState.combo = {};
        LMState.anchorId = null;
        LMState.docKey = key;
      }
      if (!info) {
        LMState.docData = null; LMState.layers = []; LMState.selectedIds = [];
      } else {
        LMState.layers = await LMHost.call('getLayers');
        LMState.selectedIds = await LMHost.call('getSelectedLayerIds');
        const stored = await LMHost.call('readDocData');
        if (stored && stored.version === 1) {
          // combos spec §4.2: 메모리에서 바꾸고, XMP에는 다음 저장 때 version 2로 쓰인다.
          const m = LMCore.combos.migrate(stored);
          LMState.docData = m.data;
          if (fresh && m.dropped) notice = `변환하면서 레이어 ${m.dropped}개의 마크를 버렸습니다 (없는 카테고리·값 참조)`;
        } else {
          LMState.docData = stored || this.newDocData(info.name.replace(/\.[^.]+$/, ''));
        }
      }
      this.status(notice);
    } catch (e) {
      this.status(e.message);
    }
    this.render();
  },
```

- [ ] **Step 4: colors.js 구현**

`client/colors.js` 전체:

```js
// 카테고리 색 이름 ↔ 화면 hex (spec §4.1). 포토샵 레이어 색은 건드리지 않는다 (combos spec §2).
const LMColors = (() => {
  const TABLE = {
    red: '#e5484d',
    orange: '#f5a623',
    yellow: '#e3c000',
    green: '#46b450',
    blue: '#3b82f6',
    violet: '#8b5cf6',
    gray: '#9ca3af',
  };
  const ORDER = ['red', 'orange', 'yellow', 'green', 'blue', 'violet', 'gray'];
  return {
    ORDER,
    hex: name => TABLE[name] || TABLE.gray,
  };
})();
```

- [ ] **Step 5: categories.js 구현**

`case 'cat-delete'` 블록 교체:

```js
      case 'cat-delete': {
        const n = LMCore.combos.countFor(LMState.docData.combos, c.id, null);
        if (!confirm(`카테고리 "${c.name}"를 지웁니다.` + (n ? ` 이 카테고리를 쓰는 조합 ${n}개도 지워집니다.` : ''))) return;
        LMState.docData.combos = LMCore.combos.removeFor(LMState.docData.combos, c.id, null);
        delete LMState.combo[c.id];
        cats.splice(idx, 1);
        LMState.docData.excluded = LMState.docData.excluded.map(x => { const y = Object.assign({}, x); delete y[c.id]; return y; }).filter(x => Object.keys(x).length);
        return commit();
      }
```

`case 'value-delete'` 블록 교체:

```js
      case 'value-delete': {
        const row = btn.closest('[data-value]');
        const v = c.values.find(v => v.id === row.dataset.value);
        // 조합은 되돌릴 수 없고(spec §1) 이 버튼은 편집 중인 입력칸 바로 옆에 있다.
        // 지워질 조합이 있으면 먼저 묻고, 끝난 뒤 몇 개가 지워졌는지 알린다.
        const affected = LMCore.combos.countFor(LMState.docData.combos, c.id, v.id);
        if (affected && !confirm(`값 "${v.name}"을 지웁니다. 이 값을 쓰는 조합 ${affected}개도 지워집니다. 계속할까요?`)) return;
        LMState.docData.combos = LMCore.combos.removeFor(LMState.docData.combos, c.id, v.id);
        if (LMState.combo[c.id] === v.id) delete LMState.combo[c.id];
        c.values.splice(c.values.indexOf(v), 1);
        LMState.docData.excluded = LMState.docData.excluded.filter(x => x[c.id] !== v.id);
        LMApp.status(affected ? `값 "${v.name}" 삭제 — 조합 ${affected}개가 지워졌습니다.` : `값 "${v.name}" 삭제`);
        return commit();
      }
```

`case 'preset-apply'` 블록의 두 줄 교체:

```js
        if (LMState.docData.combos.length && !confirm('프리셋을 적용하면 현재 문서의 조합이 전부 지워집니다. 계속할까요?')) return;
        LMState.docData.categories = JSON.parse(JSON.stringify(p.categories));
        LMState.docData.combos = [];
        LMState.combo = {};
        LMState.docData.excluded = [];
        return commit();
```

- [ ] **Step 6: export.js 구현**

`settings(d)`에서 nativeColor 줄을 지운다:

```js
  function settings(d) {
    return `
      <div class="row"><label>출력명 <input data-field="baseName" value="${esc(d.baseName)}"></label>
        <label>구분자 <input data-field="delimiter" value="${esc(d.delimiter)}" style="width:3em"></label></div>
      <div class="row"><label>출력 폴더 <input data-field="destination" value="${esc(d.destination)}" style="width:220px"></label>
        <button data-action="pick-folder">폴더…</button></div>`;
  }
```

`warningText` 교체:

```js
  function warningText(w) {
    if (w.type === 'orphan') return `문서에 없는 레이어 #${w.layerId} 가 조합에 남아 있음`;
    if (w.type === 'stale') return `없는 카테고리·값을 쓰는 조합 "${LMCore.combos.comboName(w.detail.when, LMState.docData.categories)}" (내보내기에서 무시)`;
    if (w.type === 'parentHidden') return `조합에 넣은 레이어 "${layerName(w.layerId)}" 의 부모 그룹 "${layerName(w.detail.groupId)}" 이 꺼져 있어 어떤 조합에서도 안 보임`;
    return JSON.stringify(w);
  }
```

`run()`의 `exportBegin` 줄 교체:

```js
      await LMHost.call('exportBegin', { layerIds: LMCore.combos.managedLayerIds(d.combos, LMState.layers) });
```

- [ ] **Step 7: 통과 확인**

Run: `grep -rn "marks\|nativeColor\|setLayerColor\|LMColors.native\|removeMarksFor\|countMarksFor" client --include=*.js | grep -v "client/ui/layers.js"`
Expected: 출력 없음 (layers.js는 Task 6에서 다시 쓴다).

Run: `node --test --test-concurrency=1 test/e2e/panel.test.js`
Expected: PASS — 부팅·프리셋, 내보내기 3개, 한글, confirm/prompt, 시작 실패, version 1 변환.

- [ ] **Step 8: 커밋**

```bash
git add client/state.js client/colors.js client/ui/categories.js client/ui/export.js test/e2e/panel.test.js
git commit -m "panel: 문서 데이터 version 2 (조합 항목), 읽을 때 변환. 레이어 색 옵션 삭제.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 레이어 탭 다시 쓰기 — 고정 조합 영역 + 트리 + 체크박스 + 선택

**Files:**
- Modify: `client/ui/layers.js` (전체 교체), `client/state.js` (`render()`의 레이아웃 클래스), `client/style.css`
- Modify: `test/helpers/panel.js` (`emulate` 추가)
- Test: `test/e2e/panel.test.js`

**Interfaces:**
- Consumes: `LMState.combo`, `LMState.anchorId`, `LMApp.muteEcho()`, `LMCore.combos.{sortCombos, sameWhen, comboName, layerState, combosOfLayer, toggle, removeLayers, countWithLayers, orphanLayerIds, pruneOrphans}`, `LMHost.call('selectLayers', ids)`.
- Produces:
  - `LMUI.layers.render(el)`.
  - DOM 계약 (테스트·Task 7이 쓴다): `#tab-layers .combo-bar` (고정 영역), `select[data-combo-cat=<catId>]` (값 `''` = 전체), `select.made-select` (option value = `JSON.stringify(when)`, 새 조합이면 value `''`), `.made` 줄 (Task 7이 미리보기 토글을 붙임), `[data-action=remove-selected]`, `[data-action=orphans-clean]`, `.orphans`, `#tab-layers .tree`, `.layer-row[data-layer=<id>]`, 행 안 `.cb.checked|.cb.inherited|.cb.none` (inherited는 `data-from` = `JSON.stringify(when)`), `.name`, `.combos`.
  - `LMUI.layers.afterComboChange()` → `Promise` — 조합 선택이나 조합 데이터가 바뀐 뒤 부른다. 이 Task에서는 `LMApp.render()`만 한다. Task 7이 미리보기 반영을 더한다.
  - `panel.emulate(width, height)` / `panel.emulate(null)` (테스트 헬퍼, CDP `Emulation.setDeviceMetricsOverride` / `clearDeviceMetricsOverride`).

- [ ] **Step 1: 테스트 헬퍼에 emulate 추가**

`test/helpers/panel.js`의 반환 객체에서 `reload` 다음에:

```js
    // 패널 창 크기를 흉내 낸다 (CEP 창 자체는 자동화로 바꿀 수 없다). null이면 원래대로.
    async emulate(width, height) {
      if (width == null) return client.Emulation.clearDeviceMetricsOverride();
      return client.Emulation.setDeviceMetricsOverride({ width, height, deviceScaleFactor: 1, mobile: false });
    },
```

- [ ] **Step 2: 실패하는 테스트 쓰기**

`test/e2e/panel.test.js`에서 `stubDialogs` 함수 정의 바로 뒤에 헬퍼를 더한다:

```js
// 레이어 탭 행 하나의 체크박스 상태: 'checked' | 'inherited' | 'none'
function cbState(id) {
  return `(() => {
    const cb = document.querySelector('#tab-layers [data-layer="${id}"] .cb');
    return cb.classList.contains('checked') ? 'checked' : cb.classList.contains('inherited') ? 'inherited' : 'none';
  })()`;
}
const pickCombo = (categoryId, valueId) => setField(`#tab-layers select[data-combo-cat=${categoryId}]`, valueId);
const clickCb = id => `document.querySelector('#tab-layers [data-layer="${id}"] .cb').click(); true`;
function clickRow(id, mods = {}) {
  return `(() => {
    const el = document.querySelector('#tab-layers [data-layer="${id}"] .name');
    el.dispatchEvent(new MouseEvent('click', Object.assign({ bubbles: true }, ${JSON.stringify(mods)})));
    return true;
  })()`;
}
const asc = list => list.slice().sort((a, b) => a - b);
const entryOf = (combos, when) => combos.find(c => Object.keys(c.when).length === Object.keys(when).length && Object.keys(when).every(k => c.when[k] === when[k]));
```

파일 끝에 테스트 4개:

```js
test('layer tab: picking a combo shows its layers, checkbox writes combos to XMP', async () => {
  const { byName } = buildFixture();
  psCall('writeDocData', docDataFor(byName));
  const colorsBefore = psCall('getLayers').map(l => [l.name, l.color]);
  const p = await freshPanel();
  try {
    await p.eval(`document.querySelector('#tabs [data-tab=layers]').click(); true`);
    assert.equal(await p.eval(`document.querySelectorAll('#tab-layers .layer-row').length`), 12);
    assert.equal(await p.eval(`document.querySelectorAll('#tab-layers .badge, #tab-layers .mark-panel').length`), 0, '배지·아래쪽 마킹 영역은 없다');

    // 기본 = 모든 조합. A0 은 "A0" 항목에만 있으므로 none, 행 오른쪽에 조합 이름.
    assert.equal(await p.eval(cbState(byName.A0)), 'none');
    assert.equal(await p.eval(`document.querySelector('#tab-layers [data-layer="${byName.A0}"] .combos').textContent`), 'A0');
    assert.equal(await p.eval(`document.querySelector('#tab-layers [data-layer="${byName.BG}"] .combos')`), null);

    await p.eval(pickCombo('cA', 'a0'));
    assert.equal(await p.eval(cbState(byName.A0)), 'checked');
    assert.equal(await p.eval(cbState(byName.B0)), 'none');

    await p.eval(pickCombo('cB', 'b2'));
    assert.equal(await p.eval(cbState(byName.A0)), 'inherited');
    assert.equal(await p.eval(cbState(byName.B2)), 'inherited');
    assert.equal(await p.eval(cbState(byName.H)), 'none');
    assert.equal(await p.eval(`document.querySelector('#tab-layers select.made-select').value`), '', '아직 없는 조합');

    // H 를 A0_B2 에 넣는다.
    await p.eval(clickCb(byName.H));
    await settle();
    assert.equal(await p.eval(cbState(byName.H)), 'checked');
    assert.deepEqual(entryOf(psCall('readDocData').combos, { cA: 'a0', cB: 'b2' }).layers, [byName.H]);
    assert.equal(await p.eval(`document.querySelector('#tab-layers select.made-select').selectedOptions[0].textContent`), 'A0_B2 · 1개');

    // 다시 누르면 빠지고, 빈 항목은 사라진다.
    await p.eval(clickCb(byName.H));
    await settle();
    assert.equal(await p.eval(cbState(byName.H)), 'none');
    assert.equal(entryOf(psCall('readDocData').combos, { cA: 'a0', cB: 'b2' }), undefined);

    // inherited 를 누르면 그 넓은 조합으로 이동하고 데이터는 그대로다.
    const before = JSON.stringify(psCall('readDocData').combos);
    await p.eval(clickCb(byName.A0));
    await settle();
    assert.deepEqual(await p.eval('LMState.combo'), { cA: 'a0' });
    assert.equal(await p.eval(`document.querySelector('#tab-layers select[data-combo-cat=cB]').value`), '');
    assert.equal(JSON.stringify(psCall('readDocData').combos), before);

    // 만든 조합 드롭다운으로 이동한다.
    await p.eval(`(() => {
      const s = document.querySelector('#tab-layers select.made-select');
      s.value = Array.from(s.options).find(o => o.textContent.startsWith('B1 ')).value;
      s.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    assert.deepEqual(await p.eval('LMState.combo'), { cB: 'b1' });
    assert.equal(await p.eval(cbState(byName.B1)), 'checked');

    assert.deepEqual(psCall('getLayers').map(l => [l.name, l.color]), colorsBefore, '레이어 색은 바뀌지 않는다');
  } finally {
    p.close();
  }
});

test('layer tab: Shift/Ctrl selection, checkbox on a selected row applies to all selected, remove from all combos', async () => {
  const { byName } = buildFixture();
  psCall('writeDocData', docDataFor(byName));
  const p = await freshPanel();
  try {
    await stubDialogs(p);
    await p.eval(`document.querySelector('#tabs [data-tab=layers]').click(); true`);
    await p.eval(pickCombo('cA', 'a1'));
    await p.eval(pickCombo('cB', 'b1'));

    await p.eval(clickRow(byName.B0));
    await settle();
    await p.eval(clickRow(byName.N1, { shiftKey: true }));
    await settle();
    const range = asc([byName.B0, byName.B1, byName.B2, byName.N1]);
    assert.deepEqual(asc(await p.eval('LMState.selectedIds')), range);
    assert.deepEqual(asc(psCall('getSelectedLayerIds')), range, '포토샵 선택도 같다');

    await p.eval(clickRow(byName.B1, { ctrlKey: true }));
    await settle();
    const picked = asc([byName.B0, byName.B2, byName.N1]);
    assert.deepEqual(asc(await p.eval('LMState.selectedIds')), picked);

    // 선택된 행의 체크박스 → 선택 전부
    await p.eval(clickCb(byName.B2));
    await settle();
    assert.deepEqual(asc(entryOf(psCall('readDocData').combos, { cA: 'a1', cB: 'b1' }).layers), picked);

    // 선택 밖 행의 체크박스 → 그 행만, 선택은 그대로
    await p.eval(clickCb(byName.H));
    await settle();
    assert.deepEqual(asc(entryOf(psCall('readDocData').combos, { cA: 'a1', cB: 'b1' }).layers), asc(picked.concat(byName.H)));
    assert.deepEqual(asc(await p.eval('LMState.selectedIds')), picked);

    // 모든 조합에서 빼기: B0(B0 항목·A1_B1), B2(B2·A1_B1), N1(N1·A1_B1) → 조합 4개
    await p.eval(`window.__confirmResult = false; window.__dialogs = []; true`);
    await p.eval(`document.querySelector('[data-action=remove-selected]').click(); true`);
    await settle();
    assert.match(await p.eval('window.__dialogs[0][1]'), /레이어 3개를 조합 4개에서 뺍니다/);
    assert.ok(entryOf(psCall('readDocData').combos, { cN: 'n1' }), '취소하면 그대로');

    await p.eval(`window.__confirmResult = true; true`);
    await p.eval(`document.querySelector('[data-action=remove-selected]').click(); true`);
    await settle();
    const combos = psCall('readDocData').combos;
    for (const id of picked) assert.equal(combos.some(c => c.layers.includes(id)), false, 'layer ' + id);
    assert.deepEqual(entryOf(combos, { cA: 'a1', cB: 'b1' }).layers, [byName.H]);
    assert.deepEqual(entryOf(combos, { cB: 'b0' }).layers, [byName.GA]);
    assert.equal(entryOf(combos, { cN: 'n1' }), undefined, '빈 항목은 사라진다');
    assert.equal(await p.eval(`document.querySelector('[data-action=remove-selected]').disabled`), true, '더 뺄 조합이 없다');
  } finally {
    await restoreDialogs(p).catch(() => {});
    p.close();
  }
});

test('layer tab: Photoshop selection sync, group collapse, orphan cleanup, fixed combo bar', async () => {
  const { byName } = buildFixture();
  psCall('writeDocData', docDataFor(byName));
  const p = await freshPanel();
  try {
    await p.eval(`document.querySelector('#tabs [data-tab=layers]').click(); true`);

    psCall('selectLayers', [byName.B1]);
    await new Promise(r => setTimeout(r, 800));
    assert.deepEqual(await p.eval('LMState.selectedIds'), [byName.B1]);
    assert.equal(await p.eval(`document.querySelector('#tab-layers [data-layer="${byName.B1}"]').classList.contains('selected')`), true);

    await p.eval(`document.querySelector('#tab-layers [data-layer="${byName.G}"] .caret').click(); true`);
    assert.equal(await p.eval(`document.querySelectorAll('#tab-layers .layer-row').length`), 10);
    await p.eval(`document.querySelector('#tab-layers [data-layer="${byName.G}"] .caret').click(); true`);

    await p.eval(`LMState.docData.combos.push({ when: { cA: 'a0' }, layers: [999999] }); LMApp.render(); true`);
    assert.match(await p.eval(`document.querySelector('#tab-layers .orphans').textContent`), /문서에 없는 레이어 1개/);
    await p.eval(`document.querySelector('[data-action=orphans-clean]').click(); true`);
    await settle();
    assert.equal(await p.eval(`LMState.docData.combos.some(c => c.layers.includes(999999))`), false);

    // 트리만 스크롤된다: 창을 낮게 만들어 트리를 넘치게 한 뒤 끝까지 내린다.
    await p.emulate(440, 260);
    await p.eval('LMApp.render(); true');
    const barTop = await p.eval(`document.querySelector('#tab-layers select[data-combo-cat=cA]').getBoundingClientRect().top`);
    await p.eval(`document.querySelector('#tab-layers .tree').scrollTop = 99999; true`);
    assert.ok((await p.eval(`document.querySelector('#tab-layers .tree').scrollTop`)) > 0, '트리가 스크롤된다');
    assert.equal(await p.eval(`document.querySelector('main').scrollTop`), 0, 'main 은 스크롤되지 않는다');
    assert.equal(await p.eval(`document.querySelector('#tab-layers select[data-combo-cat=cA]').getBoundingClientRect().top`), barTop, '조합 선택은 제자리');
    const kept = await p.eval(`document.querySelector('#tab-layers .tree').scrollTop`);
    await p.eval('LMApp.render(); true');
    assert.equal(await p.eval(`document.querySelector('#tab-layers .tree').scrollTop`), kept, '다시 그려도 트리 스크롤 유지');
  } finally {
    await p.emulate(null).catch(() => {});
    p.close();
  }
});

test('layer tab: renders 600 layers x 150 combos quickly and looks right at 320/default/900 widths', async () => {
  const { byName } = buildFixture();
  const data = docDataFor(byName);
  data.combos.push({ when: { cA: 'a0', cB: 'b2' }, layers: [byName.H, byName.GB] });
  psCall('writeDocData', data);
  const p = await freshPanel();
  try {
    await p.eval(`document.querySelector('#tabs [data-tab=layers]').click(); true`);
    await p.eval(pickCombo('cA', 'a0'));
    await p.eval(pickCombo('cB', 'b2'));
    await p.eval(`LMState.selectedIds = [${byName.B2}, ${byName.H}]; LMApp.render(); true`);
    for (const [label, w, h] of [['layers-320', 320, 600], ['layers-default', 520, 760], ['layers-900', 900, 760]]) {
      await p.emulate(w, h);
      await p.eval('LMApp.render(); true');
      await p.shot(label);
      assert.ok(await p.eval(`document.documentElement.scrollWidth <= window.innerWidth + 1`), label + ': 가로 스크롤 없음');
    }
    await p.emulate(null);

    const ms = await p.eval(`(() => {
      const realLayers = LMState.layers, realCombos = LMState.docData.combos;
      const cats = LMState.docData.categories;
      LMState.layers = Array.from({ length: 600 }, (_, i) => ({ id: 100000 + i, name: 'L' + i, kind: 'layer', visible: true, depth: 0, parentId: null, color: 'none' }));
      LMState.docData.combos = Array.from({ length: 150 }, (_, i) => ({
        when: { cA: cats[0].values[i % 2].id, cB: cats[1].values[i % 3].id, cN: cats[2].values[i % 2].id, ['x' + i]: 'y' },
        layers: Array.from({ length: 20 }, (_, j) => 100000 + ((i * 7 + j * 31) % 600)),
      }));
      const t0 = performance.now();
      LMApp.render();
      const t = performance.now() - t0;
      LMState.layers = realLayers; LMState.docData.combos = realCombos; LMApp.render();
      return t;
    })()`);
    assert.ok(ms < 300, `render took ${ms}ms`);
  } finally {
    await p.emulate(null).catch(() => {});
    p.close();
  }
});
```

(성능 테스트의 `['x' + i]: 'y'` 키는 항목마다 `when`을 다르게 만들어 150개가 모두 따로 존재하게 하려는 것이다. 이름에 `?`가 붙지만 렌더 속도 측정만 한다.)

- [ ] **Step 3: 실패 확인**

Run: `node --test --test-concurrency=1 --test-name-pattern="layer tab" test/e2e/panel.test.js`
Expected: FAIL — 첫 테스트에서 `.cb` 없음 (`Cannot read property 'classList' of null`).

- [ ] **Step 4: layers.js 구현**

`client/ui/layers.js` 전체:

```js
// 레이어 탭 (combos spec §6.2): 고정 조합 선택 영역 + 따로 스크롤되는 트리.
LMUI.layers = (() => {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const C = () => LMCore.combos;

  function visibleRows() {
    const rows = [];
    const hiddenUnder = new Set();
    for (const l of LMState.layers) {
      if (l.parentId != null && hiddenUnder.has(l.parentId)) { if (l.kind === 'group') hiddenUnder.add(l.id); continue; }
      rows.push(l);
      if (l.kind === 'group' && LMState.collapsed.has(l.id)) hiddenUnder.add(l.id);
    }
    return rows;
  }

  function selectedExisting() {
    return LMState.selectedIds.filter(id => LMState.layers.some(l => l.id === id));
  }

  // ---- 고정 영역 ----

  function pickerBar(cats) {
    const selects = cats.map(c => {
      const cur = LMState.combo[c.id] || '';
      const opts = [`<option value="" ${cur === '' ? 'selected' : ''}>전체</option>`]
        .concat(c.values.map(v => `<option value="${esc(v.id)}" ${cur === v.id ? 'selected' : ''}>${esc(v.name)}</option>`)).join('');
      return `<label class="pick"><span class="dot" style="background:${LMColors.hex(c.color)}"></span>${esc(c.name)} <select data-combo-cat="${esc(c.id)}">${opts}</select></label>`;
    }).join('');
    return `<div class="row picker"><b>조합</b>${selects}</div>`;
  }

  function madeBar(cats, sorted, existing) {
    const current = sorted.find(e => C().sameWhen(e.when, LMState.combo));
    const opts = (current ? [] : ['<option value="" selected>(새 조합)</option>']).concat(sorted.map(e => {
      const n = e.layers.filter(id => existing.has(id)).length;
      return `<option value="${esc(JSON.stringify(e.when))}" ${e === current ? 'selected' : ''}>${esc(C().comboName(e.when, cats))} · ${n}개</option>`;
    })).join('');
    return `<div class="row made"><label>만든 조합 <select class="made-select">${opts}</select></label></div>`;
  }

  function selectionBar() {
    const ids = selectedExisting();
    if (!ids.length) return '';
    const m = C().countWithLayers(LMState.docData.combos, ids);
    return `<div class="row selbar"><b>선택 ${ids.length}개</b><button data-action="remove-selected" ${m ? '' : 'disabled'}>선택 레이어를 모든 조합에서 빼기</button></div>`;
  }

  function noticeBar() {
    const orphans = C().orphanLayerIds(LMState.docData.combos, LMState.layers);
    const orphan = orphans.length
      ? `<span class="warn orphans">문서에 없는 레이어 ${orphans.length}개가 조합에 남아 있습니다 <button data-action="orphans-clean">정리</button></span>`
      : '';
    return `<div class="row notice">${orphan}<span class="hint">PSD를 저장해야 조합이 파일에 남습니다.</span></div>`;
  }

  // ---- 트리 ----

  function checkbox(l, cats) {
    const s = C().layerState(LMState.docData.combos, LMState.combo, l.id);
    if (s.state === 'inherited') {
      const name = C().comboName(s.from, cats);
      return `<span class="cb inherited" data-from="${esc(JSON.stringify(s.from))}" title="${esc(name)}에서 켜짐 (클릭하면 이동)"></span>`;
    }
    return `<span class="cb ${s.state}" title="${s.state === 'checked' ? '이 조합에서 켜짐 (클릭하면 빼기)' : '이 조합에 넣기'}"></span>`;
  }

  function row(l, cats, namesByLayer) {
    const selected = LMState.selectedIds.includes(l.id) ? ' selected' : '';
    const caret = l.kind === 'group' ? `<span class="caret">${LMState.collapsed.has(l.id) ? '▸' : '▾'}</span>` : '<span class="caret"></span>';
    const names = namesByLayer.get(l.id);
    const list = names ? `<span class="combos" title="${esc(names.join(', '))}">${esc(names.join(', '))}</span>` : '';
    return `<div class="layer-row ${l.kind}${selected}" data-layer="${l.id}" style="padding-left:${4 + l.depth * 14}px">
      ${caret}${cats.length ? checkbox(l, cats) : ''}<span class="eye${l.visible ? ' on' : ''}">${l.visible ? '👁' : '·'}</span>
      <span class="name">${esc(l.name)}</span>${list}</div>`;
  }

  function render(el) {
    const prev = el.querySelector('.tree');
    const keep = prev ? prev.scrollTop : 0;
    const cats = LMState.docData.categories;
    const sorted = C().sortCombos(LMState.docData.combos, cats);
    const existing = new Set(LMState.layers.map(l => l.id));
    // 행마다 조합 목록을 다시 정렬하지 않도록 한 번에 모은다 (레이어 수백 개 대비).
    const namesByLayer = new Map();
    for (const e of sorted) {
      const name = C().comboName(e.when, cats);
      for (const id of e.layers) {
        if (!namesByLayer.has(id)) namesByLayer.set(id, []);
        namesByLayer.get(id).push(name);
      }
    }
    const bar = cats.length
      ? pickerBar(cats) + madeBar(cats, sorted, existing) + selectionBar() + noticeBar()
      : '<p class="hint">카테고리 탭에서 카테고리를 먼저 만드세요.</p>';
    el.innerHTML = `<div class="combo-bar">${bar}</div><div class="tree">${visibleRows().map(l => row(l, cats, namesByLayer)).join('')}</div>`;
    el.querySelector('.tree').scrollTop = keep;
  }

  // 조합 선택이나 조합 데이터가 바뀐 뒤. 미리보기(Task 7)가 여기에 붙는다.
  async function afterComboChange() {
    LMApp.render();
  }

  // ---- 조작 ----

  async function syncSelection() {
    LMApp.muteEcho();
    try { await LMHost.call('selectLayers', LMState.selectedIds); } catch (err) { LMApp.status(err.message); }
    LMApp.muteEcho();
  }

  function rangeIds(fromId, toId) {
    const ids = visibleRows().map(l => l.id);
    const a = ids.indexOf(fromId), b = ids.indexOf(toId);
    if (a === -1 || b === -1) return [toId];
    return ids.slice(Math.min(a, b), Math.max(a, b) + 1);
  }

  async function onRowClick(e, rowEl) {
    const id = Number(rowEl.dataset.layer);
    if (e.shiftKey && LMState.anchorId != null) {
      LMState.selectedIds = rangeIds(LMState.anchorId, id);
    } else if (e.ctrlKey || e.metaKey) {
      LMState.selectedIds = LMState.selectedIds.includes(id) ? LMState.selectedIds.filter(x => x !== id) : LMState.selectedIds.concat(id);
      LMState.anchorId = id;
    } else {
      LMState.selectedIds = [id];
      LMState.anchorId = id;
    }
    LMApp.render();
    await syncSelection();
  }

  async function onCheckbox(cb, rowEl) {
    if (cb.classList.contains('inherited')) {
      LMState.combo = JSON.parse(cb.dataset.from);
      return afterComboChange();
    }
    const id = Number(rowEl.dataset.layer);
    const selected = selectedExisting();
    const targets = selected.includes(id) ? selected : [id];
    const on = !cb.classList.contains('checked');
    LMState.docData.combos = C().toggle(LMState.docData.combos, LMState.combo, targets, on);
    // 저장이 끝난 뒤에 다시 그린다 (categories.js commit()과 같은 이유: 클릭 삼킴 방지).
    await LMApp.saveDocData();
    return afterComboChange();
  }

  async function onClick(e) {
    const rowEl = e.target.closest('#tab-layers .layer-row');
    if (rowEl) {
      if (e.target.closest('.caret') && rowEl.classList.contains('group')) {
        const id = Number(rowEl.dataset.layer);
        if (LMState.collapsed.has(id)) LMState.collapsed.delete(id); else LMState.collapsed.add(id);
        return LMApp.render();
      }
      const cb = e.target.closest('.cb');
      if (cb) return onCheckbox(cb, rowEl);
      return onRowClick(e, rowEl);
    }
    const btn = e.target.closest('#tab-layers [data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'remove-selected') {
      const ids = selectedExisting();
      const m = C().countWithLayers(LMState.docData.combos, ids);
      if (!m || !confirm(`레이어 ${ids.length}개를 조합 ${m}개에서 뺍니다. 계속할까요?`)) return;
      LMState.docData.combos = C().removeLayers(LMState.docData.combos, ids);
      await LMApp.saveDocData();
      return afterComboChange();
    }
    if (btn.dataset.action === 'orphans-clean') {
      LMState.docData.combos = C().pruneOrphans(LMState.docData.combos, LMState.layers);
      await LMApp.saveDocData();
      return LMApp.render();
    }
  }

  async function onChange(e) {
    const pick = e.target.closest('#tab-layers select[data-combo-cat]');
    const made = e.target.closest('#tab-layers select.made-select');
    if (pick) {
      const next = Object.assign({}, LMState.combo);
      if (pick.value) next[pick.dataset.comboCat] = pick.value; else delete next[pick.dataset.comboCat];
      LMState.combo = next;
      return afterComboChange();
    }
    if (made && made.value) {
      LMState.combo = JSON.parse(made.value);
      return afterComboChange();
    }
  }

  // 리스너는 동기로 두고 비동기 본문의 거부를 한곳에서 받는다 (컨벤션 #2).
  document.addEventListener('click', e => {
    if (!e.target.closest('#tab-layers')) return;
    onClick(e).catch(err => LMApp.status(err.message));
  });
  document.addEventListener('change', e => {
    if (!e.target.closest('#tab-layers')) return;
    onChange(e).catch(err => LMApp.status(err.message));
  });

  return { render, afterComboChange };
})();
```

- [ ] **Step 5: 레이아웃 클래스와 CSS**

`client/state.js`의 `render()`에서 `const el = ...` 줄 앞에:

```js
    // 레이어 탭은 고정 영역 + 트리만 스크롤 (combos spec §6.2). main 자체는 스크롤하지 않는다.
    main.classList.toggle('fill', LMState.tab === 'layers' && !!LMState.docData);
```

`client/style.css`에서 `/* 레이어 탭 */` 아래 `.layer-row .name`, `.badge`, `.badge.stale`, `.mark-panel`, `.mark-panel .cat-line`, `.mark-panel label` 규칙을 지우고, `/* 레이어 탭 */` 블록 끝(`.layer-row.group .name` 다음)에:

```css
.layer-row .name { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.layer-row .combos { flex: 1 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; color: #888; font-size: 11px; text-align: right; }
.layer-row .cb { flex: 0 0 auto; width: 13px; height: 13px; border: 1px solid #888; border-radius: 2px; position: relative; }
.layer-row .cb:hover { border-color: #ccc; }
.layer-row .cb.checked { background: #4a90e2; border-color: #4a90e2; }
.layer-row .cb.checked::after { content: ''; position: absolute; left: 3px; top: 0; width: 4px; height: 8px; border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(45deg); }
.layer-row .cb.inherited { border-style: dashed; border-color: #4a90e2; background: rgba(74, 144, 226, .25); }
/* 고정 영역 + 트리만 스크롤 (combos spec §6.2) */
main.fill { overflow: hidden; display: flex; flex-direction: column; }
main.fill > .tab.active { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.combo-bar { flex: 0 0 auto; border-bottom: 1px solid #444; padding-bottom: 4px; margin-bottom: 4px; }
.combo-bar .pick { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
.combo-bar .notice { font-size: 11px; }
.tree { flex: 1; min-height: 0; overflow: auto; }
```

(`.layer-row .name { flex: 0 0 auto; }` 기존 규칙은 위 새 규칙으로 바뀐다 — 지우고 새 것만 남긴다.)

- [ ] **Step 6: 통과 확인**

Run: `node --test --test-concurrency=1 --test-name-pattern="layer tab" test/e2e/panel.test.js`
Expected: PASS (4 tests).

스크린샷 3장(`test/out/shots/layers-320.png`, `layers-default.png`, `layers-900.png`)을 Read로 직접 열어 확인한다:
- 320: 조합 선택이 줄바꿈되고 잘리지 않음, 레이어 이름이 말줄임, 가로 스크롤 없음.
- 기본·900: 조합 선택이 한 줄, 행 오른쪽 조합 이름이 오른쪽 정렬, `▣`(점선 테두리 반투명)과 `☑`(파란 채움 + 체크)이 구분됨.
- 이상이 있으면 CSS를 고치고 이 Step을 다시 한다.

Run: `node --test --test-concurrency=1 test/e2e/panel.test.js`
Expected: PASS (전체).

Run: `grep -rn "marks\|nativeColor\|setLayerColor\|badge\|mark-panel" client`
Expected: 출력 없음.

- [ ] **Step 7: 커밋**

```bash
git add client/ui/layers.js client/state.js client/style.css test/helpers/panel.js test/e2e/panel.test.js
git commit -m "panel: 레이어 탭을 조합 중심으로 다시 쓴다 (고정 조합 선택, 트리 체크박스, Shift 범위 선택).

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 포토샵 미리보기 토글

**Files:**
- Create: `client/preview.js`
- Modify: `client/index.html`, `client/state.js` (`refresh()`에서 prune), `client/ui/layers.js` (`madeBar`, `afterComboChange`, change 리스너)
- Modify: `client/style.css`
- Test: `test/e2e/panel.test.js`

**Interfaces:**
- Consumes: `LMState.previews`, `LMState.docKey`, `LMState.combo`, `LMState.exporting`, `LMApp.muteEcho()`, `LMCore.combos.{previewVariation, comboName, managedLayerIds, onLayerIds}`, `LMHost.call('applyVisibility'|'getLayers'|'getOpenDocKeys')`.
- Produces: 전역 `LMPreview` = `{isOn(), enable(), disable(), apply(), prune(openKeys), toggleHtml()}`. 모두 `enable`/`disable`/`apply`는 `Promise`. DOM: `.made` 줄 안 `input.preview-switch`(체크박스), `.preview-label`.

- [ ] **Step 1: 실패하는 테스트 쓰기**

`test/e2e/panel.test.js` 끝에:

```js
test('layer tab: Photoshop preview applies the combo, follows changes, restores only what it touched', async () => {
  const { byName } = buildFixture();
  psCall('writeDocData', docDataFor(byName, path.join(__dirname, '..', 'out', 'preview-export').replace(/\\/g, '/')));
  const vis = () => { const o = {}; for (const l of psCall('getLayers')) o[l.name] = l.visible; return o; };
  const toggle = `document.querySelector('#tab-layers input.preview-switch').click(); true`;
  const p = await freshPanel();
  try {
    await p.eval(`document.querySelector('#tabs [data-tab=layers]').click(); true`);
    // 미리보기 전 손작업: 관리 아닌 H 를 켜고, 관리 레이어 A1 을 끈다.
    psCall('applyVisibility', { on: [byName.H], off: [byName.A1] });
    await new Promise(r => setTimeout(r, 800));
    const before = vis();

    await p.eval(pickCombo('cA', 'a1'));
    await p.eval(pickCombo('cB', 'b0'));
    await p.eval(toggle);
    await settle();
    let v = vis();
    for (const [name, on] of Object.entries({ A0: false, A1: true, G: true, B0: true, GA: true, B1: false, B2: false, N1: true, N2: false })) {
      assert.equal(v[name], on, 'A1_B0_N1 ' + name);
    }
    assert.equal(v.H, true, '관리 아닌 레이어는 그대로');
    assert.equal(v.BG, true);
    assert.match(await p.eval(`document.querySelector('#tab-layers .preview-label').textContent`), /A1_B0_N1로 표시 중/);

    // 조합을 바꾸면 다시 반영된다.
    await p.eval(pickCombo('cN', 'n2'));
    await settle();
    v = vis();
    assert.equal(v.N1, false);
    assert.equal(v.N2, true);

    // 체크박스로 조합을 바꿔도 반영된다: B1 을 A1_B0_N2 에 넣으면 켜진다.
    await p.eval(clickCb(byName.B1));
    await settle();
    assert.equal(vis().B1, true);

    // 켜 둔 채 내보내기 → 끝나면 미리보기 상태로 돌아온다.
    await p.eval(`LMState.include = { cA: ['a0'], cB: ['b0'], cN: ['n1'] }; true`);
    const previewState = vis();
    await p.eval('LMUI.export.run()');
    assert.deepEqual((await p.eval('LMState.summary')).failures, []);
    assert.deepEqual(vis(), previewState, '내보내기 뒤에는 미리보기 상태');

    // 다른 문서로 갔다 오면: 그 문서에서는 꺼져 있고, 돌아오면 켜져 있다.
    psRun('app.documents.add(10, 10, 72, "lm-other"); "added"');
    await new Promise(r => setTimeout(r, 1200));
    assert.equal(await p.eval('LMPreview.isOn()'), false);
    psRun('app.activeDocument.close(SaveOptions.DONOTSAVECHANGES); "closed"');
    await new Promise(r => setTimeout(r, 1200));
    assert.equal(await p.eval('LMPreview.isOn()'), true);
    assert.deepEqual(await p.eval('LMState.combo'), { cA: 'a1', cB: 'b0', cN: 'n2' }, '캔버스에 반영된 조합으로 선택이 돌아온다');

    // 미리보기 중 손으로: 관리 아닌 BG 를 끄고, 관리 레이어 N2 를 지운다.
    psCall('applyVisibility', { on: [], off: [byName.BG] });
    psRun(`app.activeDocument.artLayers.getByName('N2').remove(); "removed"`);
    await new Promise(r => setTimeout(r, 1000));

    await p.eval(toggle);
    await settle();
    assert.equal(await p.eval(`document.getElementById('status').textContent`), '', '지워진 레이어가 있어도 오류 없음');
    const after = vis();
    const expected = Object.assign({}, before, { BG: false });
    delete expected.N2;
    assert.deepEqual(after, expected, '건드린 레이어만 원래대로, 손으로 바꾼 관리 아닌 레이어는 그대로');
    assert.equal(await p.eval('LMPreview.isOn()'), false);

    // 문서를 닫으면 스냅샷도 버린다.
    await p.eval(toggle);
    await settle();
    psRun('while (app.documents.length) app.activeDocument.close(SaveOptions.DONOTSAVECHANGES); "closed"');
    await new Promise(r => setTimeout(r, 1200));
    assert.deepEqual(await p.eval('Object.keys(LMState.previews)'), []);
  } finally {
    p.close();
  }
});
```

파일 위쪽 `require` 줄에 `psRun`을 더한다:

```js
const { psCall, psRun } = require('../helpers/ps');
```

- [ ] **Step 2: 실패 확인**

Run: `node --test --test-concurrency=1 --test-name-pattern="Photoshop preview" test/e2e/panel.test.js`
Expected: FAIL — `input.preview-switch` 없음 (`Cannot read property 'click' of null`).

- [ ] **Step 3: preview.js 구현**

`client/preview.js`:

```js
// 포토샵 미리보기 (combos spec §6.3). 문서별 스냅샷을 LMState.previews[docKey]에 둔다.
const LMPreview = (() => {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function current() {
    return LMState.docKey != null ? LMState.previews[LMState.docKey] || null : null;
  }

  function isOn() { return !!current(); }

  function variation() {
    return LMCore.combos.previewVariation(LMState.combo, LMState.docData.categories);
  }

  function label() {
    const v = variation();
    if (!v) return '값이 없는 카테고리가 있어 미리보기를 할 수 없습니다';
    return `${LMCore.combos.comboName(v, LMState.docData.categories)}로 표시 중 · 끄면 원래대로 돌아갑니다`;
  }

  // 가시성을 바꾸면 포토샵이 Shw/Hd 이벤트를 돌려보낸다. 패널 자신의 메아리이므로 무시한다.
  async function setVisibility(on, off) {
    LMApp.muteEcho();
    try { await LMHost.call('applyVisibility', { on, off }); } finally { LMApp.muteEcho(); }
  }

  async function reloadLayers() {
    LMState.layers = await LMHost.call('getLayers');
    LMApp.muteEcho();
  }

  // 지금 고른 조합을 포토샵에 반영한다. 꺼져 있거나 내보내는 중이면 아무것도 안 한다.
  async function apply() {
    const p = current();
    if (!p || LMState.exporting) return;
    const v = variation();
    if (!v) return;
    const combos = LMState.docData.combos;
    const managed = LMCore.combos.managedLayerIds(combos, LMState.layers);
    const onSet = new Set(LMCore.combos.onLayerIds(combos, v));
    for (const id of managed) if (p.touched.indexOf(id) === -1) p.touched.push(id);
    // 다른 문서에 갔다 오면 조합 선택이 비워진다. 캔버스와 맞게 되돌릴 수 있도록 기억한다 (state.js refresh).
    p.combo = Object.assign({}, LMState.combo);
    await setVisibility(managed.filter(id => onSet.has(id)), managed.filter(id => !onSet.has(id)));
    await reloadLayers();
  }

  async function enable() {
    if (!LMState.docKey || current()) return;
    const layers = await LMHost.call('getLayers');
    const snapshot = {};
    for (const l of layers) snapshot[l.id] = l.visible;
    LMState.previews[LMState.docKey] = { snapshot, touched: [], combo: {} };
    await apply();
  }

  // 건드린 레이어만 켜기 전 상태로 되돌린다. 그 사이 지워진 레이어는 건너뛴다.
  async function disable() {
    const p = current();
    if (!p) return;
    delete LMState.previews[LMState.docKey];
    const existing = new Set((await LMHost.call('getLayers')).map(l => l.id));
    const on = [], off = [];
    for (const id of p.touched) {
      if (!existing.has(id) || !(id in p.snapshot)) continue;
      (p.snapshot[id] ? on : off).push(id);
    }
    await setVisibility(on, off);
    await reloadLayers();
  }

  // 닫힌 문서의 스냅샷을 버린다.
  function prune(openKeys) {
    for (const key of Object.keys(LMState.previews)) if (openKeys.indexOf(key) === -1) delete LMState.previews[key];
  }

  function toggleHtml() {
    const on = isOn();
    return `<label class="preview-toggle"><input type="checkbox" class="preview-switch" ${on ? 'checked' : ''}> 포토샵 미리보기</label>` +
      (on ? `<span class="preview-label hint">${esc(label())}</span>` : '');
  }

  return { isOn, enable, disable, apply, prune, toggleHtml };
})();
```

`client/index.html`에서 `<script src="state.js"></script>` 다음 줄에:

```html
<script src="preview.js"></script>
```

- [ ] **Step 4: 레이어 탭·상태에 연결**

`client/ui/layers.js`:

`madeBar`의 반환 줄을:

```js
    return `<div class="row made"><label>만든 조합 <select class="made-select">${opts}</select></label>${LMPreview.toggleHtml()}</div>`;
```

`afterComboChange`를:

```js
  // 조합 선택이나 조합 데이터가 바뀐 뒤: 먼저 그리고, 미리보기가 켜져 있으면 반영한 뒤 눈 아이콘을 다시 그린다.
  async function afterComboChange() {
    LMApp.render();
    if (!LMPreview.isOn()) return;
    await LMPreview.apply();
    LMApp.render();
  }
```

`onChange` 맨 앞에:

```js
    const sw = e.target.closest('#tab-layers input.preview-switch');
    if (sw) {
      await (sw.checked ? LMPreview.enable() : LMPreview.disable());
      return LMApp.render();
    }
```

`client/state.js`의 `refresh()`에서 `if (!info) {` 줄 바로 앞에:

```js
      // 닫힌 문서의 미리보기 스냅샷은 버린다 (combos spec §6.3). 미리보기가 켜진 문서로
      // 돌아왔으면 캔버스에 반영된 조합으로 선택을 되돌린다 (위에서 {}로 비웠으므로).
      LMPreview.prune(info ? await LMHost.call('getOpenDocKeys') : []);
      if (fresh && key && LMState.previews[key]) LMState.combo = Object.assign({}, LMState.previews[key].combo);
```

`client/style.css` 끝에:

```css
.combo-bar .preview-toggle { display: inline-flex; align-items: center; gap: 3px; margin-left: 8px; }
.combo-bar .preview-label { font-size: 11px; }
```

- [ ] **Step 5: 통과 확인**

Run: `node --test --test-concurrency=1 --test-name-pattern="Photoshop preview" test/e2e/panel.test.js`
Expected: PASS.

`node tools/panel.js shot preview-on`으로 미리보기를 켠 상태를 찍어(테스트 중간이 아니라 따로 패널에서 토글을 켠 뒤) Read로 열어 토글·상태 글이 고정 영역 안에서 잘리지 않는지 본다.

Run: `node --test --test-concurrency=1 test/e2e/panel.test.js`
Expected: PASS (전체).

- [ ] **Step 6: 커밋**

```bash
git add client/preview.js client/index.html client/state.js client/ui/layers.js client/style.css test/e2e/panel.test.js
git commit -m "panel: 포토샵 미리보기 토글 (문서별 스냅샷, 끄면 건드린 레이어만 복원).

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: 패널 크기·버전·문서, 전체 검증

**Files:**
- Modify: `CSXS/manifest.xml`, `package.json`, `README.md`, `Plans/V 20260915_LayerMemorier_spec.md`

**Interfaces:**
- Consumes: 앞 Task 전부.
- Produces: 버전 0.2.0, 패널 Geometry, 사용 설명.

- [ ] **Step 1: manifest와 버전**

`CSXS/manifest.xml`:
- `ExtensionBundleVersion="0.1.1"` → `ExtensionBundleVersion="0.2.0"`
- `<Extension Id="local.layermemorier.panel" Version="0.1.1"/>` → `Version="0.2.0"`
- Geometry 블록 교체:

```xml
          <Geometry>
            <Size><Height>760</Height><Width>520</Width></Size>
            <MinSize><Height>300</Height><Width>320</Width></MinSize>
            <MaxSize><Height>3000</Height><Width>2000</Width></MaxSize>
          </Geometry>
```

`package.json`: `"version": "0.1.1"` → `"version": "0.2.0"`.

- [ ] **Step 2: README**

`README.md`의 `## 사용법` 2번 항목(`2. **레이어** 탭에서 ...`부터 그 아래 들여쓴 줄 끝까지)을 교체:

```markdown
2. **레이어** 탭에서 조합마다 켜질 레이어를 정한다.
   - 위쪽 고정 영역에서 카테고리마다 값을 고른다. 상관없는 카테고리는 `전체`로 둔다.
     예: A=0, B=2, N=전체 → "A0_B2" 조합. N1·N2 모두에 적용된다.
   - 아래 트리에서 그 조합에 켜질 레이어의 체크박스를 누른다. 다시 누르면 뺀다.
     - 점선 칸은 더 넓은 조합(예: A0)에서 이미 켜진 레이어다. 누르면 그 조합으로 이동한다.
     - 행 오른쪽 흐린 글씨 = 그 레이어가 들어 있는 조합 전부.
   - 여러 레이어를 한 번에: 행을 Ctrl+클릭(하나씩)·Shift+클릭(범위)으로 고른 뒤 고른 행의 체크박스를 누르면 전부 들어간다.
   - "만든 조합"에서 지금까지 만든 조합으로 바로 이동한다.
   - **포토샵 미리보기**를 켜면 고른 조합이 캔버스에 바로 보인다. `전체`인 카테고리는 첫 값으로 보여 준다.
     끄면 원래 가시성으로 돌아온다. 켠 채로 패널을 닫으면 미리보기 상태가 그대로 남으니 끄고 닫는다.
   - 어느 조합에도 안 들어간 레이어(배경·선화 등)는 내보낼 때 건드리지 않는다.
   - 포토샵 레이어 색은 바꾸지 않는다.
   - 조합은 PSD 파일 안에 저장된다. **PSD를 저장해야 남는다.** 0.1.x에서 마크한 PSD는 열면 자동으로 바뀐다.
```

`## 문제가 생기면`의 마지막 경고 항목을 교체:

```markdown
- 어떤 레이어가 어느 조합에서도 안 나온다: 그 레이어의 부모 그룹이 조합에 없이 꺼져 있다. 그룹을 켜거나 그룹도 조합에 넣는다.
```

`spec:` 줄을:

```markdown
spec: `Plans/V 20260915_LayerMemorier_spec.md`, 조합 중심 변경은 `Plans/20261001_LayerMemorier_combos_spec.md`
```

- [ ] **Step 3: 기존 spec에 대체 안내**

`Plans/V 20260915_LayerMemorier_spec.md`의 `작성 2026-09-15. 원 요청은 저장소 루트 \`기획.txt\`.` 줄 다음에 빈 줄과:

```markdown
> 2026-10-01: §4.3의 `marks`·`nativeColor`, §5.2 가시성 판정, §5.5 작업 목록의 on/off 계산, §6.2 레이어 탭, §7의 `setLayerColor`는 `Plans/20261001_LayerMemorier_combos_spec.md`로 대체되었다.
```

- [ ] **Step 4: 전체 검증**

Run: `npm test`
Expected: PASS (unit 전부).

Run: `npm run test:e2e`
Expected: PASS (host, export, panel 전부). 실패하면 superpowers:systematic-debugging으로 원인을 찾고 해당 Task의 코드를 고친 뒤 다시 돌린다.

Run: `grep -rn "marks\|nativeColor\|setLayerColor\|visibility\.js\|LMColors.native" client core host test --include=*.js --include=*.jsx --include=*.html --include=*.json`
Expected: 출력 없음. (`test/unit/combos.test.js`의 변환 테스트는 `marks`를 입력으로 쓰므로 그 파일은 예외 — 나오면 그 파일만인지 확인한다. `test/e2e/panel.test.js`의 version 1 변환 테스트도 같다.)

스크린샷 확인: `npm run panel:shot final-layers` (레이어 탭을 연 상태), `npm run panel:shot final-export` (내보내기 탭) → Read로 열어 색 옵션이 없고 레이어 탭이 Task 6 기준대로인지 본다.

- [ ] **Step 5: 커밋**

```bash
git add CSXS/manifest.xml package.json README.md "Plans/V 20260915_LayerMemorier_spec.md"
git commit -m "패널 크기 상한 추가, 0.2.0, README를 조합 중심 사용법으로.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: 사용자에게 넘길 확인 항목** (자동화 불가, combos spec §8.4)

- 포토샵에서 패널 가장자리를 끌어 2000×3000 범위까지 늘어나는지.
- 실제 PSD(레이어 수백 개)에서 체크 클릭·조합 전환 반응 속도.
