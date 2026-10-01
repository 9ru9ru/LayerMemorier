# LayerMemorier 내보내기 옵션 확장 spec

작성 2026-10-02. 기반: `Plans/V 20260915_LayerMemorier_spec.md`(이하 "기존 spec"), `Plans/20261001_LayerMemorier_combos_spec.md`(이하 "조합 spec"). 이 문서는 바뀌는 부분만 적는다.

## 0. 한 줄 요약

내보내기 옵션을 레퍼런스(antipalindrome/Photoshop-Export-Layers-to-Files-Fast) 수준으로 넓힌다. 파일 형식 7종과 형식별 세부 옵션, 잘라내기(각자/공통 영역), 크기 %, 여백 px, 파일명 대소문자·접미사, 덮어쓰기 끔(번호 붙이기), 폴더 묶기를 내보내기 탭으로 옮기고 폴더 이름 방식(누적/값만) 추가. 설정은 PSD마다 저장하고, 설정이 없는 PSD는 마지막에 쓴 설정으로 시작한다.

## 1. 배경

0.2.0을 실제 PSB로 써 본 사용자 피드백 (2026-10-02): "내보내기 옵션이 너무 형편없다. 처음에 준 레퍼런스 정도의 옵션은 적용돼야 한다." 기존 spec §1은 PNG-24 이외 형식·트림·리사이즈를 비목표로 두었는데, 이 결정을 뒤집는다.

"부분 출력"이 무슨 뜻인지 모르겠다는 질문도 있었다. 이름을 바꾼다 (§6).

## 2. 결정 요약 (사용자 확인)

| 질문 | 결정 |
|---|---|
| 레퍼런스 옵션 중 무엇을 옮기나 | 형식 7종(PNG-24, PNG-8, JPG, TIFF, TGA, BMP, PSD)과 형식별 옵션, 잘라내기, 크기, 여백, 대소문자, 접미사, 덮어쓰기, 설정 기억 |
| 옮기지 않는 것 | 레이어 고르기(전체/선택 그룹/보이는 것만), 레이어 이름·순번 파일명, 그룹을 폴더로, 전경·배경 레이어, 조용히 실행 — 이 도구는 조합 단위로 내보내므로 맞지 않음 |
| 애매했던 것 | 특정 글자로 시작하는 레이어 끄기, 파일명 변수, PDF — 모두 넣지 않음 |
| 설정 저장 | PSD마다(XMP). 설정이 없는 PSD는 마지막에 쓴 설정으로 시작 |
| 가공 방식 | 빠른 길(원본에서 바로 웹용 저장) + 복제 길(합친 복제본에서 가공). 원본 직접 가공 후 되돌리기는 위험해서 안 함 |
| 공통 영역 잘라내기 | 먼저 모든 조합의 영역을 잰 뒤 내보냄 (시간 약 2배) |

## 3. 데이터 모델

### 3.1 문서 데이터의 `output`

문서 데이터(조합 spec §4.1, version 2)에 선택 필드 `output`을 더한다. version은 2 그대로다. 없으면 §3.3 규칙으로 채운다.

```json
"output": {
  "format": "png24",
  "trim": "none",
  "scale": 100,
  "padding": 0,
  "letterCase": "keep",
  "suffix": "",
  "overwrite": true,
  "folderName": "cumulative",
  "png24": { "transparency": true, "interlaced": false, "matte": "white" },
  "png8": { "reduction": "selective", "colors": 256, "dither": "diffusion", "ditherAmount": 100,
            "transparency": true, "transparencyDither": "none", "transparencyDitherAmount": 100,
            "interlaced": false, "matte": "white" },
  "jpg": { "quality": 100, "matte": "white", "icc": false, "optimized": true, "progressive": false },
  "tif": { "compression": "lzw", "quality": 100, "alpha": true, "icc": false, "transparency": true },
  "tga": { "depth": 32, "alpha": true, "rle": true },
  "bmp": { "depth": 32, "alpha": true, "rle": false, "flipRowOrder": false },
  "psd": {}
}
```

위 값이 기본값이다. 형식을 바꿔도 다른 형식의 옵션은 지우지 않는다 (다시 돌아왔을 때 그대로).

### 3.2 값의 범위

