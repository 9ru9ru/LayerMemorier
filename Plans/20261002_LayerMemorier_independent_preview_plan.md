# 독립 가시성 + 패널 미리보기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 내보내기·미리보기 결과를 PSD 눈 상태와 무관하게 조합 체크만으로 정하고, Ctrl+클릭 하위 포함, 레이어 탭 패널 미리보기, 배리에이션 0개 이유(#1)를 더해 0.4.0 설치본을 만든다.

**Architecture:** 규칙은 모두 `core/`(UMD, Node 단위 테스트 가능)에 둔다: `combos.visibleLayerIds/withDescendants/unusedLayerIds/layerSignature`, `variation.emptyReasons`, 새 `core/preview-cache.js`(LRU 캐시·마지막 요청 스케줄러·분할 비율). 호스트는 `LM.renderPreview` 하나를 더한다. 패널은 새 `client/panel-preview.js`가 그림 영역을 맡고 `ui/layers.js`가 배치·Ctrl 클릭을, `ui/export.js`·`preview.js`가 새 규칙을 쓴다.

**Tech Stack:** CEP 9 패널(Chromium 63, ES2017까지), ExtendScript ES3 호스트, Node 22 `node:test`.

**Spec:** `Plans/20261002_LayerMemorier_independent_preview_spec.md`

## Global Constraints

- 호스트 `host/host.jsx`: ES3만 (`var`, `function`; `let`/`const`/`=>` 금지), ASCII만 (한글은 `\uXXXX`).
- 패널 JS: Chromium 63 — `?.`, `??`, flex `gap` 금지 (CSS는 margin으로 띄움).
- 미리보기 긴 변 최대 1024px. 캐시 20개. 그림 영역 최소 160px, 오른쪽 최소 320px, 600px 미만이면 위아래로 쌓기(그림 최소 120px).
- `localStorage` 키: `lm.panelPreview`('1'/'0'), `lm.previewSplit`(비율 0~1). 읽기·쓰기는 try/catch.
- 오류 코드 `LM_REDO_PENDING` → "다시 실행할 단계가 있어 미리보기를 미룹니다 (작업을 하나 하거나 다시 그리기)".
- 버전 0.4.0 (`package.json`, `CSXS/manifest.xml` 두 곳), manifest 기본 너비 900.
- 이 Mac에는 포토샵이 없다: e2e 불가. 호스트·패널은 vm 스텁 단위 테스트로 대신 검증한다.

## Review Focus

1. 자식만 체크된 레이어의 부모 그룹이 PSD에서 꺼져 있어도 출력에 보여야 한다 → Task 1 `visibleLayerIds` 테스트 (부모 visible:false).
2. `renderPreview` 저장이 실패해도 히스토리는 원래 단계로 돌아와야 한다 → Task 3 스텁 테스트 (save throw → activeHistoryState 복원).
3. 그리는 중 조합을 여러 번 바꾸면 마지막 것만 그려야 한다 → Task 2 스케줄러 테스트.
4. 레이어 탭이 300px처럼 아주 좁아도 분할 비율이 음수·NaN이 되면 안 된다 → Task 2 `clampSplit` 테스트.
5. `localStorage`가 없거나 throw해도 레이어 탭이 그려져야 한다 → Task 5 패널 스모크 테스트 (throw하는 localStorage).

---

### Task 1: core 규칙 (표시 규칙, 하위 포함, 0개 이유, 작업 목록)

**Files:**
- Modify: `core/combos.js` (함수 4개 추가, return에 노출)
- Modify: `core/variation.js` (`emptyReasons`)
- Modify: `core/jobs.js` (on/off = 전체 레이어, `parentHidden` 삭제, `unused` 추가)
- Test: `test/unit/combos.test.js`, `test/unit/variation.test.js`, `test/unit/jobs.test.js`

**Interfaces — Produces:**
- `combos.visibleLayerIds(combos, layers, variation) → number[]` 오름차순. 체크 레이어(문서에 있는 것) + 조상.
- `combos.withDescendants(layers, ids) → number[]` ids 먼저, 그 뒤 하위 (중복 없음).
- `combos.unusedLayerIds(combos, layers) → number[]` 오름차순.
- `combos.layerSignature(layers) → string`.
- `variation.emptyReasons(categories, include) → { noValues: string[], allFiltered: string[] }`.
- `jobs.buildJobs` 반환 형식 그대로; `job.on`/`job.off`는 문서 전체 레이어를 나눈 것(오름차순); 경고 순서 orphan → stale → unused(`{type:'unused', detail:{count}}`).

- [ ] **Step 1: 실패하는 테스트 작성**

`test/unit/combos.test.js`에 추가 (기존 파일의 require에서 새 함수를 꺼낸다):

```js
const tree = [
  { id: 1, kind: 'group', parentId: null, visible: false },
  { id: 2, kind: 'group', parentId: 1, visible: false },
  { id: 3, kind: 'layer', parentId: 2, visible: false },
  { id: 4, kind: 'layer', parentId: 2, visible: true },
  { id: 5, kind: 'layer', parentId: null, visible: true },
];

test('visibleLayerIds: checked layer plus every ancestor, regardless of PSD visibility', () => {
  assert.deepEqual(combos.visibleLayerIds([{ when: {}, layers: [3] }], tree, {}), [1, 2, 3]);
});

test('visibleLayerIds: a checked group does not turn its children on', () => {
  assert.deepEqual(combos.visibleLayerIds([{ when: {}, layers: [2] }], tree, {}), [1, 2]);
});

test('visibleLayerIds: unions matching combos, skips non-matching and missing layers', () => {
  const c = [{ when: { A: 'a0' }, layers: [3, 999] }, { when: { A: 'a1' }, layers: [5] }, { when: {}, layers: [4] }];
  assert.deepEqual(combos.visibleLayerIds(c, tree, { A: 'a0' }), [1, 2, 3, 4]);
  assert.deepEqual(combos.visibleLayerIds(c, tree, { A: 'a1' }), [1, 2, 4, 5]);
});

test('withDescendants: nested groups expand fully, plain layers stay, no duplicates', () => {
  assert.deepEqual(combos.withDescendants(tree, [1]), [1, 2, 3, 4]);
  assert.deepEqual(combos.withDescendants(tree, [5]), [5]);
  assert.deepEqual(combos.withDescendants(tree, [2, 3]), [2, 3, 4]);
});

test('unusedLayerIds: layers neither checked anywhere nor ancestors of checked ones', () => {
  assert.deepEqual(combos.unusedLayerIds([{ when: { A: 'a0' }, layers: [3] }], tree), [4, 5]);
  assert.deepEqual(combos.unusedLayerIds([], tree), [1, 2, 3, 4, 5]);
});

test('layerSignature changes with structure, not with visibility or names', () => {
  const a = combos.layerSignature(tree);
  assert.equal(combos.layerSignature(tree.map(l => Object.assign({}, l, { visible: !l.visible, name: 'x' }))), a);
  assert.notEqual(combos.layerSignature(tree.slice(1)), a);
  assert.notEqual(combos.layerSignature(tree.map(l => l.id === 4 ? Object.assign({}, l, { parentId: 1 }) : l)), a);
});
```

