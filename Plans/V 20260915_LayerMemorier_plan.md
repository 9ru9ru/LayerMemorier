# LayerMemorier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 포토샵 2020용 CEP 패널을 만든다. 레이어에 배리에이션 마크를 붙이고, 모든 조합을 PNG로 자동 내보낸다.

**Architecture:** 패널(HTML/JS, Chromium 63)이 조합·파일명·가시성 판정을 전부 계산하고, ExtendScript 호스트(`host.jsx`)는 레이어 읽기·XMP 저장·가시성 설정·PNG 저장만 실행한다. 순수 로직은 `core/`에 UMD 모듈로 두고 Node로 단위 테스트한다. 호스트와 패널은 포토샵 COM(`DoJavaScript`)과 Chrome DevTools 프로토콜로 에이전트가 직접 검증한다.

**Tech Stack:** CEP 9 (CSInterface.js), ExtendScript ES3 + json2.js, 바닐라 HTML/CSS/JS, Node 22 `node --test`, `pngjs`, `chrome-remote-interface`, PowerShell 5.1 (COM·설치·스크린샷).

**Spec:** `D:\Project\LayerMemorier\Plans\20260915_LayerMemorier_spec.md` — 각 태스크는 spec의 절 번호(§)를 인용한다. 실행자는 spec을 먼저 읽는다.

## Global Constraints

- 포토샵 2020 21.0.2 Windows 전용. CEP 9. UXP·macOS 지원 안 함 (spec §3).
- `host/host.jsx`와 `host/json2.js`는 **ASCII만** 쓴다 (한글 금지). ExtendScript는 BOM 없는 파일을 시스템 코드페이지로 읽어 한글이 깨진다. 한글은 패널 쪽 JS와 데이터(JSON 문자열)에만 둔다.
- `host.jsx`는 ES3다. `let`, `const`, 화살표 함수, `JSON`(json2.js 포함으로 해결), `Array.prototype.forEach/map/filter/indexOf` 사용 금지. `for` 루프만 쓴다.
- 패널 JS는 ES2017까지 사용 가능 (Chromium 63). ES 모듈(`import`) 금지 — `file://`에서 막힌다 (spec §12). `core/*.js`는 UMD 래퍼.
- 패널과 호스트 사이의 모든 데이터는 JSON 문자열 (spec §7). 호스트 함수는 실패 시 `{"error":"..."}`를 돌려준다.
- 문서 데이터 XMP 네임스페이스 `http://layermemorier.local/1.0/`, 접두사 `lm`, 속성 `data` (spec §4.3).
- 배지 색 7종 이름: `red, orange, yellow, green, blue, violet, gray`. 네이티브 enum: `red, orange, yellowColor, grain, blue, violet, gray, none` (spec §4.1, §7).
- 라벨 형식 3종: `{v}`, `{c}{v}`, `{c}_{v}` (spec §4.1).
- 파일명 금지 문자 `\ / : * ? " < > |` → `-` (spec §5.3).
- 출력은 PNG-24 투명, 캔버스 크기. 가로·세로 8192 초과 시 `PNGSaveOptions` 폴백 (spec §7).
- 커밋 메시지는 한국어. 이슈 번호 없음. 기본 브랜치 `main` (spec §12).
- 테스트 산출물은 `test/out/` 아래에만 쓰고 git이 무시한다.
- 사용자 확인 없이 진행한다. 다만 **패널을 포토샵에서 처음 여는 것**(창 ▸ 확장 ▸ LayerMemorier)만은 사람이 한 번 해야 한다 (Task 1 Step 9). 한 번 열어 두면 워크스페이스에 남아 다음부터 자동으로 뜬다.

---

## 파일 구조

```
D:\Project\LayerMemorier\
  .gitignore
  .debug                         DevTools 포트 8092 (Task 1)
  package.json                   scripts: test, test:e2e, panel:shot (Task 1)
  README.md                      설치·사용법 (Task 1 골격, Task 13 완성)
  CSXS\manifest.xml              CEP 9 매니페스트 (Task 1)
  install\install.ps1            PlayerDebugMode + 정션 (Task 1)
  install\uninstall.ps1          정션 제거 (Task 1)
  tools\ps-eval.ps1              COM으로 ExtendScript 실행 (Task 2)
  tools\panel.js                 DevTools 스크린샷·eval CLI (Task 1)
  tools\screenshot.ps1           화면 전체 캡처 (Task 1)
  client\index.html              패널 골격 (Task 1 최소 → Task 10 완성)
  client\style.css               (Task 10)
  client\lib\CSInterface.js      Adobe 제공 (Task 1)
  client\colors.js               배지 색 ↔ 네이티브 enum 표 (Task 10)
  client\host-bridge.js          evalScript 래퍼 + 이벤트 등록 (Task 10)
  client\presets.js              presets.json 읽기/쓰기 (Task 10)
  client\state.js                패널 상태 + 문서 데이터 생성 (Task 10)
  client\ui\categories.js        카테고리 탭 (Task 10)
  client\ui\layers.js            레이어 탭 (Task 11)
  client\ui\export.js            내보내기 탭 (Task 12)
  client\main.js                 부팅·탭·새로고침 (Task 10)
  core\variation.js              §5.1 (Task 3)
  core\visibility.js             §5.2 (Task 4)
  core\naming.js                 §5.3 §5.4 (Task 5)
  core\jobs.js                   §5.5 + 경고 (Task 6)
  host\json2.js                  (Task 2)
  host\host.jsx                  LM.* (Task 2 골격, 7·8·9 확장)
  test\helpers\ps.js             Node → ps-eval.ps1 래퍼 (Task 2)
  test\helpers\panel.js          Node → DevTools 래퍼 (Task 1)
  test\helpers\fixture.js        fixture PSD 생성·열기 (Task 7)
  test\fixture\make-fixture.jsx  fixture 레이어 생성 (Task 7)
  test\fixture\fixture-docdata.json  fixture 문서 데이터 템플릿 (Task 7)
  test\golden\alssagi.txt        알싸기 80개 파일명 (Task 5)
  test\unit\*.test.js            core 단위 테스트 (Task 3~6)
  test\e2e\host.test.js          호스트 API E2E (Task 2, 7, 8)
  test\e2e\export.test.js        내보내기 E2E + 픽셀 검사 (Task 9)
  test\e2e\panel.test.js         패널 UI E2E (Task 10~12)
  test\out\                      git 무시
```

각 파일의 책임은 하나다. 패널 UI 파일은 "그 탭을 그리고 그 탭의 이벤트를 처리"만 한다. 상태 변경은 `LMState`와 `saveDocData()`를 거친다.

---

### Task 1: 저장소 스캐폴드 + 설치 스크립트 + 최소 패널 + DevTools 도구

**Files:**
- Create: `.gitignore`, `package.json`, `README.md`, `.debug`, `CSXS/manifest.xml`, `install/install.ps1`, `install/uninstall.ps1`, `client/index.html`, `client/lib/CSInterface.js`, `tools/panel.js`, `tools/screenshot.ps1`, `test/helpers/panel.js`

**Interfaces:**
- Produces: `test/helpers/panel.js` → `connect(port=8092)` → `{ eval(expr), shot(label), reload(), close() }`. `eval`은 패널 안에서 JS 식을 실행해 값을 돌려준다 (Promise면 기다린다). `shot`은 `test/out/shots/<label>.png` 경로를 돌려준다.
- Produces: 익스텐션 ID `local.layermemorier.panel`.

- [ ] **Step 1: git 저장소와 기본 파일 만들기**

```bash
cd /d/Project/LayerMemorier
git init -b main
mkdir -p CSXS install tools client/lib client/ui core host test/helpers test/fixture test/golden test/unit test/e2e test/out
```

`.gitignore`:

```
node_modules/
test/out/
*.log
```

`package.json`:

```json
{
  "name": "layermemorier",
  "version": "0.1.0",
  "private": true,
  "description": "Photoshop 2020 CEP panel: remember layer variations and export all combinations",
  "scripts": {
    "test": "node --test test/unit/",
    "test:e2e": "node --test test/e2e/",
    "panel:shot": "node tools/panel.js shot",
    "panel:eval": "node tools/panel.js eval"
  },
  "devDependencies": {
    "chrome-remote-interface": "0.34.0",
    "pngjs": "7.0.0"
  }
}
```

```bash
cd /d/Project/LayerMemorier && npm install
```

`README.md` (골격, Task 13에서 완성):

```markdown
# LayerMemorier

포토샵 2020(21.0.2) CEP 패널. 레이어에 배리에이션 마크를 붙이고 모든 조합을 PNG로 내보낸다.

## 설치 (Windows)

1. 이 저장소를 clone 한다.
2. PowerShell에서 `install\install.ps1`을 실행한다 (PlayerDebugMode 레지스트리 + 확장 폴더 정션).
3. 포토샵을 재시작하고 `창 ▸ 확장 ▸ LayerMemorier`를 연다.

## 개발

- `npm test` — core 단위 테스트
- `npm run test:e2e` — 포토샵을 COM으로 띄워 호스트·내보내기·패널 검증 (포토샵 2020 필요)
- `npm run panel:shot <label>` — 열려 있는 패널 스크린샷을 `test/out/shots/<label>.png`로 저장

spec: `Plans/20260915_LayerMemorier_spec.md`
```

- [ ] **Step 2: CSInterface.js 받기**

```bash
cd /d/Project/LayerMemorier && curl -sL "https://raw.githubusercontent.com/Adobe-CEP/CEP-Resources/master/CEP_9.x/CSInterface.js" -o client/lib/CSInterface.js && head -c 300 client/lib/CSInterface.js
```

Expected: 파일 크기 약 42KB, 첫 줄에 Adobe 저작권 주석.

- [ ] **Step 3: manifest.xml과 .debug 쓰기**

`CSXS/manifest.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ExtensionManifest Version="9.0" ExtensionBundleId="local.layermemorier" ExtensionBundleVersion="0.1.0" ExtensionBundleName="LayerMemorier" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <ExtensionList>
    <Extension Id="local.layermemorier.panel" Version="0.1.0"/>
  </ExtensionList>
  <ExecutionEnvironment>
    <HostList>
      <Host Name="PHXS" Version="[21.0,99.9]"/>
      <Host Name="PHSP" Version="[21.0,99.9]"/>
    </HostList>
    <LocaleList>
      <Locale Code="All"/>
    </LocaleList>
    <RequiredRuntimeList>
      <RequiredRuntime Name="CSXS" Version="9.0"/>
    </RequiredRuntimeList>
  </ExecutionEnvironment>
  <DispatchInfoList>
    <Extension Id="local.layermemorier.panel">
      <DispatchInfo>
        <Resources>
          <MainPath>./client/index.html</MainPath>
        </Resources>
        <Lifecycle>
          <AutoVisible>true</AutoVisible>
        </Lifecycle>
        <UI>
          <Type>Panel</Type>
          <Menu>LayerMemorier</Menu>
          <Geometry>
            <Size><Height>640</Height><Width>440</Width></Size>
            <MinSize><Height>300</Height><Width>320</Width></MinSize>
          </Geometry>
        </UI>
      </DispatchInfo>
    </Extension>
  </DispatchInfoList>
</ExtensionManifest>
```

`ScriptPath`는 넣지 않는다. 호스트 스크립트는 패널이 뜰 때 `$.evalFile`로 읽는다 (Task 10). 이렇게 해야 `host.jsx`를 고친 뒤 패널만 닫았다 열면 반영된다.

`.debug`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ExtensionList>
  <Extension Id="local.layermemorier.panel">
    <HostList>
      <Host Name="PHXS" Port="8092"/>
      <Host Name="PHSP" Port="8092"/>
    </HostList>
  </Extension>