| 키 | 허용 값 |
|---|---|
| `format` | `png24` `png8` `jpg` `tif` `tga` `bmp` `psd` |
| `trim` | `none` `each` `combined` |
| `scale` | 정수 1~1000 (%) |
| `padding` | 정수 0~2000 (px) |
| `letterCase` | `keep` `lower` `upper` |
| `suffix` | 문자열. 금지 문자는 파일명과 같이 `-`로 바꾼다 (기존 spec §5.3) |
| `overwrite` | boolean |
| `folderName` | `cumulative`(누적: 출력명부터 그 카테고리까지의 토큰, 지금 방식) `value`(그 카테고리 토큰만) |
| `*.matte` | `none` `white` `black` `gray` `background`(포토샵 배경색) `foreground`(포토샵 전경색) |
| `png8.reduction` | `perceptual` `selective` `adaptive` `restrictive` `blackWhite` `grayscale` `mac` `windows` |
| `png8.colors` | 정수 2~256 |
| `png8.dither`, `png8.transparencyDither` | `none` `diffusion` `pattern` `noise` |
| `png8.ditherAmount`, `png8.transparencyDitherAmount` | 정수 0~100 (확산일 때만 의미) |
| `jpg.quality`, `tif.quality` | 정수 0~100 |
| `tif.compression` | `none` `lzw` `zip` `jpg` (`quality`는 `jpg`일 때만 의미) |
| `tga.depth`, `bmp.depth` | 16 24 32 (`alpha`는 32일 때만 의미) |
| boolean 옵션들 | boolean |

### 3.3 기본값과 정리

- 순수 함수 `LMCore.output.normalize(o)`: 아무 값이나 받아 §3.1 모양의 완전한 객체를 돌려준다. 빠진 키는 기본값, 허용 값이 아니면 기본값, 숫자는 범위로 자르고 정수로 반올림한다. 입력은 바꾸지 않는다.
- 패널이 문서 데이터를 읽을 때 `output`이 없으면 "마지막 설정"(§3.4)을, 그것도 없으면 기본값을 `normalize`해서 메모리에 넣는다. XMP에는 다음 저장 때 쓰인다.
- `output`이 있으면 그것을 `normalize`해서 쓴다.

### 3.4 마지막 설정

- 경로 `%APPDATA%\LayerMemorier\export-defaults.json`, 내용은 `output` 객체 하나. 패널이 `cep.fs`로 읽고 쓴다 (프리셋 파일과 같은 방식).
- 내보내기 탭에서 `output`을 바꿀 때마다 쓴다.
- 깨져 있거나 없으면 무시하고 기본값을 쓴다. 덮어쓰지 않고 그대로 둔다 (다음 변경 때 새로 쓰인다).
- 출력명·구분자·출력 폴더는 문서마다 다르므로 여기에 넣지 않는다.

## 4. 규칙 (core)

새 파일 `core/output.js` (UMD, `LMCore.output`).

- `DEFAULTS`: §3.1의 기본값.
- `normalize(o)`: §3.3.
- `extension(format)`: `png24`·`png8` → `png`, `jpg` → `jpg`, `tif` → `tif`, `tga` → `tga`, `bmp` → `bmp`, `psd` → `psd`.
- `isFastPath(o)`: `format`이 `png24`·`png8`·`jpg`이고 `trim === 'none'`, `scale === 100`, `padding === 0`이면 true.
- `unionBounds(list)`: `[{left, top, right, bottom} | null]` → 합친 사각형, 전부 null이면 null.

`core/naming.js`의 `relativePath(doc, variation)`을 바꾼다 (`doc.output`을 `normalize`해서 쓴다):

- 폴더: `folder = true`인 카테고리마다 한 단계(기존 spec §5.4, 순서는 카테고리 순서 그대로).
  - `folderName === 'cumulative'`: 폴더 이름 = `[출력명, 첫 카테고리부터 그 카테고리까지의 토큰…]`을 구분자로 이은 것 (지금과 같음). 예: 옷에 폴더를 켜면 `출산_기본의상_옷2/`.
  - `folderName === 'value'`: 폴더 이름 = 그 카테고리의 토큰만. 예: `옷2/`. 토큰이 빈 문자열(라벨이 빔)이면 그 단계 폴더를 만들지 않는다.
- 파일 이름 = `[출력명, 토큰…]`을 구분자로 이은 것 + `suffix` + `.` + `extension(format)`.
- `letterCase`가 `lower`/`upper`면 폴더 이름과 파일 이름(확장자 포함) 전체에 `toLowerCase`/`toUpperCase`를 적용한다. 한글은 영향 없다.
- `output`이 없거나 기본값이면 지금과 같은 결과 (골든 테스트 80개 그대로 통과).