`test/unit/variation.test.js`에 추가:

```js
test('emptyReasons lists categories without values and categories fully filtered out', () => {
  const cats = [
    { id: 'A', values: [{ id: 'a0' }, { id: 'a1' }] },
    { id: 'B', values: [] },
    { id: 'C', values: [{ id: 'c0' }] },
  ];
  assert.deepEqual(emptyReasons(cats, {}), { noValues: ['B'], allFiltered: [] });
  assert.deepEqual(emptyReasons(cats, { A: [], C: ['c0'] }), { noValues: ['B'], allFiltered: ['A'] });
  assert.deepEqual(emptyReasons(cats.filter(c => c.id !== 'B'), undefined), { noValues: [], allFiltered: [] });
});
```

`test/unit/jobs.test.js`: 기존 테스트의 기대값을 새 규칙으로 바꾸고 `parentHidden` 두 테스트를 아래로 교체한다. fixture `layers` = G(10, 꺼짐) ⊃ inG(11), A0(20), A1B1(21), plain(30).

```js
test('on = checked layers + ancestors, off = every other layer in the document', () => {
  const d = doc([{ when: { A: 'a0' }, layers: [20] }, { when: { A: 'a1', B: 'b1' }, layers: [21] }]);
  const { jobs, conflicts } = buildJobs(d, layers, enumerate(categories));
  assert.equal(conflicts.length, 0);
  assert.deepEqual(jobs[0], { on: [20], off: [10, 11, 21, 30], relativePath: 'fx_A0_B0.png' });
  assert.deepEqual(jobs[3], { on: [21], off: [10, 11, 20, 30], relativePath: 'fx_A1_B1.png' });
});

test('a child checked under a hidden group turns the group on too (no parentHidden warning)', () => {
  const d = doc([{ when: { A: 'a0' }, layers: [11] }]);
  const { jobs, warnings } = buildJobs(d, layers, enumerate(categories));
  assert.deepEqual(jobs[0].on, [10, 11]);
  assert.deepEqual(jobs[2].on, []);
  assert.ok(!warnings.some(w => w.type === 'parentHidden'));
});

test('a checked group without checked children is on but its children stay off', () => {
  const d = doc([{ when: {}, layers: [10] }]);
  const { jobs } = buildJobs(d, layers, enumerate(categories));
  assert.deepEqual(jobs[0], { on: [10], off: [11, 20, 21, 30], relativePath: 'fx_A0_B0.png' });
});

test('layers never checked anywhere produce one unused warning with the count', () => {
  const d = doc([{ when: { A: 'a0' }, layers: [20] }]);
  const { warnings } = buildJobs(d, layers, enumerate(categories));
  assert.deepEqual(warnings, [{ type: 'unused', detail: { count: 4 } }]);
});
```

나머지 기존 jobs 테스트(전부 `unused` 경고가 함께 나오게 됨)는 `warnings`를 `w.type !== 'unused'`로 거른 뒤 비교하고, `off` 기대값을 "문서 전체 − on"으로 고친다.

- [ ] **Step 2: 실패 확인** — `npm test` → 새 테스트가 `is not a function` / 기대값 불일치로 FAIL.

- [ ] **Step 3: 구현**

`core/combos.js` (`onLayerIds` 아래):

```js
  // independent spec §3.1. 체크한 레이어(문서에 있는 것) + 그 조상 그룹. PSD 눈 상태와 무관하다.
  function visibleLayerIds(combos, layers, variation) {
    const byId = new Map(layers.map(l => [l.id, l]));
    const set = new Set();
    for (const id of onLayerIds(combos, variation)) {
      // 이미 넣은 레이어를 만나면 그 위 조상도 이미 들어 있다.
      for (let l = byId.get(id); l && !set.has(l.id); l = l.parentId != null ? byId.get(l.parentId) : null) set.add(l.id);
    }
    return Array.from(set).sort(asc);
  }

  // independent spec §3.3. ids와 그중 그룹의 모든 하위 레이어.
  function withDescendants(layers, ids) {
    const out = new Set(ids);
    let grew = true;
    while (grew) {
      grew = false;
      for (const l of layers) if (l.parentId != null && out.has(l.parentId) && !out.has(l.id)) { out.add(l.id); grew = true; }
    }
    return Array.from(out);
  }

  // independent spec §3.2. 어느 조합에도 없고, 어느 조합 레이어의 조상도 아닌 레이어.
  function unusedLayerIds(combos, layers) {
    const used = new Set(visibleLayerIds([{ when: {}, layers: Array.from(allLayerIds(combos)) }], layers, {}));
    return layers.filter(l => !used.has(l.id)).map(l => l.id).sort(asc);
  }

  // independent spec §4.4. 레이어 id·부모·순서가 같으면 같은 문자열 (눈·이름은 무시).
  function layerSignature(layers) {
    return layers.map(l => l.id + ':' + (l.parentId == null ? '' : l.parentId)).join(',');
  }
```

return 객체에 `visibleLayerIds, withDescendants, unusedLayerIds, layerSignature` 추가.