</ExtensionList>
```

- [ ] **Step 4: 최소 패널 index.html**

`client/index.html` (Task 10에서 전부 바꾼다. 지금은 툴체인 확인용):

```html
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>LayerMemorier</title>
<style>
  body { margin: 0; padding: 12px; font: 13px sans-serif; background: #323232; color: #ddd; }
</style>
</head>
<body>
<h1 id="title" style="font-size:16px">LayerMemorier</h1>
<div id="info">loading…</div>
<script src="lib/CSInterface.js"></script>
<script>
  var cs = new CSInterface();
  cs.evalScript('app.version + " docs=" + app.documents.length', function (r) {
    document.getElementById('info').textContent = 'Photoshop ' + r;
  });
</script>
</body>
</html>
```

- [ ] **Step 5: 설치 스크립트**

`install/install.ps1`:

```powershell
# LayerMemorier 설치: PlayerDebugMode 레지스트리 + 확장 폴더 정션. 다시 실행해도 안전하다.
$ErrorActionPreference = 'Stop'
$extRoot = Join-Path $env:APPDATA 'Adobe\CEP\extensions'
$link = Join-Path $extRoot 'LayerMemorier'
$src = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

New-Item -ItemType Directory -Force $extRoot | Out-Null

$key = 'HKCU:\SOFTWARE\Adobe\CSXS.9'
if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
Set-ItemProperty -Path $key -Name PlayerDebugMode -Value '1' -Type String

if (Test-Path $link) { cmd /c rmdir "$link" | Out-Null }
cmd /c mklink /J "$link" "$src" | Out-Null

$debug = (Get-ItemProperty $key).PlayerDebugMode
$manifestOk = Test-Path (Join-Path $link 'CSXS\manifest.xml')
Write-Output "PlayerDebugMode=$debug"
Write-Output "junction=$link -> $src"
Write-Output "manifest=$manifestOk"
if ($debug -ne '1' -or -not $manifestOk) { Write-Error 'install failed'; exit 1 }
Write-Output 'OK. Restart Photoshop, then Window > Extensions > LayerMemorier.'
```

`install/uninstall.ps1`:

```powershell
$link = Join-Path $env:APPDATA 'Adobe\CEP\extensions\LayerMemorier'
if (Test-Path $link) { cmd /c rmdir "$link" | Out-Null; Write-Output "removed $link" } else { Write-Output "not installed" }
```

정션 제거는 반드시 `cmd /c rmdir`로 한다. `Remove-Item -Recurse`는 정션을 따라 들어가 원본을 지울 수 있다.

- [ ] **Step 6: 설치 실행과 검증**

```powershell
& D:\Project\LayerMemorier\install\install.ps1
```

Expected:

```
PlayerDebugMode=1
junction=C:\Users\...\AppData\Roaming\Adobe\CEP\extensions\LayerMemorier -> D:\Project\LayerMemorier
manifest=True
OK. Restart Photoshop, then Window > Extensions > LayerMemorier.
```

- [ ] **Step 7: 스크린샷·DevTools 도구**

`tools/screenshot.ps1`:

```powershell
param([string]$Out = "test/out/shots/screen.png")
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$b = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size)
$dir = Split-Path $Out
New-Item -ItemType Directory -Force $dir | Out-Null
$full = Join-Path (Resolve-Path $dir).Path (Split-Path $Out -Leaf)
$bmp.Save($full, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output $full
```

`test/helpers/panel.js`:

```js
'use strict';
const fs = require('fs');
const path = require('path');
const CDP = require('chrome-remote-interface');

const ROOT = path.resolve(__dirname, '..', '..');
const SHOTS = path.join(ROOT, 'test', 'out', 'shots');

async function connect(port = 8092) {
  const targets = await CDP.List({ port });
  const target = targets.find(t => /index\.html/.test(t.url)) || targets[0];
  if (!target) throw new Error('panel target not found on port ' + port + ' (is the panel open in Photoshop?)');
  const client = await CDP({ port, target });
  await client.Page.enable();
  await client.Runtime.enable();
  return {
    async eval(expression) {
      const r = await client.Runtime.evaluate({ expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) {
        const ex = r.exceptionDetails.exception;
        throw new Error('panel eval failed: ' + (ex && ex.description ? ex.description : r.exceptionDetails.text));
      }
      return r.result.value;
    },
    async shot(label) {
      fs.mkdirSync(SHOTS, { recursive: true });
      const { data } = await client.Page.captureScreenshot({ format: 'png' });
      const file = path.join(SHOTS, label + '.png');
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
      return file;
    },
    async reload(waitMs = 1500) {
      await client.Page.reload();
      await new Promise(r => setTimeout(r, waitMs));
    },
    close: () => client.close(),
  };
}

module.exports = { connect, SHOTS };
```

`tools/panel.js`:

```js
'use strict';
// 사용법: node tools/panel.js shot <label> | node tools/panel.js eval "<js>" | node tools/panel.js reload
const { connect } = require('../test/helpers/panel');

(async () => {
  const [cmd, arg] = process.argv.slice(2);
  const p = await connect();
  try {
    if (cmd === 'shot') console.log(await p.shot(arg || 'panel'));
    else if (cmd === 'eval') console.log(JSON.stringify(await p.eval(arg), null, 2));
    else if (cmd === 'reload') { await p.reload(); console.log('reloaded'); }
    else console.log('usage: shot <label> | eval "<js>" | reload');
  } finally {
    p.close();
  }
})().catch(e => { console.error(e.message); process.exit(1); });
```

- [ ] **Step 8: 포토샵 재시작**

PlayerDebugMode는 포토샵을 다시 켜야 적용된다. `Stop-Process`는 저장 안 한 문서를 묻지 않고 버린다. 먼저 `Get-Process Photoshop`으로 떠 있는지 보고, 떠 있으면 COM으로 `app.documents.length`가 0인지 확인한 뒤 종료한다. 열린 문서가 있으면 사용자에게 알린다.

```powershell
$ps = New-Object -ComObject Photoshop.Application
$ps.DoJavaScript('app.documents.length')   # 0 이어야 한다
Get-Process Photoshop -ErrorAction SilentlyContinue | Stop-Process
Start-Sleep 3
$ps = New-Object -ComObject Photoshop.Application
$ps.DoJavaScript('app.version')
```

Expected: `21.0.2`. 포토샵 창이 떠 있다.

- [ ] **Step 9: 패널 처음 열기 (사람이 한 번)**

사용자에게 요청: 포토샵 메뉴 `창(Window) ▸ 확장(Extensions) ▸ LayerMemorier`를 한 번 클릭해 달라고 한다. 메뉴에 항목이 없으면 `install.ps1` 출력과 `%APPDATA%\Adobe\CEP\extensions\LayerMemorier\CSXS\manifest.xml` 존재를 다시 확인한다.

열린 뒤 확인:

```bash
cd /d/Project/LayerMemorier && node tools/panel.js eval "document.getElementById('info').textContent"
```

Expected: `"Photoshop 21.0.2 docs=0"` (문서 수는 다를 수 있다). 이 출력이 나오면 CEP 로드·evalScript·DevTools 연결이 모두 동작하는 것이다.

```bash
node tools/panel.js shot task1-hello
```

스크린샷 `test/out/shots/task1-hello.png`를 Read로 열어 "LayerMemorier" 제목과 버전 문구가 보이는지 확인한다.

DevTools 연결이 실패하면(`connect ECONNREFUSED`): `.debug` 파일 위치가 저장소 루트인지, 포토샵을 재시작했는지 확인. 그래도 안 되면 `tools/screenshot.ps1`로 화면을 찍어 패널이 떠 있는지 본다.

- [ ] **Step 10: 커밋**

```bash
cd /d/Project/LayerMemorier
git add -A
git commit -m "저장소 스캐폴드, CEP 매니페스트, 설치 스크립트, DevTools 도구를 만든다."
```

---

### Task 2: COM 하네스 + host.jsx 골격 + 호스트 E2E 테스트 틀

**Files:**
- Create: `tools/ps-eval.ps1`, `host/json2.js`, `host/host.jsx`, `test/helpers/ps.js`, `test/e2e/host.test.js`

**Interfaces:**
- Produces: `test/helpers/ps.js` → `psRun(code, {host=true})` (jsx 코드를 실행해 마지막 식의 문자열을 돌려줌), `psCall(fn, arg)` (`LM.<fn>` 호출 + JSON 파싱, `{error}`면 throw).
- Produces: `host.jsx` 전역 `LM`, 내부 헬퍼 `cid`, `sid`, `wrap`, `hasDoc`, `hasBackground`. `LM.ping()` → `{pong:true, version}`, `LM.getDocInfo()` → `{name, path, width, height, saved}` 또는 `null`, `LM.eventIds()` → `{select, make, del, show, hide, move, docActivate, close}` (숫자).

- [ ] **Step 1: json2.js 받기**

```bash
cd /d/Project/LayerMemorier && curl -sL "https://raw.githubusercontent.com/douglascrockford/JSON-js/master/json2.js" -o host/json2.js && grep -c "JSON.parse" host/json2.js
```

Expected: 1 이상. 파일은 ASCII다.

- [ ] **Step 2: host.jsx 골격**

`host/host.jsx`:

```js
// LayerMemorier host script (ExtendScript, ES3, ASCII only).
// Every LM.* function takes a JSON string (or nothing) and returns a JSON string.
//@include "json2.js"

var LM = LM || {};

(function () {
  function cid(s) { return app.charIDToTypeID(s); }
  function sid(s) { return app.stringIDToTypeID(s); }

  function fail(e) {
    var msg = (e && e.message) ? e.message : String(e);
    if (e && e.line) msg += ' (line ' + e.line + ')';
    return JSON.stringify({ error: msg });
  }

  // wrap(fn): parse JSON arg, call fn, stringify result. Strings are returned as-is.
  function wrap(fn) {
    return function (json) {
      try {
        var arg = (json === undefined || json === null || json === '') ? undefined : JSON.parse(json);
        var r = fn(arg);
        if (typeof r === 'string') return r;
        return JSON.stringify(r === undefined ? null : r);
      } catch (e) {
        return fail(e);
      }
    };
  }

  function hasDoc() { return app.documents.length > 0; }
  function hasBackground() {
    try { return app.activeDocument.backgroundLayer != null; } catch (e) { return false; }
  }

  LM._cid = cid;
  LM._sid = sid;
  LM._wrap = wrap;
  LM._hasDoc = hasDoc;
  LM._hasBackground = hasBackground;

  LM.ping = wrap(function () {
    return { pong: true, version: app.version };
  });

  LM.getDocInfo = wrap(function () {
    if (!hasDoc()) return null;
    var d = app.activeDocument;
    var p = null;
    try { p = d.fullName.fsName; } catch (e) { p = null; }
    return {
      name: d.name,
      path: p,
      width: d.width.as('px'),
      height: d.height.as('px'),
      saved: d.saved
    };
  });

  LM.eventIds = wrap(function () {
    return {
      select: cid('slct'),
      make: cid('Mk  '),
      del: cid('Dlt '),
      show: cid('Shw '),
      hide: cid('Hd  '),
      move: cid('move'),
      docActivate: sid('documentAfterActivate'),
      close: cid('Cls ')
    };
  });
})();

'LM loaded';
```

마지막 줄 `'LM loaded';`는 `$.evalFile`의 반환값이다. 호스트 로드 확인에 쓴다.

- [ ] **Step 3: ps-eval.ps1**

`tools/ps-eval.ps1`:

```powershell
# 포토샵 COM으로 ExtendScript를 실행하고 마지막 식의 값을 stdout에 쓴다.
# -ScriptFile <jsx>  : 실행할 파일 (UTF-8 BOM 권장)
# -Code <string>     : 인라인 코드 (ASCII만)
# -NoHost            : host/host.jsx 를 미리 읽지 않는다
param(
  [string]$ScriptFile,
  [string]$Code,
  [switch]$NoHost
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$root = ((Resolve-Path (Join-Path $PSScriptRoot '..')).Path) -replace '\\', '/'
$parts = @()
if (-not $NoHost) { $parts += ('$.evalFile(File("' + $root + '/host/host.jsx"));') }
if ($ScriptFile) { $parts += ('$.evalFile(File("' + ((Resolve-Path $ScriptFile).Path -replace '\\', '/') + '"));') }
if ($Code) { $parts += $Code }
$script = $parts -join "`n"
$ps = New-Object -ComObject Photoshop.Application
$result = $ps.DoJavaScript($script)
if ($null -ne $result) { Write-Output ([string]$result) }
```

- [ ] **Step 4: Node 래퍼**

`test/helpers/ps.js`:

```js
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
```

- [ ] **Step 5: 실패하는 E2E 테스트**

`test/e2e/host.test.js`:

```js
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
```

- [ ] **Step 6: 실행**

```bash
cd /d/Project/LayerMemorier && node --test test/e2e/host.test.js
```

Expected: 3개 PASS. 포토샵이 꺼져 있으면 첫 호출이 포토샵을 띄우느라 20초쯤 걸린다.

실패 유형과 원인:
- `non-JSON result: EvalScript error` 또는 `Error: ... (line N)`: host.jsx 문법 오류. ES3 위반(`const`, 화살표)을 찾는다.
- PowerShell이 `Photoshop.Application` COM을 못 만듦: 포토샵 설치 확인.

- [ ] **Step 7: 커밋**

```bash
git add -A && git commit -m "COM 하네스와 host.jsx 골격, 호스트 E2E 테스트 틀을 만든다."
```

---

### Task 3: core/variation.js — 배리에이션 열거 (spec §5.1)

**Files:**
- Create: `core/variation.js`, `test/unit/variation.test.js`

**Interfaces:**
- Produces: `LMCore.variation.enumerate(categories, options)` → `Array<{[categoryId]: valueId}>`. `options = { excluded?: Array<{[categoryId]: valueId}>, include?: {[categoryId]: valueId[]} }`.
- Produces: `LMCore.variation.isExcluded(variation, excluded)` → boolean.
- 카테고리 형태는 spec §4.1: `{id, name, color, labelFormat, folder, values:[{id,name,label}]}`.

- [ ] **Step 1: 실패하는 테스트**

`test/unit/variation.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { enumerate, isExcluded } = require('../../core/variation');

function cat(id, valueIds) {
  return { id, name: id, color: 'red', labelFormat: '{v}', folder: false, values: valueIds.map(v => ({ id: v, name: v, label: v })) };
}

test('cartesian product, last category changes fastest', () => {
  const cats = [cat('A', ['a0', 'a1']), cat('B', ['b0', 'b1', 'b2'])];
  const out = enumerate(cats);
  assert.deepEqual(out, [
    { A: 'a0', B: 'b0' }, { A: 'a0', B: 'b1' }, { A: 'a0', B: 'b2' },
    { A: 'a1', B: 'b0' }, { A: 'a1', B: 'b1' }, { A: 'a1', B: 'b2' },
  ]);
});

test('no categories yields one empty variation', () => {
  assert.deepEqual(enumerate([]), [{}]);
});

test('a category with zero values yields nothing', () => {
  assert.deepEqual(enumerate([cat('A', ['a0']), cat('B', [])]), []);
});

test('excluded partial combos are removed', () => {
  const cats = [cat('A', ['a0', 'a1']), cat('B', ['b0', 'b1'])];
  const out = enumerate(cats, { excluded: [{ A: 'a1', B: 'b0' }, { B: 'b1' }] });
  assert.deepEqual(out, [{ A: 'a0', B: 'b0' }]);
});

test('include filter restricts values per category', () => {
  const cats = [cat('A', ['a0', 'a1']), cat('B', ['b0', 'b1', 'b2'])];
  const out = enumerate(cats, { include: { B: ['b2', 'b0'] } });
  assert.deepEqual(out, [
    { A: 'a0', B: 'b0' }, { A: 'a0', B: 'b2' },
    { A: 'a1', B: 'b0' }, { A: 'a1', B: 'b2' },
  ]);
});

test('include with unknown value ids is ignored, empty include list means none', () => {
  const cats = [cat('A', ['a0', 'a1'])];
  assert.deepEqual(enumerate(cats, { include: { A: ['zzz', 'a1'] } }), [{ A: 'a1' }]);
  assert.deepEqual(enumerate(cats, { include: { A: [] } }), []);
});

test('isExcluded matches only when every pair matches', () => {
  assert.equal(isExcluded({ A: 'a1', B: 'b0' }, [{ A: 'a1', B: 'b0' }]), true);
  assert.equal(isExcluded({ A: 'a1', B: 'b1' }, [{ A: 'a1', B: 'b0' }]), false);
  assert.equal(isExcluded({ A: 'a1', B: 'b1' }, [{ A: 'a1' }]), true);
  assert.equal(isExcluded({ A: 'a1' }, [{}]), false);
  assert.equal(isExcluded({ A: 'a1' }, []), false);
});
```

- [ ] **Step 2: 실패 확인**

```bash
cd /d/Project/LayerMemorier && node --test test/unit/variation.test.js
```

Expected: `Cannot find module '../../core/variation'`.

- [ ] **Step 3: 구현**

`core/variation.js`:

```js
// spec §5.1 배리에이션 열거. UMD: 브라우저는 LMCore.variation, Node는 module.exports.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.LMCore = root.LMCore || {}; root.LMCore.variation = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 제외 항목의 모든 (카테고리→값) 쌍이 배리에이션과 일치하면 제외. 빈 항목 {}는 아무것도 제외하지 않는다.
  function isExcluded(variation, excluded) {
    if (!excluded || !excluded.length) return false;
    return excluded.some(entry => {
      const keys = Object.keys(entry);
      return keys.length > 0 && keys.every(k => variation[k] === entry[k]);
    });
  }

  function valueIdsFor(category, include) {
    const all = category.values.map(v => v.id);
    if (!include || !Object.prototype.hasOwnProperty.call(include, category.id)) return all;
    const allowed = new Set(include[category.id]);
    return all.filter(id => allowed.has(id));
  }

  function enumerate(categories, options) {
    options = options || {};
    let acc = [{}];
    for (const category of categories) {
      const ids = valueIdsFor(category, options.include);
      const next = [];
      for (const partial of acc) {
        for (const id of ids) next.push(Object.assign({}, partial, { [category.id]: id }));
      }
      acc = next;
      if (!acc.length) return [];
    }
    return acc.filter(v => !isExcluded(v, options.excluded));
  }

  return { enumerate, isExcluded };
});
```

- [ ] **Step 4: 통과 확인**

```bash
node --test test/unit/variation.test.js
```

Expected: 7 PASS.

- [ ] **Step 5: 커밋**

```bash
git add core/variation.js test/unit/variation.test.js && git commit -m "core: 배리에이션 열거(데카르트 곱·제외·부분 포함)를 구현한다."
```

---

### Task 4: core/visibility.js — 레이어 가시성 판정 (spec §5.2)

**Files:**
- Create: `core/visibility.js`, `test/unit/visibility.test.js`

**Interfaces:**
- Produces: `LMCore.visibility.judge(mark, variation, categories)` → `true | false | null`. `mark = {[categoryId]: valueId[]}`. `categories`는 배열 (현재 문서의 카테고리 목록).
- Produces: `LMCore.visibility.markIssues(mark, categories)` → `Array<{categoryId, valueId|null}>` — 마크가 참조하는데 없는 카테고리(`valueId: null`)·값 목록.

- [ ] **Step 1: 실패하는 테스트**

`test/unit/visibility.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { judge, markIssues } = require('../../core/visibility');

function cat(id, valueIds) {
  return { id, name: id, color: 'red', labelFormat: '{v}', folder: false, values: valueIds.map(v => ({ id: v, name: v, label: v })) };
}
const cats = [cat('A', ['a0', 'a1']), cat('B', ['b0', 'b1'])];

test('empty mark is null (untouched)', () => {
  assert.equal(judge({}, { A: 'a0', B: 'b0' }, cats), null);
  assert.equal(judge(undefined, { A: 'a0', B: 'b0' }, cats), null);
});

test('all marked categories must contain the variation value', () => {
  const mark = { A: ['a0'], B: ['b0', 'b1'] };
  assert.equal(judge(mark, { A: 'a0', B: 'b1' }, cats), true);
  assert.equal(judge(mark, { A: 'a1', B: 'b1' }, cats), false);
});

test('single category mark ignores other categories', () => {
  assert.equal(judge({ B: ['b1'] }, { A: 'a1', B: 'b1' }, cats), true);
  assert.equal(judge({ B: ['b1'] }, { A: 'a1', B: 'b0' }, cats), false);
});

test('mark referencing a missing category is ignored; only missing -> null', () => {
  assert.equal(judge({ Z: ['z0'], A: ['a1'] }, { A: 'a1', B: 'b0' }, cats), true);
  assert.equal(judge({ Z: ['z0'] }, { A: 'a1', B: 'b0' }, cats), null);
});

test('unknown value ids count as not present', () => {
  assert.equal(judge({ A: ['zzz'] }, { A: 'a0', B: 'b0' }, cats), false);
  assert.equal(judge({ A: ['zzz', 'a0'] }, { A: 'a0', B: 'b0' }, cats), true);
});

test('markIssues lists stale categories and values', () => {
  assert.deepEqual(markIssues({ Z: ['z0'], A: ['a0', 'nope'] }, cats), [
    { categoryId: 'Z', valueId: null },
    { categoryId: 'A', valueId: 'nope' },
  ]);
  assert.deepEqual(markIssues({ A: ['a0'] }, cats), []);
});
```

- [ ] **Step 2: 실패 확인**

```bash
node --test test/unit/visibility.test.js
```

Expected: `Cannot find module`.

- [ ] **Step 3: 구현**

`core/visibility.js`:

```js
// spec §5.2 레이어 가시성 판정.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.LMCore = root.LMCore || {}; root.LMCore.visibility = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function byId(categories) {
    const map = new Map();
    for (const c of categories) map.set(c.id, new Set(c.values.map(v => v.id)));
    return map;
  }

  // true: 켜야 함, false: 꺼야 함, null: 건드리지 않음
  function judge(mark, variation, categories) {
    if (!mark) return null;
    const known = byId(categories);
    let considered = 0;
    for (const categoryId of Object.keys(mark)) {
      const valid = known.get(categoryId);
      if (!valid) continue; // 없는 카테고리는 무시
      considered++;
      const allowed = (mark[categoryId] || []).filter(id => valid.has(id));
      if (allowed.indexOf(variation[categoryId]) === -1) return false;
    }
    return considered === 0 ? null : true;
  }

  function markIssues(mark, categories) {
    const known = byId(categories);
    const issues = [];
    for (const categoryId of Object.keys(mark || {})) {
      const valid = known.get(categoryId);
      if (!valid) { issues.push({ categoryId, valueId: null }); continue; }
      for (const valueId of mark[categoryId] || []) {
        if (!valid.has(valueId)) issues.push({ categoryId, valueId });
      }
    }
    return issues;
  }

  return { judge, markIssues };
});
```

- [ ] **Step 4: 통과 확인**

```bash
node --test test/unit/visibility.test.js
```

Expected: 6 PASS.

- [ ] **Step 5: 커밋**

```bash
git add core/visibility.js test/unit/visibility.test.js && git commit -m "core: 마크 기반 가시성 판정을 구현한다."
```

---

### Task 5: core/naming.js — 파일명·폴더 + 알싸기 골든 테스트 (spec §5.3, §5.4)

**Files:**
- Create: `core/naming.js`, `test/unit/naming.test.js`, `test/golden/alssagi.txt`

**Interfaces:**
- Produces: `LMCore.naming.sanitize(s)`, `LMCore.naming.token(category, value)` → string (빈 문자열이면 생략 대상), `LMCore.naming.relativePath(doc, variation)` → `"폴더/…/파일.png"` (구분자는 `/`). `doc = {baseName, delimiter, categories}`.

- [ ] **Step 1: 골든 파일 만들기**

```bash
cd "/d/Project/mezzakuzza/Assets/Content/Character/Psykhe/PoseResource/알싸기/0_알싸기" && ls | grep '\.png$' | grep -v '\.meta$' > /d/Project/LayerMemorier/test/golden/alssagi.txt && wc -l /d/Project/LayerMemorier/test/golden/alssagi.txt
```

Expected: `80`. 첫 줄 `알싸기_기본의상_옷0_가슴0_보태배0_1.png`, 마지막 줄 `알싸기_기본의상_옷3_가슴1_보태배1_5.png`.

- [ ] **Step 2: 실패하는 테스트**

`test/unit/naming.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { sanitize, token, relativePath } = require('../../core/naming');
const { enumerate } = require('../../core/variation');