## 5. 호스트 API (기존 spec §7 변경)

| 변경 | 함수 | 입력 | 출력 |
|---|---|---|---|
| 바꿈 | `LM.exportOne(json)` | `{on, off, path, output, fast, crop, doc}` — `fast`는 패널이 `LMCore.output.isFastPath(output)`로 계산한 값, `crop`은 `{left, top, right, bottom}` 또는 null | `{ok, path}` (실제로 쓴 경로) 또는 `{error}` |
| 추가 | `LM.measureBounds(json)` | `{on, off, doc}` | `{bounds: {left, top, right, bottom}}` 또는 `{bounds: null}`(내용 없음) |

`doc`(`{name, path}`)은 패널이 내보내는 문서다. `exportBegin`·`exportOne`·`measureBounds`·`exportEnd`는 그 문서가 활성이 아니면 찾아서 활성화한 뒤 진행한다 (내보내는 도중 사용자가 다른 탭을 눌러도 다른 문서를 건드리지 않음, 2026-10-02 리뷰). `output`은 패널이 `normalize`한 객체다. 호스트는 다시 검증하지 않는다. `output`이 없으면(기존 호출) PNG-24 기본값 + 빠른 길로 처리한다.

host.jsx는 ASCII만 쓰므로 사용자에게 보일 오류는 코드로 돌려주고 패널이 한국어로 바꾼다: `LM_EMPTY` → `내용이 없어 잘라낼 수 없습니다`, `LM_PNG8_TOO_LARGE` → `PNG-8은 가로·세로 8192px 이하 문서만 내보낼 수 있습니다`, `LM_NAME_EXHAUSTED` → `같은 이름의 파일이 너무 많습니다 (9999개)`.

### 5.1 exportOne

1. 가시성을 on/off로 맞춘다 (지금과 같음, `suspendHistory` 안).
2. 저장 경로를 정한다. 저장은 같은 폴더의 임시 이름(`lm_tmp_save.<확장자>`)으로 하고, 성공한 뒤에만 기존 파일을 지우고 이름을 바꾼다. 실패한 작업은 기존 파일을 남긴다 (2026-10-02 리뷰). `overwrite`가 false이고 파일이 있으면 `이름 (2).ext`, `이름 (3).ext`… 중 처음 비어 있는 이름을 쓴다 (최대 9999, 넘으면 오류).
3. `fast`가 true면 원본에서 저장한다 (§5.3). 판정 규칙을 호스트(ES3)에 따로 두지 않으려고 패널이 계산해 넘긴다.
4. 아니면 복제 길:
   1. `app.activeDocument.duplicate(임시 이름, true)` — 보이는 내용을 합친 복제본.
   2. `crop`이 있으면 그 사각형으로 자른다. `trim === 'each'`면 투명한 가장자리를 잘라낸다. 잘라낼 내용이 없으면 오류 `내용이 없어 잘라낼 수 없습니다`.
   3. `scale !== 100`이면 `resizeImage`(퍼센트, `BICUBICSHARPER`).
   4. `padding > 0`이면 `resizeCanvas(가로 + 2p, 세로 + 2p, MIDDLECENTER)`. 늘어난 부분은 투명 (배경 레이어만 있는 문서는 포토샵 배경색).
   5. §5.3대로 저장한다.
   6. `finally`에서 복제본을 저장하지 않고 닫고, 원본을 다시 활성 문서로 만든다.
5. 폴더가 없으면 만든다 (지금과 같음).

### 5.2 measureBounds

가시성을 on/off로 맞춘 뒤 합친 복제본을 만들고, 그 레이어의 내용 영역(px)을 돌려준다. 내용이 없으면(합친 레이어 영역의 너비나 높이가 0) null. 보이는 레이어가 하나도 없어도 합친 복제본은 만들어진다 (2026-10-02 실측). 복제 길에서 잘라내기 없이 내용이 없으면 빠른 길과 같이 빈 이미지로 저장한다. `finally`에서 복제본을 닫고 원본을 활성 문서로 만든다. 가시성 복원은 `exportEnd`가 한다 (같은 스냅샷).

### 5.3 형식별 저장