`core/variation.js`:

```js
  // independent spec §3.4. 배리에이션이 0개가 되는 카테고리 쪽 이유.
  function emptyReasons(categories, include) {
    const noValues = [], allFiltered = [];
    for (const c of categories) {
      if (!c.values.length) noValues.push(c.id);
      else if (!valueIdsFor(c, include).length) allFiltered.push(c.id);
    }
    return { noValues, allFiltered };
  }
```

return에 `emptyReasons` 추가.

`core/jobs.js`: `hiddenUnmanagedAncestor`와 `parentHidden` 경고, `managedIds`를 지우고:

```js
  function buildJobs(docData, layers, variations) {
    const combos = docData.combos || [];
    const allIds = layers.map(l => l.id).sort((a, b) => a - b);
    const warnings = [];

    for (const id of combosLib.orphanLayerIds(combos, layers)) warnings.push({ type: 'orphan', layerId: id });
    for (const c of combos) {
      if (combosLib.isStale(c.when, docData.categories)) warnings.push({ type: 'stale', detail: { when: c.when } });
    }
    const unused = combosLib.unusedLayerIds(combos, layers).length;
    if (unused) warnings.push({ type: 'unused', detail: { count: unused } });

    const seen = new Map();
    const conflicts = [];
    const jobs = variations.map(variation => {
      // independent spec §3.1: 문서의 모든 레이어를 켜짐/꺼짐으로 나눈다.
      const onSet = new Set(combosLib.visibleLayerIds(combos, layers, variation));
      const on = allIds.filter(id => onSet.has(id));
      const off = allIds.filter(id => !onSet.has(id));
      ...경로·충돌 그대로...
    });
    return { jobs, conflicts, warnings };
  }
```

- [ ] **Step 4: 통과 확인** — `npm test` → 전부 PASS.
- [ ] **Step 5: 커밋** — `core: 표시 규칙을 체크+조상만 켜고 나머지는 끄도록 (PSD 눈과 무관), 하위 포함·미사용·0개 이유.`

### Task 2: core/preview-cache.js (캐시·스케줄러·분할 비율)

**Files:**
- Create: `core/preview-cache.js`
- Test: `test/unit/preview-cache.test.js`

**Interfaces — Produces (`LMCore.previewCache` / `require('../../core/preview-cache')`):**
- `createCache(limit) → { get(key) → value|null, set(key, value), delete(key), clear(), size }` — get은 최근 사용으로 올린다, 넘치면 가장 오래 안 쓴 것부터 버린다.
- `createScheduler(worker) → { request(job) → Promise<void>, busy }` — 한 번에 하나, 도는 중 요청은 대기 칸 하나에 덮어씀. 반환 Promise는 대기 칸까지 다 비면 resolve. worker 예외는 삼키고 다음으로 간다.
- `clampSplit(ratio, total, minPane, minMain) → number` — 0~1 비율. ratio가 NaN·0 이하·1 이상이면 0.4로 본다. total ≤ 0이면 0.4. 결과 px = min(ratio·total, total − minMain) 후 max(·, minPane), 다시 total로 나눠 [0,1]로 자른다.

- [ ] **Step 1: 실패하는 테스트**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCache, createScheduler, clampSplit } = require('../../core/preview-cache');

test('cache evicts the least recently used entry beyond the limit', () => {
  const c = createCache(2);
  c.set('a', 1); c.set('b', 2);
  assert.equal(c.get('a'), 1); // a is now most recent
  c.set('c', 3);
  assert.equal(c.get('b'), null);
  assert.equal(c.get('a'), 1);
  assert.equal(c.get('c'), 3);
  assert.equal(c.size, 2);
  c.delete('a'); assert.equal(c.get('a'), null);
  c.clear(); assert.equal(c.size, 0);
});

test('scheduler runs one job at a time and keeps only the latest pending request', async () => {
  const ran = [];
  let release;
  const s = createScheduler(async job => { ran.push(job); if (job === 1) await new Promise(r => { release = r; }); });
  const done = s.request(1);
  assert.equal(s.busy, true);
  s.request(2); s.request(3); s.request(4);
  release();
  await done;
  assert.deepEqual(ran, [1, 4]);
  assert.equal(s.busy, false);
});

test('scheduler survives a throwing worker and keeps going', async () => {
  const ran = [];
  let release;
  const s = createScheduler(async job => {
    ran.push(job);
    if (job === 1) { await new Promise(r => { release = r; }); throw new Error('boom'); }
  });
  const done = s.request(1);
  s.request(2);
  release();
  await done;
  assert.deepEqual(ran, [1, 2]);
  await s.request(3);
  assert.deepEqual(ran, [1, 2, 3]);
});

test('clampSplit keeps both sides above their minimum and never returns NaN', () => {
  assert.equal(clampSplit(0.4, 1000, 160, 320), 0.4);
  assert.equal(clampSplit(0.9, 1000, 160, 320), 0.68);
  assert.equal(clampSplit(0.05, 1000, 160, 320), 0.16);
  assert.equal(clampSplit(NaN, 1000, 160, 320), 0.4);
  assert.equal(clampSplit(0.4, 0, 160, 320), 0.4);
  const narrow = clampSplit(0.4, 300, 160, 320); // 둘 다 못 지킴 → 그림 최소 우선
  assert.ok(narrow > 0 && narrow <= 1);
  assert.equal(Math.round(narrow * 300), 160);
});
```

- [ ] **Step 2: 실패 확인** — `npm test` → `Cannot find module`.
- [ ] **Step 3: 구현** — 다른 core 파일과 같은 UMD 머리(`root.LMCore.previewCache = factory()`).

```js
  function createCache(limit) {
    const map = new Map();
    return {
      get(key) {
        if (!map.has(key)) return null;
        const v = map.get(key);
        map.delete(key); map.set(key, v);
        return v;
      },
      set(key, value) {
        map.delete(key); map.set(key, value);
        while (map.size > limit) map.delete(map.keys().next().value);
      },
      delete(key) { map.delete(key); },
      clear() { map.clear(); },
      get size() { return map.size; },
    };
  }

  function createScheduler(worker) {
    let current = null;      // 도는 중인 루프의 Promise
    let pending = null;
    let hasPending = false;
    async function loop(job) {
      let next = job;
      for (;;) {
        try { await worker(next); } catch (e) { /* worker가 스스로 알린다 */ }
        if (!hasPending) break;
        next = pending; pending = null; hasPending = false;
      }
    }
    return {
      request(job) {
        if (current) { pending = job; hasPending = true; return current; }
        current = loop(job).then(() => { current = null; });
        return current;
      },
      get busy() { return current !== null; },
    };
  }

  function clampSplit(ratio, total, minPane, minMain) {
    const DEFAULT = 0.4;
    if (!(total > 0)) return DEFAULT;
    if (!(ratio > 0 && ratio < 1)) ratio = DEFAULT;
    let px = Math.min(ratio * total, total - minMain);
    px = Math.max(px, minPane);
    return Math.min(1, Math.max(0, Math.round(px / total * 10000) / 10000));
  }