function cat(id, name, valueNames, labelFormat = '{v}', folder = false) {
  return { id, name, color: 'red', labelFormat, folder, values: valueNames.map(v => ({ id: id + ':' + v, name: v, label: v })) };
}

test('sanitize replaces forbidden characters and trims', () => {
  assert.equal(sanitize(' a\\b/c:d*e?f"g<h>i|j '), 'a-b-c-d-e-f-g-h-i-j');
});

test('token follows labelFormat and empty label yields empty token', () => {
  const c = cat('c', '옷', ['1']);
  assert.equal(token(c, c.values[0]), '1');
  assert.equal(token(Object.assign({}, c, { labelFormat: '{c}{v}' }), c.values[0]), '옷1');
  assert.equal(token(Object.assign({}, c, { labelFormat: '{c}_{v}' }), c.values[0]), '옷_1');
  const empty = { id: 'x', name: '기본', label: '' };
  assert.equal(token(Object.assign({}, c, { labelFormat: '{c}{v}' }), empty), '');
});

test('relativePath without folders is flat', () => {
  const doc = { baseName: 'fx', delimiter: '_', categories: [cat('A', 'A', ['0', '1'], '{c}{v}'), cat('B', 'B', ['x'])] };
  assert.equal(relativePath(doc, { A: 'A:1', B: 'B:x' }), 'fx_A1_x.png');
});

test('empty label drops the token and its delimiter', () => {
  const base = cat('S', '상태', ['기본', '보테'], '{v}');
  base.values[0].label = '';
  const doc = { baseName: '누드', delimiter: '', categories: [base] };
  assert.equal(relativePath(doc, { S: 'S:기본' }), '누드.png');
  assert.equal(relativePath(doc, { S: 'S:보테' }), '누드보테.png');
});

test('folder categories nest in category order', () => {
  const doc = {
    baseName: '알싸기', delimiter: '_',
    categories: [
      cat('의상', '의상', ['기본의상']),
      cat('옷', '옷', ['0', '1'], '{c}{v}', true),
      cat('가슴', '가슴', ['0'], '{c}{v}'),
      cat('프레임', '프레임', ['3'], '{v}', true),
    ],
  };
  assert.equal(
    relativePath(doc, { '의상': '의상:기본의상', '옷': '옷:1', '가슴': '가슴:0', '프레임': '프레임:3' }),
    '알싸기_기본의상_옷1/알싸기_기본의상_옷1_가슴0_3/알싸기_기본의상_옷1_가슴0_3.png'
  );
});

test('no categories yields baseName only', () => {
  assert.equal(relativePath({ baseName: 'solo', delimiter: '_', categories: [] }, {}), 'solo.png');
});

test('golden: 알싸기 80 file names', () => {
  const golden = fs.readFileSync(path.join(__dirname, '..', 'golden', 'alssagi.txt'), 'utf8').trim().split(/\r?\n/);
  const doc = {
    baseName: '알싸기', delimiter: '_',
    categories: [
      cat('의상', '의상', ['기본의상']),
      cat('옷', '옷', ['0', '1', '2', '3'], '{c}{v}'),
      cat('가슴', '가슴', ['0', '1'], '{c}{v}'),
      cat('보태배', '보태배', ['0', '1'], '{c}{v}'),
      cat('프레임', '프레임', ['1', '2', '3', '4', '5']),
    ],
  };
  const names = enumerate(doc.categories).map(v => relativePath(doc, v));
  assert.equal(names.length, 80);
  assert.deepEqual(names, golden);
});
```

- [ ] **Step 3: 실패 확인**

```bash
node --test test/unit/naming.test.js
```

Expected: `Cannot find module '../../core/naming'`.

- [ ] **Step 4: 구현**

`core/naming.js`:

```js
// spec §5.3 파일명, §5.4 폴더.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.LMCore = root.LMCore || {}; root.LMCore.naming = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
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
    const base = sanitize(doc.baseName);
    const delimiter = doc.delimiter == null ? '_' : doc.delimiter;
    const tokens = [];
    const folders = [];
    for (const category of doc.categories) {
      const value = category.values.find(v => v.id === variation[category.id]);
      tokens.push(value ? token(category, value) : '');
      if (category.folder) folders.push(join([base].concat(tokens), delimiter));
    }
    const file = join([base].concat(tokens), delimiter) + '.png';
    return folders.concat([file]).join('/');
  }

  return { sanitize, token, relativePath };
});
```

- [ ] **Step 5: 통과 확인**

```bash
node --test test/unit/naming.test.js
```

Expected: 7 PASS (골든 포함).

- [ ] **Step 6: 커밋**

```bash
git add core/naming.js test/unit/naming.test.js test/golden/alssagi.txt && git commit -m "core: 파일명·폴더 규칙과 알싸기 골든 테스트를 추가한다."
```

---

### Task 6: core/jobs.js — 내보내기 작업 목록과 경고 (spec §5.5, §9)

**Files:**
- Create: `core/jobs.js`, `test/unit/jobs.test.js`

**Interfaces:**
- Consumes: `visibility.judge`, `visibility.markIssues`, `naming.relativePath`.
- Produces: `LMCore.jobs.buildJobs(docData, layers, variations)` → `{ jobs: Array<{on:number[], off:number[], relativePath}>, conflicts: string[], warnings: Array<{type:'orphan'|'stale'|'parentHidden', layerId:number, detail?}> }`.
- Produces: `LMCore.jobs.orphanMarkIds(marks, layers)` → `number[]`.
- Produces: `LMCore.jobs.markedLayerIds(marks, layers)` → `number[]` (문서에 존재하는 마크 레이어 id, `exportBegin`에 넘긴다).
- `layers`는 호스트 `getLayers` 출력: `[{id, name, kind, visible, depth, parentId, color}]`. `marks`의 키는 문자열이지만 `layers[].id`는 숫자다. 비교는 `String()`으로 맞춘다.

- [ ] **Step 1: 실패하는 테스트**

`test/unit/jobs.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildJobs, orphanMarkIds, markedLayerIds } = require('../../core/jobs');
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
function doc(marks, extra) {
  return Object.assign({ baseName: 'fx', delimiter: '_', categories, marks, excluded: [] }, extra);
}

test('jobs contain only marked layers, split into on/off per variation', () => {
  const d = doc({ '20': { A: ['a0'] }, '21': { A: ['a1'], B: ['b1'] } });
  const { jobs, conflicts, warnings } = buildJobs(d, layers, enumerate(categories));
  assert.equal(conflicts.length, 0);
  assert.equal(warnings.length, 0);
  assert.deepEqual(jobs.map(j => j.relativePath), ['fx_A0_B0.png', 'fx_A0_B1.png', 'fx_A1_B0.png', 'fx_A1_B1.png']);
  assert.deepEqual(jobs[0], { on: [20], off: [21], relativePath: 'fx_A0_B0.png' });
  assert.deepEqual(jobs[3], { on: [21], off: [20], relativePath: 'fx_A1_B1.png' });
});

test('duplicate relative paths are reported as conflicts', () => {
  const cats = [cat('A', ['a0', 'a1'])];
  cats[0].values[1].label = '0';
  const d = { baseName: 'fx', delimiter: '_', categories: cats, marks: {}, excluded: [] };
  const { jobs, conflicts } = buildJobs(d, layers, enumerate(cats));
  assert.equal(jobs.length, 2);
  assert.deepEqual(conflicts, ['fx_A0.png']);
});

test('orphan marks (layer id not in document) produce warnings and are skipped', () => {
  const d = doc({ '999': { A: ['a0'] }, '20': { A: ['a0'] } });
  const { jobs, warnings } = buildJobs(d, layers, enumerate(categories));
  assert.deepEqual(warnings, [{ type: 'orphan', layerId: 999 }]);
  assert.deepEqual(jobs[0].on, [20]);
  assert.deepEqual(orphanMarkIds(d.marks, layers), [999]);
});

test('stale category/value references produce warnings', () => {
  const d = doc({ '20': { Z: ['z0'], A: ['a0', 'gone'] } });
  const { warnings } = buildJobs(d, layers, enumerate(categories));
  assert.deepEqual(warnings, [
    { type: 'stale', layerId: 20, detail: { categoryId: 'Z', valueId: null } },
    { type: 'stale', layerId: 20, detail: { categoryId: 'A', valueId: 'gone' } },
  ]);
});

test('marked layer under an unmarked hidden group warns parentHidden', () => {
  const d = doc({ '11': { A: ['a0'] } });
  const { warnings } = buildJobs(d, layers, enumerate(categories));
  assert.deepEqual(warnings, [{ type: 'parentHidden', layerId: 11, detail: { groupId: 10 } }]);
});

test('marked hidden group does not warn for children', () => {
  const d = doc({ '10': { A: ['a1'] }, '11': { B: ['b0'] } });
  const { warnings, jobs } = buildJobs(d, layers, enumerate(categories));
  assert.equal(warnings.length, 0);
  // {A:a0,B:b0}: G(A=a1) 꺼짐, inG(B=b0) 켜짐 — 부모가 꺼져 있어도 판정은 각자 한다 (포토샵이 자식을 가린다)
  assert.deepEqual(jobs[0], { on: [11], off: [10], relativePath: 'fx_A0_B0.png' });
  assert.deepEqual(jobs[2], { on: [10, 11], off: [], relativePath: 'fx_A1_B0.png' });
});

test('markedLayerIds returns existing marked ids as numbers', () => {
  assert.deepEqual(markedLayerIds({ '20': { A: ['a0'] }, '999': { A: ['a0'] }, '11': {} }, layers), [11, 20]);
});
```

- [ ] **Step 2: 실패 확인**

```bash
node --test test/unit/jobs.test.js
```

Expected: `Cannot find module`.

- [ ] **Step 3: 구현**

`core/jobs.js`:

```js
// spec §5.5 내보내기 작업 목록 + §9 경고.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./visibility'), require('./naming'));
  } else {
    root.LMCore = root.LMCore || {};
    root.LMCore.jobs = factory(root.LMCore.visibility, root.LMCore.naming);
  }
})(typeof self !== 'undefined' ? self : this, function (visibility, naming) {
  'use strict';

  function layerMap(layers) {
    const map = new Map();
    for (const l of layers) map.set(String(l.id), l);
    return map;
  }

  function markedLayerIds(marks, layers) {
    const existing = layerMap(layers);
    return Object.keys(marks || {}).filter(id => existing.has(id)).map(Number).sort((a, b) => a - b);
  }

  function orphanMarkIds(marks, layers) {
    const existing = layerMap(layers);
    return Object.keys(marks || {}).filter(id => !existing.has(id)).map(Number).sort((a, b) => a - b);
  }

  // 마크 없는 조상 그룹 중 꺼진 것이 있으면 그 그룹 id, 없으면 null.
  function hiddenUnmarkedAncestor(layer, byId, marks) {
    let parentId = layer.parentId;
    while (parentId != null) {
      const parent = byId.get(String(parentId));
      if (!parent) return null;
      const parentMarked = marks[String(parent.id)] && Object.keys(marks[String(parent.id)]).length > 0;
      if (!parentMarked && !parent.visible) return parent.id;
      parentId = parent.parentId;
    }
    return null;
  }

  function buildJobs(docData, layers, variations) {
    const marks = docData.marks || {};
    const byId = layerMap(layers);
    const warnings = [];
    const marked = [];

    for (const key of Object.keys(marks)) {
      const layer = byId.get(key);
      if (!layer) { warnings.push({ type: 'orphan', layerId: Number(key) }); continue; }
      const mark = marks[key];
      if (!mark || Object.keys(mark).length === 0) continue;
      for (const issue of visibility.markIssues(mark, docData.categories)) {
        warnings.push({ type: 'stale', layerId: layer.id, detail: issue });
      }
      const hiddenGroup = hiddenUnmarkedAncestor(layer, byId, marks);
      if (hiddenGroup != null) warnings.push({ type: 'parentHidden', layerId: layer.id, detail: { groupId: hiddenGroup } });
      marked.push({ layer, mark });
    }
    marked.sort((a, b) => a.layer.id - b.layer.id);

    const seen = new Map();
    const conflicts = [];
    const jobs = variations.map(variation => {
      const on = [], off = [];
      for (const { layer, mark } of marked) {
        const v = visibility.judge(mark, variation, docData.categories);
        if (v === true) on.push(layer.id);
        else if (v === false) off.push(layer.id);
      }
      const relativePath = naming.relativePath(docData, variation);
      const count = (seen.get(relativePath) || 0) + 1;
      seen.set(relativePath, count);
      if (count === 2) conflicts.push(relativePath);
      return { on, off, relativePath };
    });

    return { jobs, conflicts, warnings };
  }

  return { buildJobs, orphanMarkIds, markedLayerIds };
});
```

- [ ] **Step 4: 통과 확인**

```bash
node --test test/unit/
```

Expected: variation 7 + visibility 6 + naming 7 + jobs 7 = 27 PASS.

- [ ] **Step 5: 커밋**

```bash
git add core/jobs.js test/unit/jobs.test.js && git commit -m "core: 내보내기 작업 목록·충돌·경고 계산을 구현한다."
```

---

### Task 7: 호스트 레이어 API + fixture PSD 생성 (spec §7 getLayers/getSelectedLayerIds/selectLayers/setLayerColor)

**Files:**
- Modify: `host/host.jsx` (IIFE 안, `LM.eventIds` 뒤에 추가)
- Create: `test/fixture/make-fixture.jsx`, `test/fixture/fixture-docdata.json`, `test/helpers/fixture.js`
- Modify: `test/e2e/host.test.js` (테스트 추가)

**Interfaces:**
- Produces (host): `LM.getLayers()` → `[{id, name, kind:'layer'|'group', visible, depth, parentId, color}]` 위→아래. `LM.getSelectedLayerIds()` → `number[]`. `LM.selectLayers([ids])` → `{ok}`. `LM.setLayerColor({id, color})` → `{ok}` (`color`는 네이티브 enum 문자열).
- Produces (helper): `buildFixture()` → `{ psdPath, layers, byName: {name: id} }` — fixture PSD를 만들고 `test/out/fixture.psd`로 저장한 뒤 열어 둔다. `reopenFixture()` → 모든 문서를 닫고 fixture를 다시 연다. `docDataFor(byName)` → 템플릿의 이름 키를 layerId로 바꾼 문서 데이터.
- fixture 캔버스 240×160, 40px 격자 6×4. 셀 좌표와 레이어 (템플릿 `fixture-docdata.json`과 같아야 한다):

| 레이어 | 셀(col,row) | 색 RGB | 마크 |
|---|---|---|---|
| A0 | 0,0 | 255,0,0 | A=a0 |
| A1 | 1,0 | 0,255,0 | A=a1 |
| B0 | 2,0 | 0,0,255 | B=b0 |
| B1 | 3,0 | 255,255,0 | B=b1 |
| B2 | 4,0 | 0,255,255 | B=b2 |
| N1 | 5,0 | 255,0,255 | N=n1 |
| N2 | 0,1 | 128,128,128 | N=n2 |
| G (그룹) | — | — | A=a1 |
| G/GA | 1,1 | 255,128,0 | B=b0 |
| G/GB | 2,1 | 128,0,255 | 없음 (그룹 따라감) |
| H (꺼짐) | 3,1 | 0,0,0 | 없음 |
| BG | 4,1 | 255,255,255 | 없음 (항상 켜짐) |

- [ ] **Step 1: 실패하는 E2E 테스트 추가**

`test/e2e/host.test.js`에 추가:

```js
const { buildFixture } = require('../helpers/fixture');