| 형식 | 저장 방법 | 옵션 대응 |
|---|---|---|
| PNG-24 | 웹용 저장 (ActionManager, 기존 `saveForWebPng24` 확장) | 투명도 `Trns`, 인터레이스 `Intr`, 매트 `Mtt `+RGB (`none`이면 매트 끔) |
| PNG-8 | 웹용 저장 (ActionManager) | 색상 감소, 색 수, 디더·양, 투명도, 투명도 디더·양, 인터레이스, 매트 (레퍼런스 `exportPng8AM`과 같은 키) |
| JPG | 웹용 저장 (`ExportOptionsSaveForWeb` + `exportDocument`) | 품질, 매트, ICC, 최적화, 프로그레시브 |
| TIFF | `saveAs` + `TiffSaveOptions` (`asCopy`) | 압축, JPG 품질(0~100 → 0~12), 알파, ICC, 투명도 |
| TGA | `saveAs` + `TargaSaveOptions` | 비트 깊이, 알파, RLE |
| BMP | `saveAs` + `BMPSaveOptions` | 비트 깊이, 알파, RLE, 행 순서 뒤집기 |
| PSD | `saveAs` + `PhotoshopSaveOptions` (`layers = false`) | 없음 (복제본은 이미 합쳐져 있음) |

- 웹용 저장은 문서 가로나 세로가 8192px를 넘으면 쓸 수 없다. PNG-24는 지금처럼 `PNGSaveOptions`(압축 6), JPG는 `JPEGSaveOptions`(품질 0~100 → 0~12)로 대신한다. PNG-8은 오류 `PNG-8은 가로·세로 8192px 이하 문서만 내보낼 수 있습니다`.
- TIFF·TGA·BMP·PSD는 늘 복제 길을 탄다 (`isFastPath`가 false). 원본에 `saveAs`를 하지 않는다.

## 6. 패널 UI (기존 spec §6.3 변경)

```
출력   출력명 [________] 구분자 [_] 접미사 [____] 대소문자 [그대로 ▾]
       출력 폴더 [__________________] [폴더…]  ☑ 기존 파일 덮어쓰기
폴더   ☐ 의상  ☑ 옷  ☐ 가슴   이름 [누적 (출산_기본의상_옷2) ▾]
형식   [PNG-24 ▾]
       ☑ 투명도  ☐ 인터레이스  매트 [흰색 ▾]        ← 고른 형식의 옵션만
크기   잘라내기 [안 함 ▾]  크기 [100] %  여백 [0] px
▸ 이번만 내보낼 값 (저장 안 됨)
▸ 항상 뺄 조합 (PSD에 저장)
배리에이션 6개   ▸ 경고 5개
[최종 파일명 미리보기]
[내보내기] [중단]   영역 재는 중 3/6  /  내보내기 2/6
```

- 형식 옵션 렌더링은 새 파일 `client/ui/output-options.js`(`LMUI.outputOptions`)로 나눈다. `export.js`는 배치·실행만 한다.
- **폴더로 묶기** 줄 (출력 칸 아래): 카테고리마다 체크박스(카테고리 색 점 + 이름, 저장은 지금처럼 `category.folder`) + 폴더 이름 드롭다운 `누적 (출산_기본의상_옷2)` / `값만 (옷2)` — 괄호 안 예시는 지금 문서의 첫 배리에이션으로 만든다. 카테고리 탭의 "폴더" 체크박스는 없앤다 (한 곳에서만 바꾼다).
- 잘라내기 드롭다운 글자: `안 함` / `조합마다 각자` / `모든 조합 공통 영역`. 공통 영역에는 `title`로 "모든 파일의 크기·위치가 같아집니다. 영역을 먼저 재므로 시간이 약 2배" 설명.
- 비활성 표시: 형식 옵션 중 의미 없는 칸은 `disabled` (PNG-8 디더 양은 확산일 때만, TIFF 품질은 JPG 압축일 때만, TGA·BMP 알파는 32비트일 때만, PNG-24 매트는 투명도가 켜져 있으면 비활성, BMP RLE는 항상 비활성). PNG-8 매트는 투명도를 켜도 반투명 가장자리 색을 정하므로 막지 않는다.
- "부분 출력" → `이번만 내보낼 값 (저장 안 됨)`, "제외 조합" → `항상 뺄 조합 (PSD에 저장)`. 둘 다 `<details>`. 이번만 내보낼 값은 하나라도 끈 값이 있으면, 항상 뺄 조합은 항목이 있으면 펼친 상태로 그린다. 사용자가 펼치거나 접은 상태는 세션 동안 유지한다.
- 경고 목록은 `<details>` "경고 n개"로 접는다. 충돌(같은 파일명)은 지금처럼 접지 않고 빨간 글씨.
- 미리보기 목록은 §4의 최종 경로(접미사·대소문자·확장자 포함)를 보여 준다. 덮어쓰기를 꺼도 `(2)`는 미리 계산하지 않는다 (실제 저장 때 정해짐).
- 진행: `LMState.progress`에 `phase: 'measure' | 'export'`를 더한다. 글자는 `영역 재는 중 n/N`, `내보내기 n/N`.
- 완료 요약: 성공 수, 실패 목록(경로 + 메시지), 번호를 붙여 저장한 수(`(2)` 등으로 저장 n개).
- 숫자 입력칸은 바뀔 때 `normalize`한 값으로 다시 그린다 (범위 밖 값은 잘린 값이 보인다).
- 새 CSS는 간격에 flex `gap`을 쓰지 않고 margin을 쓴다 (CEP Chromium 63은 flex `gap` 미지원).