```

`client/index.html`에 `<script src="../core/preview-cache.js"></script>`를 `jobs.js` 다음에 추가.

- [ ] **Step 4: 통과 확인** — `npm test`.
- [ ] **Step 5: 커밋** — `core: 패널 미리보기용 LRU 캐시, 마지막 요청 스케줄러, 분할 비율.`

### Task 3: 호스트 `LM.renderPreview`

**Files:**
- Modify: `host/host.jsx` (preview 섹션 뒤에 추가)
- Create: `test/helpers/host-stub.js` (ExtendScript 전역 스텁, vm으로 host.jsx 실행)
- Test: `test/unit/host.test.js`

**Interfaces:**
- Consumes: 기존 `applyVisibilityAs`, `withMergedDuplicate`, `withoutDialogs`, `activateExpected`, `sfwPng24`, `px`.
- Produces: `LM.renderPreview(JSON {doc, on, off, maxSize}) → JSON {path, width, height, ms}` 또는 `{error}` (`LM_REDO_PENDING` 포함).

- [ ] **Step 1: 스텁과 실패하는 테스트**

`test/helpers/host-stub.js`: `vm.createContext`에 다음을 넣고 `host/host.jsx`를 실행해 `{ LM, ps }`를 돌려준다.
- `app`: `documents`(문서 1개), `activeDocument`, `displayDialogs`, `preferences.rulerUnits`, `charIDToTypeID(s)`/`stringIDToTypeID(s)` = 문자열 그대로.
- 문서: `name`, `fullName.fsName`, `width/height`(`{as: () => n}`), `activeHistoryState`(대입을 `ps.log`에 기록), `duplicate()` → 복제본(`resizeImage(w,h)`가 크기를 바꾸고 기록, `close()` 기록).
- `ActionReference`/`ActionDescriptor`/`ActionList`: 넣은 것을 저장하는 단순 객체. `executeAction(id, desc)`: `ps.log`에 `[id, desc]` 기록; `Expr`(SaveForWeb)이면 `desc`의 경로에 `ps.files`로 파일을 만든다 (`ps.failSave`가 true면 throw). `executeActionGet(ref)`: `HstS` 참조면 `{getInteger(k) → k==='ItmI' ? ps.history.index : ps.history.count}`.
- `Folder`(`temp.fsName`, `exists`, `create`, `getFiles(mask)`), `File`(`exists` = `ps.files`에 있는지, `remove`, `fsName`), `UnitValue`, `Units`, `DialogModes`, `ResampleMethod`, `SaveOptions`, `AnchorPosition`. `JSON`은 Node 것.

`test/unit/host.test.js`:

```js
test('host.jsx stays ES3 + ASCII', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../host/host.jsx'), 'utf8');
  assert.ok(!/[^\x00-\x7f]/.test(src), 'non-ASCII character');
  assert.ok(!/=>|\blet\s|\bconst\s/.test(src.replace(/\/\/.*$/gm, '')), 'ES5+ syntax');
  new vm.Script(src); // 문법 오류면 throw
});

test('renderPreview applies visibility, downsizes to maxSize, saves, then restores history', () => {
  const { LM, ps } = loadHost({ width: 12000, height: 13500 });
  const r = JSON.parse(LM.renderPreview(JSON.stringify({ doc: ps.docRef, on: [1, 2], off: [3], maxSize: 1024 })));
  assert.ok(!r.error, r.error);
  assert.equal(r.height, 1024);
  assert.equal(r.width, Math.round(12000 * 1024 / 13500));
  assert.match(r.path, /LayerMemorier\/preview_\d+\.png$/);
  assert.equal(ps.doc.activeHistoryState, ps.savedState); // 되돌림
  assert.ok(ps.log.some(e => e[0] === 'Shw '));
  assert.ok(ps.log.some(e => e[0] === 'Hd  '));
});

test('renderPreview keeps a small document at its size', () => {
  const { LM, ps } = loadHost({ width: 800, height: 600 });
  const r = JSON.parse(LM.renderPreview(JSON.stringify({ doc: ps.docRef, on: [1], off: [], maxSize: 1024 })));
  assert.deepEqual([r.width, r.height], [800, 600]);
});

test('renderPreview refuses when redo states exist and touches nothing', () => {
  const { LM, ps } = loadHost({ width: 100, height: 100, history: { index: 3, count: 5 } });
  const r = JSON.parse(LM.renderPreview(JSON.stringify({ doc: ps.docRef, on: [1], off: [2], maxSize: 1024 })));
  assert.match(r.error, /LM_REDO_PENDING/);
  assert.ok(!ps.log.some(e => e[0] === 'Shw ' || e[0] === 'Hd  '));
});