test('getLayers returns tree in top-down order with ids and groups', () => {
  const { layers, byName } = buildFixture();
  assert.deepEqual(layers.map(l => l.name), ['A0', 'A1', 'B0', 'B1', 'B2', 'N1', 'N2', 'G', 'GA', 'GB', 'H', 'BG']);
  const g = layers.find(l => l.name === 'G');
  assert.equal(g.kind, 'group');
  assert.equal(layers.find(l => l.name === 'GA').parentId, g.id);
  assert.equal(layers.find(l => l.name === 'GA').depth, 1);
  assert.equal(layers.find(l => l.name === 'H').visible, false);
  assert.equal(layers.find(l => l.name === 'BG').visible, true);
  assert.equal(typeof byName.A0, 'number');
  for (const l of layers) assert.equal(l.color, 'none');
});

test('selectLayers / getSelectedLayerIds round-trip (multi-select)', () => {
  const { byName } = buildFixture();
  psCall('selectLayers', [byName.B1, byName.GA]);
  assert.deepEqual(psCall('getSelectedLayerIds').sort((a, b) => a - b), [byName.B1, byName.GA].sort((a, b) => a - b));
  psCall('selectLayers', [byName.H]);
  assert.deepEqual(psCall('getSelectedLayerIds'), [byName.H]);
});

test('setLayerColor changes native color reported by getLayers', () => {
  const { byName } = buildFixture();
  psCall('setLayerColor', { id: byName.A0, color: 'violet' });
  psCall('setLayerColor', { id: byName.G, color: 'yellowColor' });
  const layers = psCall('getLayers');
  assert.equal(layers.find(l => l.name === 'A0').color, 'violet');
  assert.equal(layers.find(l => l.name === 'G').color, 'yellowColor');
  psCall('setLayerColor', { id: byName.A0, color: 'none' });
  assert.equal(psCall('getLayers').find(l => l.name === 'A0').color, 'none');
});
```

- [ ] **Step 2: fixture 생성 스크립트**

`test/fixture/make-fixture.jsx` (ASCII만):

```js
// Builds the LayerMemorier fixture document. Run via tools/ps-eval.ps1 (host preloaded).
// Returns JSON: {"psdPath": "..."}
(function () {
  var OUT = LM_FIXTURE_OUT; // set by the caller before evalFile, forward slashes
  while (app.documents.length) app.activeDocument.close(SaveOptions.DONOTSAVECHANGES);
  var doc = app.documents.add(240, 160, 72, 'fixture', NewDocumentMode.RGB, DocumentFill.TRANSPARENT);

  function fillCell(layer, col, row, r, g, b) {
    doc.activeLayer = layer;
    var x = col * 40, y = row * 40;
    doc.selection.select([[x, y], [x + 40, y], [x + 40, y + 40], [x, y + 40]]);
    var c = new SolidColor(); c.rgb.red = r; c.rgb.green = g; c.rgb.blue = b;
    doc.selection.fill(c);
    doc.selection.deselect();
  }
  function addLayer(name, col, row, r, g, b, parent) {
    var layer = (parent || doc).artLayers.add();
    layer.name = name;
    fillCell(layer, col, row, r, g, b);
    return layer;
  }

  // Layers are added bottom-up so that the panel order (top-down) matches the table in the plan.
  addLayer('BG', 4, 1, 255, 255, 255);
  var h = addLayer('H', 3, 1, 0, 0, 0);
  var g = doc.layerSets.add(); g.name = 'G';
  addLayer('GB', 2, 1, 128, 0, 255, g);
  addLayer('GA', 1, 1, 255, 128, 0, g);
  addLayer('N2', 0, 1, 128, 128, 128);
  addLayer('N1', 5, 0, 255, 0, 255);
  addLayer('B2', 4, 0, 0, 255, 255);
  addLayer('B1', 3, 0, 255, 255, 0);
  addLayer('B0', 2, 0, 0, 0, 255);
  addLayer('A1', 1, 0, 0, 255, 0);
  addLayer('A0', 0, 0, 255, 0, 0);
  h.visible = false;

  var file = new File(OUT);
  if (!file.parent.exists) file.parent.create();
  var opts = new PhotoshopSaveOptions();
  doc.saveAs(file, opts, false, Extension.LOWERCASE);
  return JSON.stringify({ psdPath: file.fsName });
})();
```

`doc.layerSets.add()`는 현재 활성 레이어 위에 그룹을 만든다. `artLayers.add()`는 부모 안(그룹이면 그룹 안) 맨 위에 만든다. 위 순서대로 추가하면 위→아래가 `A0, A1, B0, B1, B2, N1, N2, G, GA, GB, H, BG`가 된다. 다르면 Step 4의 첫 테스트가 순서를 알려 준다 — 그때 추가 순서를 조정한다.

`test/fixture/fixture-docdata.json` (마크 키는 레이어 **이름**. `docDataFor`가 id로 바꾼다):

```json
{
  "version": 1,
  "baseName": "fx",
  "delimiter": "_",
  "destination": "",
  "nativeColor": false,
  "categories": [
    { "id": "cA", "name": "A", "color": "red", "labelFormat": "{c}{v}", "folder": true,
      "values": [ { "id": "a0", "name": "0", "label": "0" }, { "id": "a1", "name": "1", "label": "1" } ] },
    { "id": "cB", "name": "B", "color": "blue", "labelFormat": "{v}", "folder": false,
      "values": [ { "id": "b0", "name": "0", "label": "0" }, { "id": "b1", "name": "1", "label": "1" }, { "id": "b2", "name": "2", "label": "2" } ] },
    { "id": "cN", "name": "N", "color": "green", "labelFormat": "{v}", "folder": false,
      "values": [ { "id": "n1", "name": "1", "label": "1" }, { "id": "n2", "name": "2", "label": "2" } ] }
  ],
  "marksByName": {
    "A0": { "cA": ["a0"] },
    "A1": { "cA": ["a1"] },
    "B0": { "cB": ["b0"] },
    "B1": { "cB": ["b1"] },
    "B2": { "cB": ["b2"] },
    "N1": { "cN": ["n1"] },
    "N2": { "cN": ["n2"] },
    "G":  { "cA": ["a1"] },
    "GA": { "cB": ["b0"] }
  },
  "excluded": []
}
```

- [ ] **Step 3: fixture 헬퍼**

`test/helpers/fixture.js`:

```js
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
```

- [ ] **Step 4: 실패 확인**

```bash
node --test test/e2e/host.test.js
```

Expected: 새 테스트 3개가 `LM.getLayers is not a function` 계열로 FAIL (호스트 결과가 `EvalScript error` 또는 `non-JSON`).

- [ ] **Step 5: 호스트 구현**

`host/host.jsx`의 IIFE 안, `LM.eventIds` 정의 뒤에 추가:

```js
  // ---- layers (ActionManager) ----

  LM.getLayers = wrap(function () {
    if (!hasDoc()) return [];
    var ref = new ActionReference();
    ref.putEnumerated(cid('Dcmn'), cid('Ordn'), cid('Trgt'));
    var count = executeActionGet(ref).getInteger(cid('NmbL'));
    var from = hasBackground() ? 0 : 1;
    var out = [];
    var stack = [];
    for (var i = count; i >= from; i--) {
      var r = new ActionReference();
      r.putIndex(cid('Lyr '), i);
      var d = executeActionGet(r);
      var section = typeIDToStringID(d.getEnumerationValue(sid('layerSection')));
      if (section === 'layerSectionEnd') { stack.pop(); continue; }
      var item = {
        id: d.getInteger(sid('layerID')),
        name: d.getString(cid('Nm  ')),
        kind: section === 'layerSectionStart' ? 'group' : 'layer',
        visible: d.getBoolean(cid('Vsbl')),
        depth: stack.length,
        parentId: stack.length ? stack[stack.length - 1] : null,
        color: typeIDToStringID(d.getEnumerationValue(cid('Clr ')))
      };
      out.push(item);
      if (item.kind === 'group') stack.push(item.id);
    }
    return out;
  });

  LM.getSelectedLayerIds = wrap(function () {
    if (!hasDoc()) return [];
    var ref = new ActionReference();
    ref.putProperty(cid('Prpr'), sid('targetLayers'));
    ref.putEnumerated(cid('Dcmn'), cid('Ordn'), cid('Trgt'));
    var desc = executeActionGet(ref);
    if (!desc.hasKey(sid('targetLayers'))) return [];
    var list = desc.getList(sid('targetLayers'));
    var offset = hasBackground() ? 0 : 1;
    var ids = [];
    for (var i = 0; i < list.count; i++) {
      var idx = list.getReference(i).getIndex() + offset;
      var r = new ActionReference();
      r.putIndex(cid('Lyr '), idx);
      ids.push(executeActionGet(r).getInteger(sid('layerID')));
    }
    return ids;
  });

  LM.selectLayers = wrap(function (ids) {
    if (!hasDoc() || !ids || !ids.length) return { ok: true };
    for (var i = 0; i < ids.length; i++) {
      var ref = new ActionReference();
      ref.putIdentifier(cid('Lyr '), ids[i]);
      var desc = new ActionDescriptor();
      desc.putReference(cid('null'), ref);
      if (i > 0) desc.putEnumerated(sid('selectionModifier'), sid('selectionModifierType'), sid('addToSelection'));
      desc.putBoolean(cid('MkVs'), false);
      executeAction(cid('slct'), desc, DialogModes.NO);
    }
    return { ok: true };
  });

  LM.setLayerColor = wrap(function (a) {
    if (!hasDoc()) throw new Error('no document');
    var ref = new ActionReference();
    ref.putIdentifier(cid('Lyr '), a.id);
    var desc = new ActionDescriptor();
    desc.putReference(cid('null'), ref);
    var props = new ActionDescriptor();
    props.putEnumerated(cid('Clr '), cid('Clr '), sid(a.color));
    desc.putObject(cid('T   '), cid('Lyr '), props);
    executeAction(cid('setd'), desc, DialogModes.NO);
    return { ok: true };
  });
```

- [ ] **Step 6: 통과 확인**

```bash
node --test test/e2e/host.test.js
```

Expected: 6 PASS. 레이어 순서 테스트가 실패하면 실제 순서를 보고 `make-fixture.jsx`의 추가 순서를 맞춘다 (핵심은 **테이블과 템플릿의 이름·셀·마크가 일치**하는 것이지 순서 자체는 아니다. 순서가 바뀌면 테스트의 기대 배열을 실제 위→아래 순서로 고친다).

`getSelectedLayerIds`가 엉뚱한 레이어를 돌려주면 `offset` 규칙(배경 없으면 +1)이 원인이다. `psRun('LM.getSelectedLayerIds()')`와 `getLayers`를 대조해 조정한다.

- [ ] **Step 7: 커밋**

```bash
git add -A && git commit -m "host: 레이어 목록·선택·네이티브 색 API와 fixture PSD 생성기를 만든다."
```

---

### Task 8: 호스트 XMP 문서 데이터 읽기/쓰기 (spec §4.3, §7 readDocData/writeDocData)

**Files:**
- Modify: `host/host.jsx` (IIFE 안, `LM.setLayerColor` 뒤)
- Modify: `test/e2e/host.test.js`

**Interfaces:**
- Produces: `LM.readDocData()` → 문서 데이터 JSON 문자열 그대로(패널이 파싱) 또는 `null`. `LM.writeDocData(json)` → `{ok}`.

- [ ] **Step 1: 실패하는 테스트**

`test/e2e/host.test.js`에 추가:

```js
const { reopenFixture, docDataFor } = require('../helpers/fixture');

test('docData round-trips through XMP and survives save/reopen', () => {
  const { byName } = buildFixture();
  assert.equal(psCall('readDocData'), null);
  const data = docDataFor(byName, 'D:/tmp/lm');
  psCall('writeDocData', data);
  assert.deepEqual(psCall('readDocData'), data);
  psRun('app.activeDocument.save(); "saved"');
  const reopened = reopenFixture();
  assert.deepEqual(reopened.byName, byName, 'layer ids must survive save/reopen');
  assert.deepEqual(psCall('readDocData'), data);
});

test('writeDocData keeps unicode intact', () => {
  buildFixture();
  const data = { version: 1, baseName: '알싸기 テスト', delimiter: '_', destination: 'D:/출력', nativeColor: true, categories: [], marks: {}, excluded: [] };
  psCall('writeDocData', data);
  assert.deepEqual(psCall('readDocData'), data);
});
```

- [ ] **Step 2: 실패 확인**

```bash
node --test test/e2e/host.test.js
```

Expected: 새 테스트 2개 FAIL (`LM.readDocData is not a function`).

- [ ] **Step 3: 구현**

`host/host.jsx` IIFE 안에 추가:

```js
  // ---- document data in XMP ----

  var NS = 'http://layermemorier.local/1.0/';

  function xmpLib() {
    if (ExternalObject.AdobeXMPScript === undefined) {
      ExternalObject.AdobeXMPScript = new ExternalObject('lib:AdobeXMPScript');
    }
    XMPMeta.registerNamespace(NS, 'lm');
  }

  function readXmp() {
    var raw = app.activeDocument.xmpMetadata.rawData;
    return (raw && raw.length) ? new XMPMeta(raw) : new XMPMeta();
  }

  LM.readDocData = wrap(function () {
    if (!hasDoc()) return null;
    xmpLib();
    var prop = readXmp().getProperty(NS, 'data');
    if (!prop || !prop.value) return null;
    return String(prop.value);
  });

  LM.writeDocData = wrap(function (data) {
    if (!hasDoc()) throw new Error('no document');
    xmpLib();
    var xmp = readXmp();
    xmp.setProperty(NS, 'data', JSON.stringify(data));
    app.activeDocument.xmpMetadata.rawData = xmp.serialize();
    return { ok: true };
  });
```

`readDocData`는 문자열을 그대로 돌려주므로 `wrap`이 재직렬화하지 않는다. 패널·테스트는 그 문자열을 `JSON.parse`한다 (`psCall`이 이미 한다).

- [ ] **Step 4: 통과 확인**

```bash
node --test test/e2e/host.test.js
```

Expected: 8 PASS.

실패 시: `XMPMeta is undefined` → `xmpLib()` 호출 누락. `getProperty` 결과가 없음 → 네임스페이스 등록 전에 읽음. 재열기 후 `null` → `save()`가 안 됐거나 `rawData` 대입이 안 됨(`app.activeDocument.xmpMetadata.rawData = ...`는 문서가 열려 있어야 한다).

- [ ] **Step 5: 커밋**

```bash
git add -A && git commit -m "host: 문서 데이터를 XMP에 읽고 쓴다."
```

---

### Task 9: 호스트 내보내기 + 픽셀 검사 E2E (spec §7 export*, §8, §11.2)

**Files:**
- Modify: `host/host.jsx` (IIFE 안, `LM.writeDocData` 뒤)
- Create: `test/e2e/export.test.js`

**Interfaces:**
- Produces: `LM.exportBegin({layerIds})` → `{ok}`, `LM.exportOne({on, off, path})` → `{ok}` (`path`는 절대 경로, `/` 구분), `LM.exportEnd()` → `{ok}`.
- Consumes: `LMCore.variation.enumerate`, `LMCore.jobs.buildJobs`, `LMCore.jobs.markedLayerIds`, fixture 헬퍼.

- [ ] **Step 1: 실패하는 테스트**

`test/e2e/export.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const { psRun, psCall, ROOT } = require('../helpers/ps');
const { buildFixture, docDataFor } = require('../helpers/fixture');
const { enumerate } = require('../../core/variation');
const { buildJobs, markedLayerIds } = require('../../core/jobs');

const DEST = path.join(ROOT, 'test', 'out', 'export', '한글 폴더');
const CELL = {
  A0: [0, 0, [255, 0, 0]], A1: [1, 0, [0, 255, 0]], B0: [2, 0, [0, 0, 255]], B1: [3, 0, [255, 255, 0]],
  B2: [4, 0, [0, 255, 255]], N1: [5, 0, [255, 0, 255]], N2: [0, 1, [128, 128, 128]],
  GA: [1, 1, [255, 128, 0]], GB: [2, 1, [128, 0, 255]], H: [3, 1, [0, 0, 0]], BG: [4, 1, [255, 255, 255]],
};

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