## 7. 실행 흐름 (기존 spec §8 변경)

1. 문서 데이터 저장, 작업 목록 생성(충돌이면 막음), 출력 폴더 사전 확인 — 지금과 같다.
2. `exportBegin({layerIds: 관리 레이어})`.
3. `trim === 'combined'`이면: 항상 뺄 조합만 뺀 **모든** 배리에이션(이번만 내보낼 값과 무관)마다 `measureBounds`를 직렬로 부르고 `unionBounds`로 합친다. 일부만 다시 내보내도 이전 파일과 크기·위치가 같아야 하기 때문이다 (2026-10-02 리뷰). 전부 null이면 내보내기를 하지 않고 요약에 `모든 조합이 비어 있습니다`. 중단을 누르면 여기서 멈추고 4단계를 건너뛴다.
4. 작업마다 `exportOne({on, off, path, output, crop})` (crop은 3단계 결과 또는 null). 실패해도 계속한다.
5. `exportEnd()`로 가시성 복원. 미리보기(조합 spec §6.3)와의 관계는 지금과 같다.
6. 요약 표시, `export-defaults.json` 갱신.

## 8. 오류

| 상황 | 처리 |
|---|---|
| 조합마다 각자 잘라내기에서 내용 없음 | 그 작업만 실패 `내용이 없어 잘라낼 수 없습니다`, 계속 |
| 공통 영역에서 모든 조합이 비어 있음 | 내보내기 안 함, 요약에 표시 |
| PNG-8 + 8192px 초과 | 그 작업만 실패, 이유 표시 |
| 복제 길 중 오류 | 복제본을 닫고 원본으로 돌아온 뒤 그 작업만 실패로 기록 |
| `(9999)`까지 이름이 다 참 | 그 작업만 실패 |
| `export-defaults.json` 깨짐 | 무시하고 기본값 |

## 9. 검증

포토샵 2020이 켜진 개발 PC에서 에이전트가 직접 돌린다.

### 9.1 단위 (`npm test`)

- `output.normalize`: 빈 입력 → 기본값, 허용 밖 값 → 기본값, 숫자 범위 자르기·반올림, 입력 불변.
- `output.extension`, `isFastPath`, `unionBounds`(null 섞임, 전부 null).
- `naming.relativePath`: 폴더 이름 `cumulative`/`value`(빈 토큰이면 그 단계 생략), 접미사, 대소문자(폴더 포함), 형식별 확장자, `output` 없을 때 기존과 같음(골든 80개).

### 9.2 호스트 E2E (`test/e2e/export.test.js`, fixture)

- 형식마다 한 조합을 내보내 파일 머리 바이트 확인: PNG `89 50 4E 47`, JPG `FF D8`, TIFF `II*\0` 또는 `MM\0*`, BMP `BM`, PSD `8BPS`, TGA는 머리 3번째 바이트가 이미지 형식 2(무압축 트루컬러) 또는 10(RLE).
- PNG-8: IHDR 색 형식 3(팔레트). 인터레이스를 켜면 IHDR 인터레이스 바이트 1.
- PNG-24 투명도 끔 + 매트 흰색: 빈 칸 픽셀이 불투명 흰색.
- JPG 품질 10 파일이 품질 100보다 작다.
- 잘라내기 `each`: PNG 크기가 그 조합에서 보이는 칸들의 영역과 같다 (`expectedOn` + 칸 표로 계산).
- 잘라내기 `combined`: 모든 PNG 크기가 같고, 모든 조합의 영역을 합친 것과 같다.
- 크기 50%: 가로·세로 절반. 여백 10: +20.
- 덮어쓰기 끔으로 두 번: 두 번째 결과 경로가 `… (2).png`이고 두 파일 모두 있다. 켬으로 두 번: 파일 하나.
- 복제 길 뒤: `app.documents.length`, 활성 문서 이름, 레이어 가시성이 시작 전과 같다. 쓸 수 없는 경로로 복제 길을 태워도 복제본이 남지 않는다.
- 빈 조합(모든 레이어를 끈 상태) + `each`: 오류, 파일 없음.
- 8200×10 문서 + PNG-8 빠른 길: 8192 오류. PNG-24 빠른 길은 성공.
- `measureBounds`: 알려진 조합의 영역이 칸 표와 같다. 빈 상태는 null.