test('renderPreview restores history even when saving fails', () => {
  const { LM, ps } = loadHost({ width: 100, height: 100, failSave: true });
  const r = JSON.parse(LM.renderPreview(JSON.stringify({ doc: ps.docRef, on: [1], off: [2], maxSize: 1024 })));
  assert.ok(r.error);
  assert.equal(ps.doc.activeHistoryState, ps.savedState);
  assert.ok(ps.closedDuplicates >= 1);
});
```

- [ ] **Step 2: 실패 확인** — `npm test` → `LM.renderPreview is not a function`.
- [ ] **Step 3: 구현** (`LM.getOpenDocKeys` 앞):

```js
  // ---- panel preview (independent preview spec 5.2) ----

  var previewCleaned = false;

  function previewFolder() {
    var f = new Folder(Folder.temp.fsName + '/LayerMemorier');
    if (!f.exists) f.create();
    return f;
  }

  // itemIndex < count: there are history states after the current one (redo).
  // Reverting to the saved state below would throw them away, so refuse instead.
  function hasRedo() {
    var r = new ActionReference();
    r.putEnumerated(cid('HstS'), cid('Ordn'), cid('CrnH'));
    var d = executeActionGet(r);
    return d.getInteger(cid('ItmI')) < d.getInteger(cid('Cnt '));
  }

  LM.renderPreview = wrap(function (a) {
    if (!hasDoc()) throw new Error('no document');
    activateExpected(a.doc);
    var doc = app.activeDocument;
    var started = new Date().getTime();
    var folder = previewFolder();
    if (!previewCleaned) {
      var old = folder.getFiles('preview_*.png');
      for (var i = 0; i < old.length; i++) { try { old[i].remove(); } catch (e) {} }
      previewCleaned = true;
    }
    if (hasRedo()) throw new Error('LM_REDO_PENDING');
    var file = new File(folder.fsName + '/preview_' + started + '.png');
    var size = null;
    var saved = doc.activeHistoryState;
    withoutDialogs(function () {
      try {
        applyVisibilityAs('LayerMemorier preview', a.on, a.off);
        withMergedDuplicate(doc, 'lm_preview_tmp', function (dup) {
          var w = dup.width.as('px');
          var h = dup.height.as('px');
          var k = Math.min(1, a.maxSize / Math.max(w, h));
          if (k < 1) {
            dup.resizeImage(px(Math.max(1, Math.round(w * k))), px(Math.max(1, Math.round(h * k))), undefined, ResampleMethod.BICUBICSHARPER);
          }
          sfwPng24(file, { interlaced: false, transparency: true, matte: 'none' });
          size = { width: dup.width.as('px'), height: dup.height.as('px') };
        });
      } finally {
        doc.activeHistoryState = saved;
      }
    });
    if (!file.exists) throw new Error('preview save failed, file not found: ' + file.fsName);
    return { path: String(file.fsName).replace(/\\/g, '/'), width: size.width, height: size.height, ms: new Date().getTime() - started };
  });
```

- [ ] **Step 4: 통과 확인** — `npm test`.
- [ ] **Step 5: 커밋** — `host: renderPreview — 조합대로 합친 복제본을 1024px PNG로, 끝나면 히스토리 되돌림, Redo 있으면 거부.`

### Task 4: 패널 — 새 규칙 반영 (내보내기 탭, 포토샵 미리보기, Ctrl+클릭)

**Files:**
- Modify: `client/ui/export.js` (`exportBegin` 전체 id, 0개 이유, `unused` 문구, `parentHidden` 문구 삭제)
- Modify: `client/preview.js` (`apply`를 `visibleLayerIds`·전체 레이어로)
- Modify: `client/ui/layers.js` (`checkboxTargets(id, deep)` + Ctrl 처리, 그룹 체크박스 title)
- Create: `test/helpers/panel-vm.js` (client 스크립트를 vm에 올리는 스텁)
- Test: `test/unit/panel.test.js`

**Interfaces:**
- Consumes: Task 1의 `visibleLayerIds`, `withDescendants`, `emptyReasons`.
- Produces: `LMUI.layers.checkboxTargets(id, deep) → number[]` (테스트용으로 노출).

- [ ] **Step 1: 스텁과 실패하는 테스트**

`test/helpers/panel-vm.js` `loadPanel({ storage })`: `vm.createContext`에 `window`(자기 자신), `document`(`addEventListener` 무시, `getElementById`/`querySelector` → 가짜 요소, `querySelectorAll` → `[]`), `CSInterface`(생성자, `getSystemPath` → `'/ext'`), `SystemPath`, `CSEvent`, `localStorage`(옵션: 정상 Map 기반 / throw하는 것), `console`을 넣는다. `client/index.html`의 `<script src>` 순서대로 `main.js`만 빼고 `vm.runInContext`로 실행한다. 반환: `{ ctx, el(width) }` — `el`은 `innerHTML`, `clientWidth`, `querySelector(() => ({ scrollTop: 0 }))`를 가진 가짜 요소. `ctx.LMHost.call`은 테스트가 덮어쓴다.

`test/unit/panel.test.js`:

```js
function setupDoc(ctx, { categories, combos, layers }) {
  ctx.LMState.docInfo = { name: 'a.psd', path: 'C:/a.psd' };
  ctx.LMState.docKey = 'C:/a.psd';
  ctx.LMState.docData = Object.assign(ctx.LMApp.newDocData('a'), { categories, combos });
  ctx.LMState.docData.output = ctx.LMCore.output.normalize(undefined);
  ctx.LMState.layers = layers;
}
const L = (id, parentId, kind = 'layer') => ({ id, name: 'L' + id, kind, visible: true, depth: parentId == null ? 0 : 1, parentId, color: 'none' });
const cat = (id, vals) => ({ id, name: id, color: 'red', labelFormat: '{c}{v}', folder: false, values: vals.map(v => ({ id: v, name: v, label: v })) });

test('export tab names a category without values when there are 0 variations', () => {
  const { ctx, el } = loadPanel();
  setupDoc(ctx, { categories: [cat('누드', ['기본']), cat('야스', [])], combos: [], layers: [L(1, null)] });
  const e = el(900);
  ctx.LMUI.export.render(e);
  assert.match(e.innerHTML, /값 없는 카테고리: 야스/);
});

