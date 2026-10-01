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

// 웹용 저장은 파일명의 공백을 하이픈으로 바꾼다 (2026-10-02 실측). 실제 출력명은 한글+공백이다.
test('fast path keeps Korean and spaces in file names (PNG-24, PNG-8, JPG)', () => {
  const ctx = setup();
  const v = V(ctx, 'a0', 'b0', 'n1');
  const names = ['떨어짐 프시케 파츠 정리40-2_가슴_0.png', '떨어짐 프시케 8.png', '떨어짐 프시케.jpg'];
  const res = run(ctx, [
    jobFor(ctx, v, {}, names[0]),
    jobFor(ctx, v, { format: 'png8' }, names[1]),
    jobFor(ctx, v, { format: 'jpg' }, names[2]),
  ]);
  okAll(res);
  names.forEach((n, i) => {
    assert.ok(fs.existsSync(out(n)), n);
    assert.ok(res[i].path.endsWith('/' + n), res[i].path);
  });
});