function pixel(png, col, row) {
  const i = ((row * 40 + 20) * png.width + (col * 40 + 20)) * 4;
  return [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]];
}

function runExport(jobs, layerIds) {
  const lines = [`LM.exportBegin(${JSON.stringify(JSON.stringify({ layerIds }))});`, 'var results = [];'];
  for (const job of jobs) {
    const arg = { on: job.on, off: job.off, path: DEST.replace(/\\/g, '/') + '/' + job.relativePath };
    lines.push(`results.push(LM.exportOne(${JSON.stringify(JSON.stringify(arg))}));`);
  }
  lines.push('results.push(LM.exportEnd());', 'JSON.stringify(results)');
  return JSON.parse(psRun(lines.join('\n'))).map(r => JSON.parse(r));
}

test('export writes every variation with correct pixels and restores visibility', () => {
  fs.rmSync(DEST, { recursive: true, force: true });
  const { layers, byName } = buildFixture();
  const docData = docDataFor(byName, DEST);
  psCall('writeDocData', docData);

  const variations = enumerate(docData.categories, { excluded: docData.excluded });
  const { jobs, conflicts, warnings } = buildJobs(docData, layers, variations);
  assert.equal(conflicts.length, 0);
  assert.equal(warnings.length, 0);
  assert.equal(jobs.length, 12);

  const before = psCall('getLayers').map(l => [l.name, l.visible]);
  const results = runExport(jobs, markedLayerIds(docData.marks, layers));
  for (const r of results) assert.equal(r.ok, true, JSON.stringify(r));

  const written = [];
  for (const dir of fs.readdirSync(DEST)) for (const f of fs.readdirSync(path.join(DEST, dir))) written.push(dir + '/' + f);
  assert.deepEqual(written.sort(), jobs.map(j => j.relativePath).sort());
  assert.ok(written.includes('fx_A0/fx_A0_0_1.png'));

  jobs.forEach((job, i) => {
    const png = PNG.sync.read(fs.readFileSync(path.join(DEST, job.relativePath)));
    assert.equal(png.width, 240);
    assert.equal(png.height, 160);
    for (const name of Object.keys(CELL)) {
      const [col, row, rgb] = CELL[name];
      const [r, g, b, a] = pixel(png, col, row);
      const on = expectedOn(name, variations[i]);
      const where = `${job.relativePath} ${name}`;
      if (on) {
        assert.equal(a, 255, where + ' alpha');
        assert.ok(Math.abs(r - rgb[0]) <= 2 && Math.abs(g - rgb[1]) <= 2 && Math.abs(b - rgb[2]) <= 2, `${where} rgb=${[r, g, b]}`);
      } else {
        assert.equal(a, 0, where + ' should be transparent');
      }
    }
  });

  const after = psCall('getLayers').map(l => [l.name, l.visible]);
  assert.deepEqual(after, before, 'visibility restored');
});

test('exportOne reports an error for an unwritable path and export continues', () => {
  const { layers, byName } = buildFixture();
  const docData = docDataFor(byName, DEST);
  const bad = psCall('exportBegin', { layerIds: markedLayerIds(docData.marks, layers) });
  assert.equal(bad.ok, true);
  const out = psRun(`LM.exportOne(${JSON.stringify(JSON.stringify({ on: [], off: [], path: 'Q:/no/such/drive/x.png' }))})`);
  assert.match(out, /"error"/);
  assert.equal(psCall('exportEnd').ok, true);
});
```

- [ ] **Step 2: 실패 확인**

```bash
node --test test/e2e/export.test.js
```

Expected: FAIL (`LM.exportBegin is not a function`).

- [ ] **Step 3: 구현**

`host/host.jsx` IIFE 안에 추가:

```js
  // ---- export ----

  var snapshot = null;
  var currentJob = null;

  function visibilityOf(id) {
    var r = new ActionReference();
    r.putIdentifier(cid('Lyr '), id);
    return executeActionGet(r).getBoolean(cid('Vsbl'));
  }

  function setVisibleMany(ids, on) {
    if (!ids || !ids.length) return;
    var list = new ActionList();
    for (var i = 0; i < ids.length; i++) {
      var r = new ActionReference();
      r.putIdentifier(cid('Lyr '), ids[i]);
      list.putReference(r);
    }
    var desc = new ActionDescriptor();
    desc.putList(cid('null'), list);
    executeAction(cid(on ? 'Shw ' : 'Hd  '), desc, DialogModes.NO);
  }

  function ensureFolder(folder) {
    if (!folder || folder.exists) return;
    ensureFolder(folder.parent);
    if (!folder.create()) throw new Error('cannot create folder: ' + folder.fsName);
  }

  function saveForWebPng24(file) {
    var desc = new ActionDescriptor();
    var d2 = new ActionDescriptor();
    d2.putEnumerated(cid('Op  '), cid('SWOp'), cid('OpSa'));
    d2.putEnumerated(cid('Fmt '), cid('IRFm'), cid('PN24'));
    d2.putBoolean(cid('Intr'), false);
    d2.putBoolean(cid('Trns'), true);
    d2.putBoolean(cid('Mtt '), true);
    d2.putInteger(cid('MttR'), 255);
    d2.putInteger(cid('MttG'), 255);
    d2.putInteger(cid('MttB'), 255);
    d2.putBoolean(cid('SHTM'), false);
    d2.putBoolean(cid('SImg'), true);
    d2.putBoolean(cid('SSSO'), false);
    d2.putList(cid('SSLt'), new ActionList());
    d2.putBoolean(cid('DIDr'), false);
    d2.putPath(cid('In  '), file);
    desc.putObject(cid('Usng'), sid('SaveForWeb'), d2);
    executeAction(cid('Expr'), desc, DialogModes.NO);
  }

  // Save for Web mangles non-ASCII paths, so export to an ASCII temp file and copy.
  function savePng(target) {
    var doc = app.activeDocument;
    if (doc.width.as('px') > 8192 || doc.height.as('px') > 8192) {
      var opts = new PNGSaveOptions();
      opts.compression = 6;
      opts.interlaced = false;
      doc.saveAs(target, opts, true, Extension.LOWERCASE);
      return;
    }
    var tmp = new File(Folder.temp.fsName + '/layermemorier_export.png');
    if (tmp.exists) tmp.remove();
    saveForWebPng24(tmp);
    if (!tmp.exists) throw new Error('save for web produced no file');
    if (target.exists) target.remove();
    if (!tmp.copy(target)) throw new Error('cannot write: ' + target.fsName);
    tmp.remove();
  }

  LM._runJob = function () {
    var job = currentJob;
    setVisibleMany(job.on, true);
    setVisibleMany(job.off, false);
    var target = new File(job.path);
    ensureFolder(target.parent);
    savePng(target);
  };

  LM.exportBegin = wrap(function (a) {
    if (!hasDoc()) throw new Error('no document');
    snapshot = [];
    for (var i = 0; i < a.layerIds.length; i++) {
      snapshot.push({ id: a.layerIds[i], visible: visibilityOf(a.layerIds[i]) });
    }
    return { ok: true };
  });

  LM.exportOne = wrap(function (job) {
    if (!hasDoc()) throw new Error('no document');
    currentJob = job;
    try {
      app.activeDocument.suspendHistory('LayerMemorier export', 'LM._runJob()');
    } finally {
      currentJob = null;
    }
    return { ok: true };
  });

  LM.exportEnd = wrap(function () {
    if (!snapshot) return { ok: true };
    var on = [], off = [];
    for (var i = 0; i < snapshot.length; i++) {
      (snapshot[i].visible ? on : off).push(snapshot[i].id);
    }
    setVisibleMany(on, true);
    setVisibleMany(off, false);
    snapshot = null;
    return { ok: true };
  });
```

- [ ] **Step 4: 통과 확인**

```bash
node --test test/e2e/export.test.js
```

Expected: 2 PASS. 12개 PNG가 `test/out/export/한글 폴더/fx_A0/…`, `fx_A1/…`에 생긴다.

실패 유형:
- 픽셀이 투명이어야 하는데 색이 있음: `Hd  `가 리스트 참조를 못 받은 것. 그러면 `setVisibleMany`를 id마다 한 번씩 `executeAction`하도록 바꾼다.
- 색이 ±2를 넘게 다름: Save for Web의 sRGB 변환. `d2.putBoolean(sid('useLegacyPixelDimension'), ...)`이 아니라 문서 프로파일 문제이므로 fixture 생성 시 `doc.colorProfileType = ColorProfile.NONE`을 추가한다.
- 한글 폴더에 파일이 없고 깨진 이름이 생김: `savePng`의 임시 파일 복사 경로를 확인한다.
- `suspendHistory` 안의 예외가 밖으로 안 나옴(`ok:true`인데 파일 없음): `LM._runJob`에서 예외를 `LM._jobError`에 저장하고 `exportOne`이 그것을 검사해 throw 하도록 바꾼다.

- [ ] **Step 5: 출력 하나를 눈으로 확인**

`test/out/export/한글 폴더/fx_A1/fx_A1_0_1.png`를 Read로 연다. 기대: 1행에 초록(A1)·파랑(B0)·자홍(N1), 2행에 주황(GA)·보라(GB)·흰색(BG). 나머지 칸은 투명.

- [ ] **Step 6: 커밋**

```bash
git add -A && git commit -m "host: 가시성 스냅샷·PNG 저장 내보내기와 픽셀 검사 E2E를 만든다."
```

---

### Task 10: 패널 기반 + 카테고리 탭 (spec §6.1, §4.2, §7.1)

**Files:**
- Modify: `client/index.html` (전부 교체)
- Create: `client/style.css`, `client/colors.js`, `client/host-bridge.js`, `client/presets.js`, `client/state.js`, `client/ui/categories.js`, `client/ui/layers.js` (빈 렌더), `client/ui/export.js` (빈 렌더), `client/main.js`
- Create: `test/e2e/panel.test.js`

**Interfaces:**
- Produces: `LMHost.load()`, `LMHost.call(fn, arg)` → Promise, `LMHost.onEvents(handler)`, `LMHost.cs`, `LMHost.extPath`.
- Produces: `LMPresets.load()` → `{version, presets, corrupt?}`, `LMPresets.save(data)`, `LMPresets.file`.
- Produces: `LMState` (문서·레이어·선택·탭·내보내기 상태), `LMApp.refresh()`, `LMApp.saveDocData()`, `LMApp.render()`, `LMApp.status(msg)`, `LMApp.newDocData(name)`, `LMApp.uid(prefix)`, `LMApp.newCategory()`, `LMApp.newValue(name)`, `LMApp.removeMarksFor(categoryId, valueId|null)`.
- Produces: `LMColors.ORDER`, `LMColors.hex(name)`, `LMColors.native(name)`.
- Produces: 각 탭 모듈 `LMUI.categories.render(el)`, `LMUI.layers.render(el)`, `LMUI.export.render(el)`.
- 테스트 훅: 패널 전역 `window.LMState`, `window.LMApp`가 DevTools `eval`에서 보인다.

- [ ] **Step 1: colors.js, host-bridge.js, presets.js, state.js**

`client/colors.js`:

```js
// 배지 색 이름 ↔ 화면 hex ↔ 포토샵 네이티브 enum (spec §4.1, §7)
const LMColors = (() => {
  const TABLE = {
    red:    { hex: '#e5484d', native: 'red' },
    orange: { hex: '#f5a623', native: 'orange' },
    yellow: { hex: '#e3c000', native: 'yellowColor' },
    green:  { hex: '#46b450', native: 'grain' },
    blue:   { hex: '#3b82f6', native: 'blue' },
    violet: { hex: '#8b5cf6', native: 'violet' },
    gray:   { hex: '#9ca3af', native: 'gray' },
  };
  const ORDER = ['red', 'orange', 'yellow', 'green', 'blue', 'violet', 'gray'];
  return {
    ORDER,
    hex: name => (TABLE[name] || TABLE.gray).hex,
    native: name => (TABLE[name] || TABLE.gray).native,
  };
})();
```

`client/host-bridge.js`:

```js
// evalScript 래퍼. 모든 호스트 호출은 여기를 거친다 (spec §7).
const LMHost = (() => {
  const cs = new CSInterface();
  const extPath = cs.getSystemPath(SystemPath.EXTENSION).replace(/\\/g, '/');

  function raw(script) {
    return new Promise(resolve => cs.evalScript(script, resolve));
  }

  function parse(fn, r) {
    if (r === 'EvalScript error.') throw new Error(fn + ': host script error');
    if (r === undefined || r === '' || r === 'undefined' || r === 'null') return null;
    let v;
    try { v = JSON.parse(r); } catch (e) { throw new Error(fn + ': bad host result: ' + String(r).slice(0, 200)); }
    if (v && typeof v === 'object' && v.error) throw new Error(fn + ': ' + v.error);
    return v;
  }

  async function load() {
    const r = await raw(`$.evalFile(File(${JSON.stringify(extPath + '/host/host.jsx')}))`);
    if (r !== 'LM loaded') throw new Error('host.jsx load failed: ' + r);
    return parse('ping', await raw('LM.ping()'));
  }

  function call(fn, arg) {
    const script = arg === undefined ? `LM.${fn}()` : `LM.${fn}(${JSON.stringify(JSON.stringify(arg))})`;
    return raw(script).then(r => parse(fn, r));
  }

  async function onEvents(handler) {
    const ids = await call('eventIds');
    const ev = new CSEvent('com.adobe.PhotoshopRegisterEvent', 'APPLICATION');
    ev.extensionId = cs.getExtensionID();
    ev.data = Object.keys(ids).map(k => ids[k]).join(',');
    cs.dispatchEvent(ev);
    cs.addEventListener('com.adobe.PhotoshopJSONCallback' + cs.getExtensionID(), handler);
  }

  return { cs, extPath, load, call, onEvents };
})();
```

`client/presets.js`:

```js
// %APPDATA%\LayerMemorier\presets.json (spec §4.2, §9 프리셋 파일 깨짐)
const LMPresets = (() => {
  const fs = window.cep.fs;
  const dir = LMHost.cs.getSystemPath(SystemPath.USER_DATA) + '/LayerMemorier';
  const file = dir + '/presets.json';

  function load() {
    const r = fs.readFile(file, cep.encoding.UTF8);
    if (r.err !== fs.NO_ERROR) return { version: 1, presets: [] };
    try {
      const data = JSON.parse(r.data);
      if (!Array.isArray(data.presets)) throw new Error('presets missing');
      return data;
    } catch (e) {
      fs.writeFile(file + '.bak', r.data, cep.encoding.UTF8);
      return { version: 1, presets: [], corrupt: true };
    }
  }

  function save(data) {
    fs.makedir(dir);
    const r = fs.writeFile(file, JSON.stringify(data, null, 2), cep.encoding.UTF8);
    if (r.err !== fs.NO_ERROR) throw new Error('presets.json 쓰기 실패 (' + r.err + ')');
  }

  return { load, save, file };
})();
```

`client/state.js`:

```js
// 패널 상태와 문서 데이터 생성/변경 도우미. 렌더는 ui/*.js, 호스트 호출은 host-bridge.js.
const LMState = {
  docInfo: null,      // LM.getDocInfo()
  docData: null,      // spec §4.3
  layers: [],         // LM.getLayers()
  selectedIds: [],    // 선택된 layerId
  collapsed: new Set(), // 접힌 그룹 id
  include: {},        // 부분 출력 {categoryId: valueId[]} (세션)
  tab: 'categories',
  exporting: false,
  abort: false,
  progress: null,     // {done, total, current}
  summary: null,      // {done, failures:[{path,error}]}
};

const LMApp = {
  uid(prefix) { return prefix + '_' + Math.random().toString(36).slice(2, 8); },

  newDocData(baseName) {
    return { version: 1, baseName: baseName || '', delimiter: '_', destination: '', nativeColor: true, categories: [], marks: {}, excluded: [] };
  },

  newCategory() {
    const used = new Set(LMState.docData.categories.map(c => c.color));
    const color = LMColors.ORDER.find(c => !used.has(c)) || 'gray';
    return { id: this.uid('c'), name: '', color, labelFormat: '{v}', folder: false, values: [] };
  },

  newValue(name) { return { id: this.uid('v'), name: String(name), label: String(name) }; },

  // 카테고리(valueId=null) 또는 값을 참조하는 마크 항목을 지운다 (spec §6.1)
  removeMarksFor(categoryId, valueId) {
    const marks = LMState.docData.marks;
    for (const layerId of Object.keys(marks)) {
      const mark = marks[layerId];
      if (!mark[categoryId]) continue;
      if (valueId === null) delete mark[categoryId];
      else {
        mark[categoryId] = mark[categoryId].filter(v => v !== valueId);
        if (!mark[categoryId].length) delete mark[categoryId];
      }
      if (!Object.keys(mark).length) delete marks[layerId];
    }
  },

  async saveDocData() {
    if (!LMState.docInfo || !LMState.docData) return;
    try { await LMHost.call('writeDocData', LMState.docData); }
    catch (e) { this.status('저장 실패: ' + e.message); }
  },

  status(msg) {
    const el = document.getElementById('status');
    el.textContent = msg || '';
  },

  async refresh() {
    try {
      const info = await LMHost.call('getDocInfo');
      LMState.docInfo = info;
      if (!info) {
        LMState.docData = null; LMState.layers = []; LMState.selectedIds = [];
      } else {
        LMState.layers = await LMHost.call('getLayers');
        LMState.selectedIds = await LMHost.call('getSelectedLayerIds');
        const stored = await LMHost.call('readDocData');
        LMState.docData = stored || this.newDocData(info.name.replace(/\.[^.]+$/, ''));
      }
      this.status('');
    } catch (e) {
      this.status(e.message);
    }
    this.render();
  },

  render() {
    document.getElementById('doc-name').textContent = LMState.docInfo ? LMState.docInfo.name : '문서 없음';
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === LMState.tab));
    document.querySelectorAll('main .tab').forEach(s => s.classList.toggle('active', s.id === 'tab-' + LMState.tab));
    const el = document.getElementById('tab-' + LMState.tab);
    if (!LMState.docInfo) { el.innerHTML = '<p class="hint">포토샵에서 문서를 열면 여기에 표시됩니다.</p>'; return; }
    LMUI[LMState.tab].render(el);
  },
};