test('export tab names a category fully unchecked in "이번만 내보낼 값"', () => {
  const { ctx, el } = loadPanel();
  setupDoc(ctx, { categories: [cat('옷', ['a', 'b'])], combos: [], layers: [L(1, null)] });
  ctx.LMState.include = { 옷: [] };
  const e = el(900);
  ctx.LMUI.export.render(e);
  assert.match(e.innerHTML, /모두 끈 카테고리: 옷/);
});

test('export tab shows the unused-layer warning and no parentHidden text', () => {
  const { ctx, el } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a'])], combos: [{ when: {}, layers: [2] }], layers: [L(1, null, 'group'), L(2, 1), L(3, null)] });
  const e = el(900);
  ctx.LMUI.export.render(e);
  assert.match(e.innerHTML, /체크되지 않은 레이어 1개/);
});

test('ctrl on a group checkbox targets the group and all descendants', () => {
  const { ctx } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a'])], combos: [], layers: [L(1, null, 'group'), L(2, 1, 'group'), L(3, 2), L(4, null)] });
  assert.deepEqual(ctx.LMUI.layers.checkboxTargets(1, true), [1, 2, 3]);
  assert.deepEqual(ctx.LMUI.layers.checkboxTargets(1, false), [1]);
  ctx.LMState.selectedIds = [1, 4];
  assert.deepEqual(ctx.LMUI.layers.checkboxTargets(4, true), [1, 4, 2, 3]);
});

test('photoshop preview turns every non-checked layer off, independent of PSD state', async () => {
  const { ctx } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a'])], combos: [{ when: {}, layers: [3] }], layers: [L(1, null, 'group'), L(2, 1, 'group'), L(3, 2), L(4, null)] });
  const calls = [];
  ctx.LMHost.call = async (fn, arg) => { calls.push([fn, arg]); return fn === 'getLayers' ? ctx.LMState.layers : { ok: true }; };
  await ctx.LMPreview.enable();
  const vis = calls.find(c => c[0] === 'applyVisibility')[1];
  assert.deepEqual(vis.on, [1, 2, 3]);
  assert.deepEqual(vis.off, [4]);
});
```

`export.run`의 `exportBegin` 인자는 스텁으로 확인한다:

```js
test('export begins with every layer id so the whole document is restored afterwards', async () => {
  const { ctx } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a'])], combos: [{ when: {}, layers: [3] }], layers: [L(1, null, 'group'), L(3, 1), L(4, null)] });
  ctx.LMState.docData.destination = 'C:/out';
  const calls = [];
  ctx.LMHost.call = async (fn, arg) => { calls.push([fn, arg]); return fn === 'exportOne' ? { path: arg.path } : { ok: true }; };
  ctx.LMApp.refresh = async () => {};
  await ctx.LMUI.export.run();
  assert.deepEqual(calls.find(c => c[0] === 'exportBegin')[1].layerIds, [1, 3, 4]);
  const job = calls.find(c => c[0] === 'exportOne')[1];
  assert.deepEqual([job.on, job.off], [[1, 3], [4]]);
});
```

- [ ] **Step 2: 실패 확인** — `npm test`.
- [ ] **Step 3: 구현**

`client/ui/export.js`:
- `exportBegin`: `{ layerIds: LMState.layers.map(l => l.id), doc }`.
- `warningText`: `parentHidden` 줄 삭제, `if (w.type === 'unused') return \`어느 조합에도 체크되지 않은 레이어 ${w.detail.count}개는 출력되지 않음\`;`.
- `preview()`가 `reasons: pv.variations.length ? null : LMCore.variation.emptyReasons(d.categories, LMState.include)`도 돌려주고, `previewBlock`은 개수 줄 아래에:

```js
  function emptyText(r) {
    const names = ids => ids.map(id => LMState.docData.categories.find(c => c.id === id).name).join(', ');
    const lines = [];
    if (r.noValues.length) lines.push(`값 없는 카테고리: ${names(r.noValues)}`);
    if (r.allFiltered.length) lines.push(`"이번만 내보낼 값"에서 모두 끈 카테고리: ${names(r.allFiltered)}`);
    if (!lines.length) lines.push('"항상 뺄 조합"이 모든 배리에이션을 뺐습니다');
    return lines.map(t => `<p class="err empty-reason">${esc(t)}</p>`).join('');
  }
```

`client/preview.js` `apply()`:

```js
    const all = LMState.layers.map(l => l.id);
    const visible = new Set(LMCore.combos.visibleLayerIds(LMState.docData.combos, LMState.layers, v));
    for (const id of all) if (p.touched.indexOf(id) === -1) p.touched.push(id);
    p.combo = Object.assign({}, LMState.combo);
    await setVisibility(all.filter(id => visible.has(id)), all.filter(id => !visible.has(id)));
    for (const l of LMState.layers) l.visible = visible.has(l.id);
```

(`touched`가 수백 개면 `indexOf`가 느리므로 `p.touched`는 `enable()`에서 전체 id로 시작하게 바꾸고 `apply`에서는 새 id만 더한다: `const seen = new Set(p.touched); for (const id of all) if (!seen.has(id)) p.touched.push(id);`)

`client/ui/layers.js`:

```js
  // 체크박스 대상: 클릭한 행이 선택돼 있으면 선택 전체, 아니면 그 행. deep(Ctrl)이면 그룹의 하위까지 (independent spec §4.3).
  function checkboxTargets(id, deep) {
    const selected = selectedExisting();
    const base = selected.includes(id) ? selected : [id];
    return deep ? C().withDescendants(LMState.layers, base) : base;
  }
```

`onCheckbox(cb, rowEl, e)`에서 `const targets = checkboxTargets(id, e.ctrlKey || e.metaKey);`, `onClick`에서 `onCheckbox(cb, rowEl, e)`. `checkbox(l, cats)`의 title에 그룹이면 ` · Ctrl+클릭: 하위 레이어까지`. return에 `checkboxTargets` 추가.

- [ ] **Step 4: 통과 확인** — `npm test`.
- [ ] **Step 5: 커밋** — `panel: 내보내기·포토샵 미리보기에 새 표시 규칙, Ctrl+클릭 하위 포함, 배리에이션 0개 이유 표시. Closes #1`

### Task 5: 패널 미리보기 (그림 영역·토글·분할)