### 9.3 패널 E2E (`test/e2e/panel.test.js`)

- 형식 드롭다운을 바꾸면 그 형식의 옵션 칸만 보인다. 바꾼 값이 `readDocData().output`에 들어간다.
- `output`이 없는 PSD를 열면 `export-defaults.json`의 값으로 시작한다. 파일이 없으면 기본값.
- 범위 밖 숫자(품질 150)를 넣으면 100으로 저장되고 칸도 100으로 다시 그려진다.
- 미리보기 목록이 접미사·대소문자·확장자를 반영한다.
- 폴더로 묶기: 체크와 이름 방식(누적/값만)이 미리보기 경로와 `readDocData()`에 반영된다. 카테고리 탭에는 폴더 체크박스가 없다.
- 공통 영역으로 실행: 진행 글자가 `영역 재는 중`을 거쳐 `내보내기`가 되고, 결과 파일 크기가 모두 같다.
- 두 `<details>`의 새 이름과 기본 펼침 규칙, 경고 접힘.
- 스크린샷 520px·900px 폭.

### 9.4 사용자 확인

- 실제 PSB에서 복제 길의 장당 시간 (에이전트가 먼저 재서 알린다).

## 10. 범위 밖

- PDF 형식, 파일명 변수, 특정 글자로 시작하는 레이어 끄기 (2026-10-02 사용자가 넣지 않기로 함).
- 레이어 고르기·레이어 이름 파일명·그룹 폴더·전경/배경 레이어·조용히 실행 (§2).
- 잘라낸 위치(오프셋)를 메타데이터로 내보내기.
- 형식을 여러 개 동시에 내보내기.

## 11. 결정 기록

| 날짜 | 결정 | 이유 |
|---|---|---|
| 2026-10-02 | 기존 spec의 "PNG-24만, 트림·리사이즈 없음" 비목표를 뒤집음 | 사용자 요구: 레퍼런스 수준 옵션 |
| 2026-10-02 | 설정은 PSD마다 + 마지막 설정 파일 | 파일과 같이 다니면서 새 파일 설정 수고를 줄임 |
| 2026-10-02 | 빠른 길 + 복제 길 | 옵션이 없을 때 지금 속도 유지, 가공할 때 원본을 건드리지 않음 |
| 2026-10-02 | 원본 직접 가공 후 히스토리 되돌리기는 안 함 | 되돌리기 실패 시 원본이 잘린 채 남음 |
| 2026-10-02 | 공통 영역은 먼저 재고 내보냄 | 첫 파일을 자르기 전에 전체 영역을 알아야 함. 레이어 경계로 추정하면 조정 레이어·마스크 때문에 틀림 |
| 2026-10-02 | 대소문자는 폴더 이름에도 적용 | 파일명과 폴더명이 섞이지 않게 |
| 2026-10-02 | 덮어쓰기 기본 켬 | 지금 동작과 같음. 같은 세트를 반복해서 내보내는 사용 방식 |
| 2026-10-02 | 폴더 묶기를 내보내기 탭으로 옮기고 폴더 이름 방식(누적/값만) 추가 | 사용자 요청 (예: `출산_기본의상_옷2`로 묶기). 폴더 순서는 원 기획대로 카테고리 순서와 같게 둔다 |
| 2026-10-02 | 공통 영역은 이번만 내보낼 값과 무관하게 모든 조합을 잰다 | 일부만 다시 내보낼 때 정렬이 깨지지 않게 (리뷰 I2) |
| 2026-10-02 | 임시 이름으로 저장한 뒤 교체 | 실패한 작업이 기존 출력을 지우지 않게 (리뷰 I1) |
| 2026-10-02 | 내보내기 호출마다 문서를 넘겨 그 문서를 다시 활성화 | 내보내는 도중 탭을 바꿔도 다른 문서를 건드리지 않게 (리뷰 M9) |