const LMUI = {};
```

- [ ] **Step 2: 카테고리 탭**

`client/ui/categories.js`:

```js
// 카테고리 탭 (spec §6.1). 그리기 + 이벤트 처리만 한다.
LMUI.categories = (() => {
  const FORMATS = ['{v}', '{c}{v}', '{c}_{v}'];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let presets = null;

  function presetBar() {
    presets = presets || LMPresets.load();
    const options = presets.presets.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
    return `
      <div class="row preset-bar">
        <select id="preset-select"><option value="">프리셋 선택…</option>${options}</select>
        <button data-action="preset-apply">적용</button>
        <button data-action="preset-save">현재 구성을 프리셋으로 저장</button>
        <button data-action="preset-delete">삭제</button>
      </div>
      ${presets.corrupt ? '<p class="warn">presets.json이 깨져 있어 비웠습니다 (원본은 presets.json.bak).</p>' : ''}`;
  }

  function valueRows(c) {
    return c.values.map(v => `
      <div class="row value-row" data-value="${esc(v.id)}">
        <input class="v-name" data-field="name" value="${esc(v.name)}" placeholder="값 이름">
        <input class="v-label" data-field="label" value="${esc(v.label)}" placeholder="파일명 라벨 (비우면 생략)">
        <button data-action="value-delete" title="값 삭제">×</button>
      </div>`).join('');
  }

  function categoryBlock(c, i, n) {
    const formats = FORMATS.map(f => `<option value="${esc(f)}" ${c.labelFormat === f ? 'selected' : ''}>${esc(f)}</option>`).join('');
    return `
      <div class="category" data-category="${esc(c.id)}">
        <div class="row cat-head">
          <span class="dot" style="background:${LMColors.hex(c.color)}"></span>
          <input class="c-name" data-field="name" value="${esc(c.name)}" placeholder="카테고리 이름">
          <select data-field="labelFormat" title="라벨 형식">${formats}</select>
          <label title="이 단계에서 폴더로 묶기"><input type="checkbox" data-field="folder" ${c.folder ? 'checked' : ''}> 폴더</label>
          <button data-action="cat-up" ${i === 0 ? 'disabled' : ''}>▲</button>
          <button data-action="cat-down" ${i === n - 1 ? 'disabled' : ''}>▼</button>
          <button data-action="cat-delete" title="카테고리 삭제">×</button>
        </div>
        <div class="values">
          ${valueRows(c)}
          <div class="row">
            <button data-action="value-add">값 추가</button>
            <span class="range">범위 <input class="range-from" type="number" value="1" style="width:4em"> ~ <input class="range-to" type="number" value="5" style="width:4em">
            <button data-action="value-range">범위로 값 만들기</button></span>
          </div>
        </div>
      </div>`;
  }

  function render(el) {
    const cats = LMState.docData.categories;
    el.innerHTML = presetBar() + cats.map((c, i) => categoryBlock(c, i, cats.length)).join('') +
      `<div class="row"><button data-action="cat-add">카테고리 추가</button></div>`;
  }

  function commit() { LMApp.saveDocData(); LMApp.render(); }

  function findCategory(target) {
    const block = target.closest('[data-category]');
    if (!block) return null;
    return LMState.docData.categories.find(c => c.id === block.dataset.category) || null;
  }

  document.addEventListener('click', async e => {
    const btn = e.target.closest('#tab-categories [data-action]');
    if (!btn) return;
    const cats = LMState.docData.categories;
    const c = findCategory(btn);
    const idx = c ? cats.indexOf(c) : -1;
    switch (btn.dataset.action) {
      case 'cat-add': cats.push(LMApp.newCategory()); return commit();
      case 'cat-delete': {
        if (!confirm(`카테고리 "${c.name}"를 지웁니다. 이 카테고리를 참조하는 마크도 지워집니다.`)) return;
        LMApp.removeMarksFor(c.id, null);
        cats.splice(idx, 1);
        LMState.docData.excluded = LMState.docData.excluded.map(x => { const y = Object.assign({}, x); delete y[c.id]; return y; }).filter(x => Object.keys(x).length);
        return commit();
      }
      case 'cat-up': if (idx > 0) { cats.splice(idx - 1, 0, cats.splice(idx, 1)[0]); commit(); } return;
      case 'cat-down': if (idx < cats.length - 1) { cats.splice(idx + 1, 0, cats.splice(idx, 1)[0]); commit(); } return;
      case 'value-add': c.values.push(LMApp.newValue(String(c.values.length))); return commit();
      case 'value-range': {
        const block = btn.closest('[data-category]');
        const from = parseInt(block.querySelector('.range-from').value, 10);
        const to = parseInt(block.querySelector('.range-to').value, 10);
        if (isNaN(from) || isNaN(to) || to < from) return LMApp.status('범위가 잘못됐습니다.');
        for (let n = from; n <= to; n++) c.values.push(LMApp.newValue(n));
        return commit();
      }
      case 'value-delete': {
        const row = btn.closest('[data-value]');
        const v = c.values.find(v => v.id === row.dataset.value);
        LMApp.removeMarksFor(c.id, v.id);
        c.values.splice(c.values.indexOf(v), 1);
        LMState.docData.excluded = LMState.docData.excluded.filter(x => x[c.id] !== v.id);
        return commit();
      }
      case 'preset-apply': {
        const id = document.getElementById('preset-select').value;
        const p = presets.presets.find(p => p.id === id);
        if (!p) return LMApp.status('프리셋을 고르세요.');
        if (Object.keys(LMState.docData.marks).length && !confirm('프리셋을 적용하면 현재 문서의 마크가 전부 지워집니다. 계속할까요?')) return;
        LMState.docData.categories = JSON.parse(JSON.stringify(p.categories));
        LMState.docData.marks = {};
        LMState.docData.excluded = [];
        return commit();
      }
      case 'preset-save': {
        const name = prompt('프리셋 이름', LMState.docData.baseName || '');
        if (!name) return;
        const existing = presets.presets.find(p => p.name === name);
        const copy = JSON.parse(JSON.stringify(cats));
        if (existing) existing.categories = copy; else presets.presets.push({ id: LMApp.uid('p'), name, categories: copy });
        try { LMPresets.save(presets); LMApp.status(`프리셋 "${name}" 저장`); } catch (err) { LMApp.status(err.message); }
        return LMApp.render();
      }
      case 'preset-delete': {
        const id = document.getElementById('preset-select').value;
        const p = presets.presets.find(p => p.id === id);
        if (!p || !confirm(`프리셋 "${p.name}"을 지울까요?`)) return;
        presets.presets.splice(presets.presets.indexOf(p), 1);
        try { LMPresets.save(presets); } catch (err) { LMApp.status(err.message); }
        return LMApp.render();
      }
    }
  });

  document.addEventListener('change', e => {
    const input = e.target.closest('#tab-categories [data-field]');
    if (!input) return;
    const c = findCategory(input);
    const row = input.closest('[data-value]');
    const target = row ? c.values.find(v => v.id === row.dataset.value) : c;
    const field = input.dataset.field;
    if (row && field === 'name') {
      // 라벨이 이름과 같았으면(따로 고친 적 없음) 이름을 따라간다.
      const old = target.name;
      target.name = input.value;
      if (target.label === old) target.label = input.value;
    } else if (input.type === 'checkbox') {
      target[field] = input.checked;
    } else {
      target[field] = input.value;
    }
    commit();
  });

  return { render, reloadPresets: () => { presets = null; } };
})();
```

`client/ui/layers.js` (Task 11에서 채운다):

```js
LMUI.layers = { render(el) { el.innerHTML = '<p class="hint">레이어 탭 (Task 11)</p>'; } };
```

`client/ui/export.js` (Task 12에서 채운다):

```js
LMUI.export = { render(el) { el.innerHTML = '<p class="hint">내보내기 탭 (Task 12)</p>'; } };
```

- [ ] **Step 3: main.js, index.html, style.css**

`client/main.js`:

```js
// 부팅: 호스트 로드 → 이벤트 등록 → 첫 새로고침. 탭 전환·새로고침 버튼.
(async () => {
  document.getElementById('tabs').addEventListener('click', e => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    LMState.tab = b.dataset.tab;
    LMApp.render();
  });
  document.getElementById('btn-refresh').addEventListener('click', () => LMApp.refresh());

  try {
    await LMHost.load();
  } catch (e) {
    LMApp.status(e.message);
    return;
  }

  let timer = null;
  await LMHost.onEvents(() => {
    if (LMState.exporting) return;
    clearTimeout(timer);
    timer = setTimeout(() => LMApp.refresh(), 200);
  });

  await LMApp.refresh();
  window.LMReady = true;
})();
```

`client/index.html`:

```html
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>LayerMemorier</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<header id="top">
  <span id="doc-name">문서 없음</span>
  <button id="btn-refresh" title="레이어와 문서 데이터를 다시 읽습니다">새로고침</button>
</header>
<nav id="tabs">
  <button data-tab="categories" class="active">카테고리</button>
  <button data-tab="layers">레이어</button>
  <button data-tab="export">내보내기</button>
</nav>
<main>
  <section id="tab-categories" class="tab active"></section>
  <section id="tab-layers" class="tab"></section>
  <section id="tab-export" class="tab"></section>