**Files:**
- Create: `client/panel-preview.js` (`LMPanelPreview`)
- Modify: `client/ui/layers.js` (배치·토글·경계 끌기·`afterComboChange`에서 요청)
- Modify: `client/state.js` (`refresh` 끝에서 `LMPanelPreview.onRefresh(fresh)`)
- Modify: `client/ui/export.js` (`run` finally에서 `LMPanelPreview.request(false)`)
- Modify: `client/index.html` (`panel-preview.js`를 `preview.js` 다음에), `client/style.css`
- Test: `test/unit/panel.test.js`

**Interfaces:**
- Consumes: Task 2 `createCache/createScheduler/clampSplit`, Task 3 `renderPreview`, Task 1 `visibleLayerIds/layerSignature`.
- Produces: `LMPanelPreview = { isOn(), setOn(bool), request(force), onRefresh(fresh), paneHtml(), ratio(), setRatio(r), state }`.

동작 (spec §4.2·§4.4):
- `isOn()` = `localStorage['lm.panelPreview'] === '1'` (try/catch, 실패 시 메모리 값).
- `target()` = `previewVariation(LMState.combo, categories)`; null이면 null. on/off = `visibleLayerIds`로 전체 레이어를 나눔. `key = on.join(',')`, `label = comboName(variation)`.
- `request(force)`: 꺼져 있거나 문서 없으면 무시. target이 null이면 `state.error = '값이 없는 카테고리가 있어 미리보기를 할 수 없습니다'` 후 `paint()`. force면 `cache.delete(key)`. 캐시에 있으면 `state = {path, label, busy:false, error:''}`, `paint()`. 없으면 `scheduler.request(t)`.
- worker(t): 캐시에 이미 있으면 그것을 쓰고 끝. `LMState.exporting`이면 아무것도 안 함. `state.busy = true; paint()`, `muteEcho()`, `LMHost.call('renderPreview', {doc, on, off, maxSize: 1024})`, 성공 → `cache.set(key, path)` 및 `state.path/label` 갱신, 실패 → `state.error = 메시지(LM_REDO_PENDING이면 Global Constraints 문구)`. finally `muteEcho(); state.busy = false; paint()`.
- `onRefresh(fresh)`: fresh면 `cache.clear()`, `signature = null`. `sig = layerSignature(LMState.layers)`; 다르면 저장하고 `cache.clear()` 후 `request(false)`.
- `paneHtml()`: `<div class="pv-pane">` 안에 머리줄(`<span class="pv-label">` + `<button data-action="pv-redraw">다시 그리기</button>`), 본문(`state.path`가 있으면 `<img src="file:///...">`, 오류면 `<p class="err">`, busy면 `<div class="pv-busy">그리는 중…</div>`).
- `paint()`: `document.querySelector('#tab-layers .pv-pane')`가 있으면 그 outerHTML만 `paneHtml()`로 바꾼다.

`layers.js` `render(el)`:
- `madeBar`의 토글 옆에 `<label class="preview-toggle"><input type="checkbox" class="panel-preview-switch" ${on?'checked':''}> 패널 미리보기</label>`.
- 꺼져 있으면 지금 구조 그대로. 켜져 있으면:

```js
    const stack = el.clientWidth < 600;
    const total = stack ? el.clientHeight : el.clientWidth;
    const r = LMCore.previewCache.clampSplit(LMPanelPreview.ratio(), total, stack ? 120 : 160, stack ? 160 : 320);
    el.innerHTML = `<div class="lm-split${stack ? ' stack' : ''}">
      <div class="pv-wrap" style="flex:0 0 ${(r * 100).toFixed(2)}%">${LMPanelPreview.paneHtml()}</div>
      <div class="pv-divider" title="끌어서 너비 조절"></div>
      <div class="lm-main"><div class="combo-bar">${bar}</div><div class="tree">${rows}</div></div></div>`;
```

- 경계 끌기: `mousedown` on `.pv-divider` → `mousemove`에서 `clampSplit((x - left)/width …)`로 `.pv-wrap` flex-basis만 바꾸고, `mouseup`에서 `LMPanelPreview.setRatio(r)`. 쌓기면 y/height.
- `change`: `.panel-preview-switch` → `LMPanelPreview.setOn(checked)`; `LMApp.render()`; 켰으면 `request(false)`.
- `click` `[data-action="pv-redraw"]` → `request(true)`.
- `afterComboChange()` 시작에서 `LMPanelPreview.request(false)`.
- `window.addEventListener('resize', 디바운스 150ms → 레이어 탭이고 미리보기 켜짐이면 LMApp.render())`.

CSS (`style.css` 레이어 탭 아래):

```css
/* 패널 미리보기 분할 (independent spec §4.2) */
.lm-split { flex: 1; min-height: 0; display: flex; }
.lm-split.stack { flex-direction: column; }
.pv-wrap { min-width: 0; min-height: 0; display: flex; }
.pv-pane { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; background: #262626; border-radius: 3px; }
.pv-head { display: flex; align-items: center; padding: 2px 4px; font-size: 11px; color: #bbb; }
.pv-head .pv-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pv-body { flex: 1; min-height: 0; position: relative;
  background: repeating-conic-gradient(#3a3a3a 0% 25%, #2e2e2e 0% 50%) 50% / 16px 16px; }
.pv-body img { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; }
.pv-body.busy img { opacity: .5; }
.pv-busy { position: absolute; left: 0; right: 0; top: 45%; text-align: center; color: #fff; }
.pv-body .err { padding: 8px; }
.pv-divider { flex: 0 0 4px; cursor: col-resize; background: #444; margin: 0 4px; }
.lm-split.stack .pv-divider { cursor: row-resize; margin: 4px 0; }
.lm-main { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
```

(Chromium 63은 `repeating-conic-gradient`를 모른다 → 체커보드는 두 겹 `linear-gradient(45deg, …)` 방식으로 쓴다.)

- [ ] **Step 1: 실패하는 테스트** (`test/unit/panel.test.js`에 추가)

```js
test('layer tab renders without the preview pane when the toggle is off (default)', () => {
  const { ctx, el } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a'])], combos: [], layers: [L(1, null)] });
  const e = el(900);
  ctx.LMUI.layers.render(e);
  assert.doesNotMatch(e.innerHTML, /pv-pane/);
  assert.match(e.innerHTML, /패널 미리보기/);
});

test('layer tab still renders when localStorage throws', () => {
  const { ctx, el } = loadPanel({ storage: 'throw' });
  setupDoc(ctx, { categories: [cat('A', ['a'])], combos: [], layers: [L(1, null)] });
  ctx.LMPanelPreview.setOn(true);
  const e = el(900);
  ctx.LMUI.layers.render(e);
  assert.match(e.innerHTML, /pv-pane/);
});

test('turning the panel preview on renders once, then serves the same combo from cache', async () => {
  const { ctx, el } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a0', 'a1'])], combos: [{ when: { A: 'a1' }, layers: [2] }], layers: [L(1, null), L(2, null)] });
  const calls = [];
  ctx.LMHost.call = async (fn, arg) => { calls.push([fn, arg]); return { path: 'C:/t/preview_' + calls.length + '.png', width: 10, height: 10, ms: 1 }; };
  ctx.LMPanelPreview.setOn(true);
  await ctx.LMPanelPreview.request(false);
  ctx.LMState.combo = { A: 'a1' };
  await ctx.LMPanelPreview.request(false);
  ctx.LMState.combo = {};
  await ctx.LMPanelPreview.request(false);
  assert.equal(calls.filter(c => c[0] === 'renderPreview').length, 2);
  assert.deepEqual(calls[1][1].on, [2]);
  assert.deepEqual(calls[1][1].off, [1]);
  assert.equal(calls[0][1].maxSize, 1024);
});

test('redo-pending error shows the Korean message', async () => {
  const { ctx } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a'])], combos: [], layers: [L(1, null)] });
  ctx.LMHost.call = async () => { throw new Error('renderPreview: LM_REDO_PENDING'); };
  ctx.LMPanelPreview.setOn(true);
  await ctx.LMPanelPreview.request(false);
  assert.match(ctx.LMPanelPreview.paneHtml(), /다시 실행할 단계가 있어/);
});

test('refresh with the same layer structure does not re-render; a structure change does', async () => {
  const { ctx } = loadPanel();
  setupDoc(ctx, { categories: [cat('A', ['a'])], combos: [], layers: [L(1, null)] });
  let n = 0;
  ctx.LMHost.call = async () => ({ path: 'C:/t/p' + (++n) + '.png', width: 1, height: 1, ms: 1 });
  ctx.LMPanelPreview.setOn(true);
  await ctx.LMPanelPreview.onRefresh(true);
  await ctx.LMPanelPreview.onRefresh(false);
  assert.equal(n, 1);
  ctx.LMState.layers = [L(1, null), L(2, null)];
  await ctx.LMPanelPreview.onRefresh(false);
  assert.equal(n, 2);
});
```

`request`와 `onRefresh`는 스케줄러 Promise(또는 캐시 적중 시 resolved Promise)를 돌려준다.

- [ ] **Step 2: 실패 확인** — `npm test`.
- [ ] **Step 3: 구현** — 위 동작 그대로 `client/panel-preview.js`, `layers.js`, `state.js`, `export.js`, `index.html`, `style.css`.
- [ ] **Step 4: 통과 확인** — `npm test`.
- [ ] **Step 5: 커밋** — `panel: 레이어 탭 왼쪽 패널 미리보기 (토글, 끌어서 너비, 캐시, 다시 그리기).`

### Task 6: 문서·버전·설치본

**Files:**
- Modify: `README.md` (spec §8), `package.json`, `CSXS/manifest.xml` (0.4.0, 너비 900)
- Create: `tools/make-dist.sh` (`make-dist.ps1`과 같은 내용의 macOS/Linux 판)
- Test: `test/unit/version.test.js` (package.json·manifest 버전 일치)

- [ ] **Step 1: 실패하는 테스트**

```js
test('package.json and manifest agree on the version', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const man = fs.readFileSync(path.join(root, 'CSXS/manifest.xml'), 'utf8');
  assert.equal(pkg, '0.4.0');
  assert.match(man, new RegExp(`ExtensionBundleVersion="${pkg}"`));
  assert.match(man, new RegExp(`Extension Id="local.layermemorier.panel" Version="${pkg}"`));
  assert.match(man, /<Size><Height>760<\/Height><Width>900<\/Width><\/Size>/);
});
```

- [ ] **Step 2: 실패 확인.**
- [ ] **Step 3:** 버전·너비 수정, README 갱신, `tools/make-dist.sh`:

```sh
#!/bin/sh
# 배포용 zip (make-dist.ps1과 같은 내용). 패널 실행에 필요한 것만 담는다.
set -e
root=$(cd "$(dirname "$0")/.." && pwd)
version=$(node -p "require('$root/package.json').version")
stage=$(mktemp -d)
mkdir -p "$stage/LayerMemorier" "$root/dist"
for i in CSXS client core host install README.md .debug; do
  [ -e "$root/$i" ] || { echo "missing: $i" >&2; exit 1; }
  cp -R "$root/$i" "$stage/LayerMemorier/"
done
zip="$root/dist/LayerMemorier-$version.zip"
rm -f "$zip"
(cd "$stage" && zip -qrX "$zip" LayerMemorier -x '*.DS_Store')
rm -rf "$stage"
echo "$zip ($(( $(wc -c < "$zip") / 1024 )) KB)"
```

- [ ] **Step 4:** `npm test` 전부 PASS, `sh tools/make-dist.sh` → `dist/LayerMemorier-0.4.0.zip`, `unzip -l`로 `LayerMemorier/CSXS/manifest.xml`, `LayerMemorier/client/panel-preview.js`, `LayerMemorier/core/preview-cache.js`, `LayerMemorier/install/install.ps1` 포함 확인.
- [ ] **Step 5: 커밋** — `0.4.0: README 새 표시 규칙·Ctrl+클릭·패널 미리보기, 버전, mac용 make-dist.sh.`