</main>
<footer id="status"></footer>
<script src="lib/CSInterface.js"></script>
<script src="../core/variation.js"></script>
<script src="../core/visibility.js"></script>
<script src="../core/naming.js"></script>
<script src="../core/jobs.js"></script>
<script src="colors.js"></script>
<script src="host-bridge.js"></script>
<script src="presets.js"></script>
<script src="state.js"></script>
<script src="ui/categories.js"></script>
<script src="ui/layers.js"></script>
<script src="ui/export.js"></script>
<script src="main.js"></script>
</body>
</html>
```

`client/style.css`:

```css
* { box-sizing: border-box; }
html, body { height: 100%; margin: 0; }
body { display: flex; flex-direction: column; font: 12px/1.4 "Segoe UI", "Malgun Gothic", sans-serif; background: #323232; color: #ddd; }
#top { display: flex; align-items: center; gap: 8px; padding: 6px 8px; background: #262626; }
#doc-name { flex: 1; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#tabs { display: flex; background: #2b2b2b; }
#tabs button { flex: 1; padding: 6px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: #aaa; cursor: pointer; }
#tabs button.active { color: #fff; border-bottom-color: #4a90e2; }
main { flex: 1; overflow: auto; padding: 8px; }
.tab { display: none; }
.tab.active { display: block; }
#status { min-height: 18px; padding: 3px 8px; background: #262626; color: #f5a623; font-size: 11px; }
button { background: #4a4a4a; color: #eee; border: 1px solid #5a5a5a; border-radius: 3px; padding: 3px 8px; cursor: pointer; }
button:hover { background: #575757; }
button:disabled { opacity: .4; cursor: default; }
button.primary { background: #4a90e2; border-color: #4a90e2; color: #fff; }
input, select { background: #1f1f1f; color: #eee; border: 1px solid #555; border-radius: 3px; padding: 2px 4px; }
input[type=checkbox] { width: auto; }
.row { display: flex; align-items: center; gap: 6px; margin: 4px 0; flex-wrap: wrap; }
.hint { color: #999; }
.warn { color: #f5a623; }
.err { color: #e5484d; }
.dot { display: inline-block; width: 12px; height: 12px; border-radius: 50%; }
.category { border: 1px solid #444; border-radius: 4px; padding: 6px; margin: 6px 0; background: #2c2c2c; }
.cat-head .c-name { flex: 1; min-width: 80px; }
.values { padding-left: 18px; }
.value-row input { flex: 1; min-width: 60px; }
/* 레이어 탭 */
.layer-row { display: flex; align-items: center; gap: 6px; padding: 2px 4px; border-radius: 3px; cursor: pointer; white-space: nowrap; }
.layer-row:hover { background: #3a3a3a; }
.layer-row.selected { background: #3d5a80; }
.layer-row .eye { width: 14px; color: #888; }
.layer-row .eye.on { color: #ddd; }
.layer-row .caret { width: 12px; color: #999; }
.layer-row .name { flex: 0 0 auto; }
.layer-row.group .name { font-weight: 600; }
.badge { display: inline-block; padding: 0 5px; border-radius: 8px; font-size: 10px; color: #111; line-height: 15px; }
.badge.stale { text-decoration: line-through; opacity: .6; }
.mark-panel { border-top: 1px solid #444; margin-top: 8px; padding-top: 8px; }
.mark-panel .cat-line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 3px 0; }
.mark-panel label { display: inline-flex; align-items: center; gap: 3px; }
/* 내보내기 탭 */
.preview { max-height: 180px; overflow: auto; background: #1f1f1f; border: 1px solid #444; padding: 4px; font-family: Consolas, monospace; font-size: 11px; white-space: pre; }
.progress { height: 8px; background: #1f1f1f; border-radius: 4px; overflow: hidden; }
.progress > div { height: 100%; background: #4a90e2; }
```

- [ ] **Step 4: 패널 열어 스크린샷 확인**

포토샵에서 패널을 닫았다 다시 연다(사람이 하거나, 아직 열려 있으면 DevTools로 reload):

```bash
cd /d/Project/LayerMemorier && node tools/panel.js reload && node tools/panel.js eval "window.LMReady === true"
```

Expected: `true`. `false`나 오류면 `node tools/panel.js eval "document.getElementById('status').textContent"`로 상태줄 메시지를 읽는다.

fixture를 열고 카테고리 탭을 찍는다:

```bash
node -e "require('./test/helpers/fixture').buildFixture()"
node tools/panel.js eval "LMApp.refresh().then(()=>LMState.docInfo.name)"
node tools/panel.js eval "(()=>{const c=LMApp.newCategory();c.name='옷';c.labelFormat='{c}{v}';for(let i=0;i<4;i++)c.values.push(LMApp.newValue(i));LMState.docData.categories.push(c);LMApp.render();return LMState.docData.categories.length})()"
node tools/panel.js shot task10-categories
```

`test/out/shots/task10-categories.png`를 Read로 열어 확인: 프리셋 바, 카테고리 블록(색 점·이름 `옷`·형식 드롭다운·폴더 체크·▲▼×), 값 4줄, "값 추가"·"범위로 값 만들기" 버튼이 보이고 글자가 잘리지 않는다. 잘리거나 겹치면 `style.css`를 고치고 다시 찍는다.

- [ ] **Step 5: 패널 E2E 테스트**

`test/e2e/panel.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { connect } = require('../helpers/panel');
const { psCall } = require('../helpers/ps');
const { buildFixture, docDataFor } = require('../helpers/fixture');

const PRESETS = path.join(process.env.APPDATA, 'LayerMemorier', 'presets.json');

async function freshPanel() {
  const p = await connect();
  await p.reload();
  await p.eval('new Promise(r => { const t = setInterval(() => { if (window.LMReady) { clearInterval(t); r(true); } }, 100); })');
  return p;
}

test('panel boots, sees the fixture document, and applies a preset', async () => {
  const { byName } = buildFixture();
  const template = docDataFor(byName);
  fs.mkdirSync(path.dirname(PRESETS), { recursive: true });
  fs.writeFileSync(PRESETS, JSON.stringify({ version: 1, presets: [{ id: 'p_test', name: '테스트 프리셋', categories: template.categories }] }), 'utf8');

  const p = await freshPanel();
  try {
    assert.equal(await p.eval('LMState.docInfo.name'), 'fixture.psd');
    assert.equal(await p.eval('LMState.layers.length'), 12);
    assert.equal(await p.eval('LMState.docData.categories.length'), 0);

    await p.eval(`document.getElementById('preset-select').value = 'p_test'; document.querySelector('[data-action=preset-apply]').click(); true`);
    await new Promise(r => setTimeout(r, 500));
    assert.deepEqual(await p.eval('LMState.docData.categories.map(c => c.name)'), ['A', 'B', 'N']);
    assert.deepEqual(psCall('readDocData').categories.map(c => c.name), ['A', 'B', 'N'], 'applied preset is written to XMP');

    await p.eval(`document.querySelector('[data-action=cat-add]').click(); true`);
    assert.equal(await p.eval('LMState.docData.categories.length'), 4);
    assert.equal(await p.eval('LMState.docData.categories[3].color'), 'orange', 'next unused color');
    await p.shot('panel-categories');
  } finally {
    p.close();
  }
});
```

- [ ] **Step 6: 실행**

```bash
node --test test/e2e/panel.test.js
```

Expected: 1 PASS. `panel target not found`면 패널이 포토샵에 열려 있지 않은 것이다 (Task 1 Step 9).

- [ ] **Step 7: 커밋**

```bash
git add -A && git commit -m "panel: 상태·호스트 브리지·프리셋 저장과 카테고리 탭을 만든다."
```

---

### Task 11: 레이어 탭 — 트리·배지·선택 동기화·마킹 (spec §6.2)

**Files:**
- Modify: `client/ui/layers.js` (전부 교체)
- Modify: `test/e2e/panel.test.js` (테스트 추가)

**Interfaces:**
- Consumes: `LMState.layers`, `LMState.selectedIds`, `LMState.collapsed`, `LMState.docData.marks`, `LMCore.visibility.markIssues`, `LMCore.jobs.orphanMarkIds`, `LMHost.call('selectLayers')`, `LMHost.call('setLayerColor')`, `LMColors`.
- Produces: `LMUI.layers.render(el)`, `LMUI.layers.setMark(layerIds, categoryId, valueId, on)` (테스트 훅).

- [ ] **Step 1: 실패하는 테스트**

`test/e2e/panel.test.js`에 추가:

```js
test('layer tab: badges, selection sync, marking writes XMP and native color', async () => {
  const { byName, layers } = buildFixture();
  psCall('writeDocData', docDataFor(byName));
  const p = await freshPanel();
  try {
    await p.eval(`document.querySelector('#tabs [data-tab=layers]').click(); true`);
    assert.equal(await p.eval(`document.querySelectorAll('#tab-layers .layer-row').length`), 12);
    assert.equal(await p.eval(`document.querySelector('#tab-layers [data-layer="${byName.A0}"] .badge').textContent`), 'A: 0');
    assert.equal(await p.eval(`document.querySelectorAll('#tab-layers [data-layer="${byName.BG}"] .badge').length`), 0);

    // Photoshop 선택 → 패널 선택
    psCall('selectLayers', [byName.B1]);
    await new Promise(r => setTimeout(r, 800));
    assert.deepEqual(await p.eval('LMState.selectedIds'), [byName.B1]);
    assert.equal(await p.eval(`document.querySelector('#tab-layers [data-layer="${byName.B1}"]').classList.contains('selected')`), true);

    // 패널 클릭 → Photoshop 선택
    await p.eval(`document.querySelector('#tab-layers [data-layer="${byName.H}"] .name').click(); true`);
    await new Promise(r => setTimeout(r, 500));
    assert.deepEqual(psCall('getSelectedLayerIds'), [byName.H]);

    // 마킹: H 에 A=a0 추가 → XMP 반영 + 네이티브 색 (nativeColor 켜기)
    await p.eval('LMState.docData.nativeColor = true; true');
    await p.eval(`document.querySelector('#tab-layers .mark-panel input[data-category=cA][data-value=a0]').click(); true`);
    await new Promise(r => setTimeout(r, 800));
    assert.deepEqual(psCall('readDocData').marks[String(byName.H)], { cA: ['a0'] });
    assert.equal(psCall('getLayers').find(l => l.name === 'H').color, 'red');

    // 해제 → 마크 삭제 + 색 none
    await p.eval(`document.querySelector('#tab-layers .mark-panel input[data-category=cA][data-value=a0]').click(); true`);
    await new Promise(r => setTimeout(r, 800));
    assert.equal(psCall('readDocData').marks[String(byName.H)], undefined);
    assert.equal(psCall('getLayers').find(l => l.name === 'H').color, 'none');

    // 그룹 접기
    await p.eval(`document.querySelector('#tab-layers [data-layer="${byName.G}"] .caret').click(); true`);
    assert.equal(await p.eval(`document.querySelectorAll('#tab-layers .layer-row').length`), 10);

    // 고아 마크 표시
    await p.eval(`LMState.docData.marks['999999'] = { cA: ['a0'] }; LMApp.render(); true`);
    assert.match(await p.eval(`document.querySelector('#tab-layers .orphans').textContent`), /고아 마크 1개/);
    await p.eval(`document.querySelector('[data-action=orphans-clean]').click(); true`);
    await new Promise(r => setTimeout(r, 500));
    assert.equal(await p.eval(`LMState.docData.marks['999999']`), undefined);
    await p.shot('panel-layers');
  } finally {
    p.close();
  }
});
```

- [ ] **Step 2: 실패 확인**

```bash
node --test test/e2e/panel.test.js
```

Expected: 새 테스트 FAIL (`.layer-row` 0개).

- [ ] **Step 3: 구현**

`client/ui/layers.js`:

```js
// 레이어 탭 (spec §6.2): 트리 + 배지 + 선택 동기화 + 마킹 영역.
LMUI.layers = (() => {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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

  function badges(layer) {
    const mark = LMState.docData.marks[String(layer.id)];
    if (!mark) return '';
    const cats = LMState.docData.categories;
    const issues = LMCore.visibility.markIssues(mark, cats);
    return Object.keys(mark).map(cid => {
      const c = cats.find(c => c.id === cid);
      if (!c) return `<span class="badge stale" style="background:${LMColors.hex('gray')}">${esc(cid)}</span>`;
      const names = mark[cid].map(vid => { const v = c.values.find(v => v.id === vid); return v ? esc(v.name) : `<s>${esc(vid)}</s>`; }).join(',');
      const stale = issues.some(i => i.categoryId === cid) ? ' stale' : '';
      return `<span class="badge${stale}" style="background:${LMColors.hex(c.color)}">${esc(c.name)}: ${names}</span>`;
    }).join(' ');
  }

  function row(l) {
    const selected = LMState.selectedIds.includes(l.id) ? ' selected' : '';
    const caret = l.kind === 'group' ? `<span class="caret">${LMState.collapsed.has(l.id) ? '▸' : '▾'}</span>` : '<span class="caret"></span>';
    return `<div class="layer-row ${l.kind}${selected}" data-layer="${l.id}" style="padding-left:${4 + l.depth * 14}px">
      ${caret}<span class="eye${l.visible ? ' on' : ''}">${l.visible ? '👁' : '·'}</span>
      <span class="name">${esc(l.name)}</span>${badges(l)}</div>`;
  }

  function markPanel() {
    const ids = LMState.selectedIds.filter(id => LMState.layers.some(l => l.id === id));
    if (!ids.length) return '<p class="hint mark-panel">레이어를 선택하면 마킹할 수 있습니다.</p>';
    const marks = ids.map(id => LMState.docData.marks[String(id)] || {});
    const lines = LMState.docData.categories.map(c => {
      const boxes = c.values.map(v => {
        const count = marks.filter(m => (m[c.id] || []).includes(v.id)).length;
        const checked = count === ids.length ? 'checked' : '';
        const mixed = count > 0 && count < ids.length ? 'data-mixed="1"' : '';
        return `<label><input type="checkbox" data-category="${esc(c.id)}" data-value="${esc(v.id)}" ${checked} ${mixed}>${esc(v.name)}</label>`;
      }).join('');
      return `<div class="cat-line"><span class="dot" style="background:${LMColors.hex(c.color)}"></span><b>${esc(c.name)}</b>${boxes}</div>`;
    }).join('');
    return `<div class="mark-panel"><div class="row"><b>선택 ${ids.length}개</b><button data-action="marks-clear">마크 지우기</button></div>${lines || '<p class="hint">카테고리 탭에서 카테고리를 먼저 만드세요.</p>'}</div>`;
  }

  function orphans() {
    const ids = LMCore.jobs.orphanMarkIds(LMState.docData.marks, LMState.layers);
    if (!ids.length) return '';
    return `<div class="row warn orphans">고아 마크 ${ids.length}개 (문서에 없는 레이어) <button data-action="orphans-clean">정리</button></div>`;
  }

  function render(el) {
    el.innerHTML = `<p class="hint">PSD를 저장해야 마크가 파일에 남습니다.</p>${orphans()}<div class="tree">${visibleRows().map(row).join('')}</div>${markPanel()}`;
    el.querySelectorAll('input[data-mixed]').forEach(i => { i.indeterminate = true; });
  }

  async function applyNativeColor(layerIds) {
    if (!LMState.docData.nativeColor) return;
    for (const id of layerIds) {
      const mark = LMState.docData.marks[String(id)];
      const first = mark && Object.keys(mark)[0];
      const c = first && LMState.docData.categories.find(c => c.id === first);
      const color = c ? LMColors.native(c.color) : 'none';
      try { await LMHost.call('setLayerColor', { id, color }); } catch (e) { LMApp.status(e.message); }
    }
    const layers = await LMHost.call('getLayers');
    LMState.layers = layers;
  }

  async function setMark(layerIds, categoryId, valueId, on) {
    const marks = LMState.docData.marks;
    for (const id of layerIds) {
      const key = String(id);
      const mark = marks[key] || (marks[key] = {});
      const set = new Set(mark[categoryId] || []);
      if (on) set.add(valueId); else set.delete(valueId);
      if (set.size) mark[categoryId] = Array.from(set); else delete mark[categoryId];
      if (!Object.keys(mark).length) delete marks[key];
    }
    await LMApp.saveDocData();
    await applyNativeColor(layerIds);
    LMApp.render();
  }

  document.addEventListener('click', async e => {
    const inTab = e.target.closest('#tab-layers');
    if (!inTab) return;
    const caret = e.target.closest('.caret');
    const rowEl = e.target.closest('.layer-row');
    if (caret && rowEl && rowEl.classList.contains('group')) {
      const id = Number(rowEl.dataset.layer);
      if (LMState.collapsed.has(id)) LMState.collapsed.delete(id); else LMState.collapsed.add(id);
      return LMApp.render();
    }
    if (rowEl) {
      const id = Number(rowEl.dataset.layer);
      if (e.ctrlKey || e.metaKey) {
        LMState.selectedIds = LMState.selectedIds.includes(id) ? LMState.selectedIds.filter(x => x !== id) : LMState.selectedIds.concat(id);
      } else {
        LMState.selectedIds = [id];
      }
      LMApp.render();
      try { await LMHost.call('selectLayers', LMState.selectedIds); } catch (err) { LMApp.status(err.message); }
      return;
    }
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'marks-clear') {
      const ids = LMState.selectedIds.slice();
      for (const id of ids) delete LMState.docData.marks[String(id)];
      await LMApp.saveDocData();
      await applyNativeColor(ids);
      return LMApp.render();
    }
    if (btn.dataset.action === 'orphans-clean') {
      for (const id of LMCore.jobs.orphanMarkIds(LMState.docData.marks, LMState.layers)) delete LMState.docData.marks[String(id)];
      await LMApp.saveDocData();
      return LMApp.render();
    }
  });

  document.addEventListener('change', e => {
    const box = e.target.closest('#tab-layers .mark-panel input[data-category]');
    if (!box) return;
    setMark(LMState.selectedIds.slice(), box.dataset.category, box.dataset.value, box.checked);
  });

  return { render, setMark };
})();
```

- [ ] **Step 4: 통과 확인**

```bash
node --test test/e2e/panel.test.js
```

Expected: 2 PASS.

실패 유형:
- 포토샵 선택 → 패널 선택이 안 됨: `select` 이벤트 등록 실패. `node tools/panel.js eval "LMHost.cs.getExtensionID()"`가 `local.layermemorier.panel`인지, 호스트 `eventIds`가 숫자인지 확인. 이벤트 콜백 이름은 `com.adobe.PhotoshopJSONCallback` + 확장 ID다.
- 이벤트는 오는데 너무 늦게 반영: 대기 시간을 늘리지 말고 debounce(200ms)와 `refresh` 시간을 잰다. `refresh`는 호스트 호출 4번이다.

- [ ] **Step 5: 스크린샷 확인**

`test/out/shots/panel-layers.png`를 Read로 연다. 확인: 들여쓰기된 트리, 그룹 G가 접혀 ▸ 표시, 배지 색이 카테고리별로 다르고 글자가 읽힌다, 선택 행 하이라이트, 아래 마킹 영역의 체크박스 줄. 가독성이 나쁘면 `style.css`의 `.badge`, `.layer-row`를 고치고 다시 찍는다.

- [ ] **Step 6: 커밋**

```bash
git add -A && git commit -m "panel: 레이어 트리·배지·선택 동기화·마킹을 만든다."
```

---

### Task 12: 내보내기 탭 — 설정·부분 출력·제외·미리보기·실행 (spec §6.3, §8, §9)

**Files:**
- Modify: `client/ui/export.js` (전부 교체)
- Modify: `test/e2e/panel.test.js` (테스트 추가)

**Interfaces:**
- Consumes: `LMCore.variation.enumerate`, `LMCore.jobs.buildJobs`, `LMCore.jobs.markedLayerIds`, `LMHost.call('exportBegin'|'exportOne'|'exportEnd')`, `window.cep.fs.showOpenDialog`.
- Produces: `LMUI.export.render(el)`, `LMUI.export.run()` (Promise, 테스트 훅), `LMUI.export.preview()` → `{variations, jobs, conflicts, warnings}`.

- [ ] **Step 1: 실패하는 테스트**

`test/e2e/panel.test.js`에 추가:

```js
test('export tab: preview, exclusion, partial include, run with progress and summary', async () => {
  const DEST = path.join(__dirname, '..', 'out', 'panel-export');
  fs.rmSync(DEST, { recursive: true, force: true });
  const { byName } = buildFixture();
  psCall('writeDocData', docDataFor(byName, DEST.replace(/\\/g, '/')));
  const p = await freshPanel();
  try {
    await p.eval(`document.querySelector('#tabs [data-tab=export]').click(); true`);
    assert.equal(await p.eval(`document.querySelector('#tab-export .count').textContent`), '12');
    assert.equal(await p.eval(`document.querySelector('#tab-export [data-field=baseName]').value`), 'fx');

    // 제외 조합 추가: A=1, B=2 → 12 - 2 = 10
    await p.eval(`document.querySelector('#tab-export .exclude-new [data-category=cA]').value = 'a1';
                  document.querySelector('#tab-export .exclude-new [data-category=cB]').value = 'b2';
                  document.querySelector('[data-action=exclude-add]').click(); true`);
    await new Promise(r => setTimeout(r, 500));
    assert.equal(await p.eval(`document.querySelector('#tab-export .count').textContent`), '10');
    assert.deepEqual(psCall('readDocData').excluded, [{ cA: 'a1', cB: 'b2' }]);

    // 부분 출력: N=2 만 → 5
    await p.eval(`document.querySelector('#tab-export .include input[data-category=cN][data-value=n1]').click(); true`);
    assert.equal(await p.eval(`document.querySelector('#tab-export .count').textContent`), '5');

    // 실행
    await p.eval('LMUI.export.run()');
    const summary = await p.eval('LMState.summary');
    assert.equal(summary.done, 5);
    assert.deepEqual(summary.failures, []);
    const files = [];
    for (const dir of fs.readdirSync(DEST)) for (const f of fs.readdirSync(path.join(DEST, dir))) files.push(dir + '/' + f);
    assert.deepEqual(files.sort(), ['fx_A0/fx_A0_0_2.png', 'fx_A0/fx_A0_1_2.png', 'fx_A0/fx_A0_2_2.png', 'fx_A1/fx_A1_0_2.png', 'fx_A1/fx_A1_1_2.png']);
    assert.match(await p.eval(`document.querySelector('#tab-export .summary').textContent`), /5개 성공/);
    await p.shot('panel-export');
  } finally {
    p.close();
  }
});

test('export tab blocks on name conflicts', async () => {
  const { byName } = buildFixture();
  const data = docDataFor(byName);
  data.categories[1].values[1].label = '0'; // B1 라벨을 B0와 같게
  psCall('writeDocData', data);
  const p = await freshPanel();
  try {
    await p.eval(`document.querySelector('#tabs [data-tab=export]').click(); true`);
    assert.equal(await p.eval(`document.querySelector('[data-action=export-run]').disabled`), true);
    assert.match(await p.eval(`document.querySelector('#tab-export .conflicts').textContent`), /충돌/);
  } finally {
    p.close();
  }
});
```

- [ ] **Step 2: 실패 확인**

```bash
node --test test/e2e/panel.test.js
```

Expected: 새 테스트 2개 FAIL (`.count` 없음).

- [ ] **Step 3: 구현**

`client/ui/export.js`:

```js
// 내보내기 탭 (spec §6.3, §8, §9).
LMUI.export = (() => {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function preview() {
    const d = LMState.docData;
    const variations = LMCore.variation.enumerate(d.categories, { excluded: d.excluded, include: LMState.include });
    const built = LMCore.jobs.buildJobs(d, LMState.layers, variations);
    return Object.assign({ variations }, built);
  }

  function valueName(cid, vid) {
    const c = LMState.docData.categories.find(c => c.id === cid);
    const v = c && c.values.find(v => v.id === vid);
    return (c ? c.name : cid) + '=' + (v ? v.name : vid);
  }

  function layerName(id) {
    const l = LMState.layers.find(l => l.id === id);
    return l ? l.name : '#' + id;
  }

  function warningText(w) {
    if (w.type === 'orphan') return `고아 마크: 레이어 #${w.layerId} 가 문서에 없음`;
    if (w.type === 'stale') return `"${layerName(w.layerId)}" 마크가 없는 ${w.detail.valueId ? '값' : '카테고리'}을 참조 (${w.detail.categoryId}${w.detail.valueId ? '/' + w.detail.valueId : ''})`;
    if (w.type === 'parentHidden') return `"${layerName(w.layerId)}" 의 부모 그룹 "${layerName(w.detail.groupId)}" 이 마크 없이 꺼져 있어 어떤 배리에이션에서도 안 보임`;
    return JSON.stringify(w);
  }

  function settings(d) {
    return `
      <div class="row"><label>출력명 <input data-field="baseName" value="${esc(d.baseName)}"></label>
        <label>구분자 <input data-field="delimiter" value="${esc(d.delimiter)}" style="width:3em"></label></div>
      <div class="row"><label>출력 폴더 <input data-field="destination" value="${esc(d.destination)}" style="width:220px"></label>
        <button data-action="pick-folder">폴더…</button></div>
      <div class="row"><label><input type="checkbox" data-field="nativeColor" ${d.nativeColor ? 'checked' : ''}> 마킹할 때 포토샵 레이어 색도 바꾸기</label></div>`;
  }

  function includeBlock(d) {
    const lines = d.categories.map(c => {
      const inc = LMState.include[c.id];
      const boxes = c.values.map(v => {
        const on = !inc || inc.includes(v.id);
        return `<label><input type="checkbox" data-category="${esc(c.id)}" data-value="${esc(v.id)}" ${on ? 'checked' : ''}>${esc(v.name)}</label>`;
      }).join('');
      return `<div class="row"><span class="dot" style="background:${LMColors.hex(c.color)}"></span><b>${esc(c.name)}</b>${boxes}</div>`;
    }).join('');
    return `<details open class="include"><summary>부분 출력 (체크한 값만)</summary>${lines}</details>`;
  }

  function excludeBlock(d) {
    const rows = d.excluded.map((x, i) => `<div class="row"><span>${Object.keys(x).map(cid => esc(valueName(cid, x[cid]))).join(' + ')}</span><button data-action="exclude-delete" data-index="${i}">×</button></div>`).join('');
    const selects = d.categories.map(c => `<select data-category="${esc(c.id)}"><option value="">${esc(c.name)}: 무관</option>${c.values.map(v => `<option value="${esc(v.id)}">${esc(v.name)}</option>`).join('')}</select>`).join('');
    return `<details open class="exclude"><summary>제외 조합</summary>${rows}<div class="row exclude-new">${selects}<button data-action="exclude-add">추가</button></div></details>`;
  }

  function previewBlock(pv) {
    const conflicts = pv.conflicts.length ? `<p class="err conflicts">충돌: 같은 파일명이 두 번 이상 나옵니다 — ${pv.conflicts.map(esc).join(', ')}</p>` : '';
    const warnings = pv.warnings.length ? `<ul class="warn">${pv.warnings.map(w => `<li>${esc(warningText(w))}</li>`).join('')}</ul>` : '';
    return `<div class="row"><b>배리에이션 <span class="count">${pv.variations.length}</span>개</b></div>${conflicts}${warnings}
      <div class="preview">${pv.jobs.map(j => esc(j.relativePath)).join('\n')}</div>`;
  }

  function runBlock(pv) {
    const d = LMState.docData;
    const canRun = !LMState.exporting && pv.jobs.length > 0 && pv.conflicts.length === 0 && d.destination.trim() !== '' && d.baseName.trim() !== '';
    let progress = '';
    if (LMState.progress) {
      const { done, total, current } = LMState.progress;
      progress = `<div class="progress"><div style="width:${total ? Math.round(done / total * 100) : 0}%"></div></div><div class="row"><span>${done} / ${total}</span><span>${esc(current || '')}</span></div>`;
    }
    let summary = '';
    if (LMState.summary && !LMState.exporting) {
      const s = LMState.summary;
      summary = `<div class="summary"><b>${s.done - s.failures.length}개 성공</b>${s.failures.length ? `, ${s.failures.length}개 실패<ul class="err">${s.failures.map(f => `<li>${esc(f.path)}: ${esc(f.error)}</li>`).join('')}</ul>` : ''}${s.aborted ? ' (중단됨)' : ''}</div>`;
    }
    return `<div class="row">
      <button class="primary" data-action="export-run" ${canRun ? '' : 'disabled'}>내보내기</button>
      <button data-action="export-abort" ${LMState.exporting ? '' : 'disabled'}>중단</button></div>${progress}${summary}`;
  }

  function render(el) {
    const d = LMState.docData;
    const pv = preview();
    el.innerHTML = settings(d) + includeBlock(d) + excludeBlock(d) + previewBlock(pv) + runBlock(pv);
  }

  async function run() {
    const d = LMState.docData;
    const pv = preview();
    if (pv.conflicts.length || !pv.jobs.length) return;
    LMState.exporting = true; LMState.abort = false; LMState.summary = null;
    LMState.progress = { done: 0, total: pv.jobs.length, current: '' };
    const failures = [];
    let done = 0;
    LMApp.render();
    try {
      await LMApp.saveDocData();
      await LMHost.call('exportBegin', { layerIds: LMCore.jobs.markedLayerIds(d.marks, LMState.layers) });
      const dest = d.destination.replace(/\\/g, '/').replace(/\/+$/, '');
      for (const job of pv.jobs) {
        if (LMState.abort) break;
        LMState.progress.current = job.relativePath;
        renderProgressOnly();
        try {
          await LMHost.call('exportOne', { on: job.on, off: job.off, path: dest + '/' + job.relativePath });
        } catch (e) {
          failures.push({ path: job.relativePath, error: e.message });
        }
        done++;
        LMState.progress.done = done;
        renderProgressOnly();
      }
    } catch (e) {
      failures.push({ path: '(시작)', error: e.message });
    } finally {
      try { await LMHost.call('exportEnd'); } catch (e) { failures.push({ path: '(복원)', error: e.message }); }
      LMState.exporting = false;
      LMState.summary = { done, failures, aborted: LMState.abort };
      LMState.progress = null;
      await LMApp.refresh();
    }
  }

  function renderProgressOnly() {
    const el = document.querySelector('#tab-export .progress');
    if (!el) return;
    const { done, total, current } = LMState.progress;
    el.firstElementChild.style.width = (total ? Math.round(done / total * 100) : 0) + '%';
    const row = el.nextElementSibling;
    if (row) { row.children[0].textContent = `${done} / ${total}`; row.children[1].textContent = current || ''; }
  }

  document.addEventListener('click', async e => {
    const btn = e.target.closest('#tab-export [data-action]');
    if (!btn) return;
    const d = LMState.docData;
    switch (btn.dataset.action) {
      case 'pick-folder': {
        const r = window.cep.fs.showOpenDialog(false, true, '출력 폴더 선택', d.destination || '', []);
        if (r.err === window.cep.fs.NO_ERROR && r.data && r.data[0]) { d.destination = r.data[0]; await LMApp.saveDocData(); LMApp.render(); }
        return;
      }
      case 'exclude-add': {
        const entry = {};
        document.querySelectorAll('#tab-export .exclude-new select').forEach(s => { if (s.value) entry[s.dataset.category] = s.value; });
        if (!Object.keys(entry).length) return LMApp.status('제외할 값을 하나 이상 고르세요.');
        d.excluded.push(entry);
        await LMApp.saveDocData();
        return LMApp.render();
      }
      case 'exclude-delete':
        d.excluded.splice(Number(btn.dataset.index), 1);
        await LMApp.saveDocData();
        return LMApp.render();
      case 'export-run': return run();
      case 'export-abort': LMState.abort = true; return;
    }
  });

  document.addEventListener('change', async e => {
    const field = e.target.closest('#tab-export [data-field]');
    if (field) {
      const d = LMState.docData;
      d[field.dataset.field] = field.type === 'checkbox' ? field.checked : field.value;
      await LMApp.saveDocData();
      return LMApp.render();
    }
    const box = e.target.closest('#tab-export .include input[data-category]');
    if (box) {
      const c = LMState.docData.categories.find(c => c.id === box.dataset.category);
      const current = LMState.include[c.id] || c.values.map(v => v.id);
      const next = box.checked ? current.concat(box.dataset.value) : current.filter(v => v !== box.dataset.value);
      if (next.length === c.values.length) delete LMState.include[c.id]; else LMState.include[c.id] = next;
      return LMApp.render();
    }
  });

  return { render, run, preview };
})();
```

- [ ] **Step 4: 통과 확인**

```bash
node --test test/e2e/panel.test.js
```

Expected: 4 PASS. 실행 테스트는 PNG 5장을 저장하므로 10초 안팎.

실패 유형:
- `summary.done`이 0: `exportBegin`이 던졌다. `LMState.summary.failures[0].error`를 읽는다.
- 진행 중 패널이 멈춘 듯 보임: evalScript는 호스트 실행 동안 UI 스레드를 막지 않지만 포토샵 자체가 바쁘다. 정상.

- [ ] **Step 5: 스크린샷 확인**

`test/out/shots/panel-export.png`를 Read로 연다. 확인: 설정 3줄, 부분 출력 체크박스, 제외 조합 1줄 + 추가 폼, "배리에이션 5개", 미리보기 목록, 요약 "5개 성공". 항목이 패널 폭을 넘치면 `.row`의 `flex-wrap`과 입력 폭을 조정한다.

- [ ] **Step 6: 전체 테스트**

```bash
cd /d/Project/LayerMemorier && npm test && npm run test:e2e
```

Expected: unit 27 PASS, e2e (host 8 + export 2 + panel 4) 14 PASS.

- [ ] **Step 7: 커밋**

```bash
git add -A && git commit -m "panel: 내보내기 탭(설정·부분 출력·제외·미리보기·진행률)을 만든다."
```

---

### Task 13: 마무리 — README, 실제 PSD 리허설, 인계, 저장소 푸시

**Files:**
- Modify: `README.md`
- Modify: `Plans/20260915_LayerMemorier_spec.md` (§14 결정 기록에 구현 중 바뀐 결정 추가)

- [ ] **Step 1: README 완성**

`README.md`에 아래 절을 추가한다:

```markdown
## 사용법

1. PSD를 열고 패널의 **카테고리** 탭에서 카테고리와 값을 만든다. 자주 쓰는 구성은 "현재 구성을 프리셋으로 저장"으로 저장해 두고 다음 파일에서 "적용"한다.
   - 라벨 형식: `{v}` = 값만, `{c}{v}` = 카테고리이름+값 (예 `옷1`), `{c}_{v}` = `옷_1`.
   - 값의 "파일명 라벨"을 비우면 그 값일 때 파일명에서 그 부분이 빠진다 (예: 기본 상태).
   - "폴더" 체크 = 그 카테고리 단계에서 폴더로 묶는다. 순서는 ▲▼로 바꾼다. 파일명 순서 = 폴더 순서.
2. **레이어** 탭에서 레이어를 고르고(포토샵에서 골라도 된다, Ctrl+클릭으로 여러 개) 값 체크박스를 켠다.
   - 마크 없는 레이어는 내보낼 때 건드리지 않는다. 마크가 있으면 조합에 맞을 때 켜고 아니면 끈다.
   - 그룹에 마크를 붙이면 그룹 전체가 그 규칙을 따른다.
   - 마크는 PSD 안(XMP)에 저장된다. **PSD를 저장해야 남는다.**
3. **내보내기** 탭에서 출력명·출력 폴더를 정하고 미리보기를 확인한 뒤 "내보내기".
   - 부분 출력: 일부 값만 체크하면 그 조합만 내보낸다 (저장되지 않음).
   - 제외 조합: 특정 값 조합을 영구히 뺀다 (저장됨).
   - 끝나면 레이어 가시성은 시작 전 상태로 돌아온다.

## 문제가 생기면

- 패널이 메뉴에 없다: `install\install.ps1`을 다시 실행하고 포토샵을 재시작한다.
- 패널이 비어 있다: 문서를 열어야 내용이 보인다. 상단 "새로고침"을 누른다.
- 파일명이 겹친다고 나온다: 두 값의 라벨이 같다. 카테고리 탭에서 라벨을 고친다.
- 어떤 레이어가 어느 조합에서도 안 나온다: 그 레이어의 부모 그룹이 마크 없이 꺼져 있다. 그룹을 켜거나 그룹에 마크를 붙인다.
- 개발자용 진단: `node tools/panel.js shot dbg` (패널 스크린샷), `npm run test:e2e`.
```

- [ ] **Step 2: 실제 PSD 리허설 (있으면)**

프시케 포즈 PSD가 이 PC에 있으면 (`D:\Project\mezzakuzza` 안에는 없다. 없으면 이 단계는 건너뛰고 인계 항목에 남긴다):

1. PSD를 열고 패널로 알싸기 구성(의상·옷·가슴·보태배·프레임)을 만들어 프리셋 "프시케 포즈"로 저장한다.
2. 레이어에 마킹하고 `D:\tmp\lm-rehearsal`로 내보낸다.
3. 결과 파일명 목록과 `test/golden/alssagi.txt`를 비교한다:

```bash
ls /d/tmp/lm-rehearsal | sort > /d/tmp/lm-actual.txt && sort /d/Project/LayerMemorier/test/golden/alssagi.txt | diff - /d/tmp/lm-actual.txt && echo SAME
```

4. 레이어 수백 개짜리 PSD에서 `refresh` 시간을 잰다: `node tools/panel.js eval "(async()=>{const t=Date.now();await LMApp.refresh();return Date.now()-t})()"`. 2초를 넘으면 `getLayers`를 한 번의 AM 순회로 유지하되 결과를 캐시하고 `select` 이벤트에서는 `getSelectedLayerIds`만 다시 읽도록 `refresh`를 나눈다.

- [ ] **Step 3: 스크린샷 4장으로 최종 점검**

```bash
cd /d/Project/LayerMemorier && node -e "const f=require('./test/helpers/fixture');const {byName}=f.buildFixture();require('./test/helpers/ps').psCall('writeDocData',f.docDataFor(byName,'D:/tmp/lm-final'))" && node tools/panel.js reload && node tools/panel.js eval "document.querySelector('#tabs [data-tab=categories]').click();true" && node tools/panel.js shot final-categories && node tools/panel.js eval "document.querySelector('#tabs [data-tab=layers]').click();true" && node tools/panel.js shot final-layers && node tools/panel.js eval "document.querySelector('#tabs [data-tab=export]').click();true" && node tools/panel.js shot final-export
```

세 장을 Read로 열어 spec §6의 항목이 전부 화면에 있는지 대조한다. 빠진 것이 있으면 해당 태스크로 돌아가 고친다.

- [ ] **Step 4: spec 결정 기록 갱신**

구현 중 spec과 달라진 점(예: Save for Web 임시 파일 경유, 그룹 접기 방식, `suspendHistory`를 `exportOne`마다 감쌈)을 `Plans/20260915_LayerMemorier_spec.md` §14 표에 날짜와 이유를 적는다.

- [ ] **Step 5: 사용자 확인이 필요한 것 정리**

최종 보고에 spec §11.5 항목을 그대로 적는다: 실제 프시케 PSD 사용감(레이어 수백 개 반응 속도, 배지 가독성), 출력 PNG 색 공간이 기존 파이프라인과 같은지. 아티스트 PC 설치 절차는 README "설치" 절 그대로다.

- [ ] **Step 6: 커밋, GitHub private 저장소 생성, 푸시**

```bash
cd /d/Project/LayerMemorier && git add -A && git commit -m "README 사용법과 인계 항목을 정리한다."
```

GitHub MCP `create_repository`로 `LayerMemorier` (private) 를 만든 뒤:

```bash
git remote add origin https://github.com/<계정>/LayerMemorier.git
git push -u origin main
```

Expected: `main` 브랜치가 원격에 올라간다. `git log --oneline`에 Task 1~13 커밋이 순서대로 있다.

- [ ] **Step 7: plan·spec 완료 표시**

```bash
cd /d/Project/LayerMemorier/Plans && git mv 20260915_LayerMemorier_spec.md "V 20260915_LayerMemorier_spec.md" && git mv 20260915_LayerMemorier_plan.md "V 20260915_LayerMemorier_plan.md" && git commit -m "spec·plan 완료 표시." && git push
```
