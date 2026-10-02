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
const { normalize, isFastPath, unionBounds } = require('../../core/output');

const DEST = path.join(ROOT, 'test', 'out', 'formats').replace(/\\/g, '/');
const out = name => path.join(DEST, name);
const head = (name, n) => fs.readFileSync(out(name)).subarray(0, n);
const png = name => PNG.sync.read(fs.readFileSync(out(name)));

// fixture 를 새로 만든다. 0.4.0부터 BG(조합 밖 레이어)는 출력에서 늘 꺼지므로 hideBg 는 PSD 눈만 끈다 (결과는 같아야 한다).
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
  const ids = ctx.layers.map(l => l.id);
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
    jobFor(ctx, v, { format: 'bmp', bmp: { rle: true } }, 'rle.bmp'),
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
    // 복제본을 만든 뒤 그 안에서 실패하게 한다: 덮어쓸 파일이 읽기 전용이다. 뒤집힌 자르기 영역은
    // 포토샵이 바로잡고, 같은 이름의 폴더는 그 안에 저장해 버려 실패하지 않는다 (2026-10-02 실측).
    { on: [], off: [], path: DEST + '/blocked.tif', output: normalize({ format: 'tif' }), fast: false, crop: null },
  ];
  fs.mkdirSync(DEST, { recursive: true });
  fs.writeFileSync(out('blocked.tif'), 'read-only placeholder');
  fs.chmodSync(out('blocked.tif'), 0o444);
  for (const j of jobs) lines.push(`results.push(LM.exportOne(${JSON.stringify(JSON.stringify(j))}));`);
  lines.push('JSON.stringify({ results: results, docs: app.documents.length, active: app.activeDocument.name })');
  let r;
  try {
    r = JSON.parse(psRun(lines.join('\n')));
  } finally {
    fs.chmodSync(out('blocked.tif'), 0o666);
  }
  const res = r.results.map(x => JSON.parse(x));
  assert.match(res[0].error, /LM_EMPTY/);
  assert.equal(fs.existsSync(out('empty-trim.png')), false);
  assert.equal(res[1].ok, true, JSON.stringify(res[1]));
  assert.equal(png('empty-scale.png').width, 120);
  assert.ok(res[2].error, 'a failure inside the duplicate is reported');
  assert.equal(fs.readFileSync(out('blocked.tif'), 'utf8'), 'read-only placeholder', 'the read-only file is untouched');
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

// 리뷰 I1: 실패하는 작업이 기존 출력 파일을 먼저 지우면 안 된다.
test('a failing job keeps the existing file and leaves no temporary file behind', () => {
  fs.mkdirSync(DEST, { recursive: true });
  for (const f of fs.readdirSync(DEST)) if (f.startsWith('lm_')) fs.rmSync(out(f), { force: true });
  fs.writeFileSync(out('keep.png'), 'previous export');
  psRun('while (app.documents.length) app.activeDocument.close(SaveOptions.DONOTSAVECHANGES); app.documents.add(8200, 10, 72, "lm-wide2", NewDocumentMode.RGB, DocumentFill.WHITE); "ok"');
  try {
    const j = { on: [], off: [], path: DEST + '/keep.png', output: normalize({ format: 'png8' }), fast: true, crop: null };
    const r = JSON.parse(psRun(`LM.exportOne(${JSON.stringify(JSON.stringify(j))})`));
    assert.match(r.error, /LM_PNG8_TOO_LARGE/);
    assert.equal(fs.readFileSync(out('keep.png'), 'utf8'), 'previous export', 'the previous export survives');
    assert.deepEqual(fs.readdirSync(DEST).filter(f => f.startsWith('lm_')), [], 'no temporary file left');
  } finally {
    psRun('while (app.documents.length) app.activeDocument.close(SaveOptions.DONOTSAVECHANGES); "closed"');
  }
});

// 리뷰 M10: 기본값과 아직 한 번도 실행하지 않은 옵션이 실제로 저장되는지.
test('options smoke: TGA default (RLE), TIFF ZIP/JPG, JPG progressive, PNG-8 fixed palettes, background/foreground matte', () => {
  const ctx = setup({ hideBg: true });
  const v = V(ctx, 'a0', 'b0', 'n1');
  const cases = [
    [{ format: 'tga' }, 'opt-default.tga'],
    [{ format: 'tif', tif: { compression: 'zip' } }, 'opt-zip.tif'],
    [{ format: 'tif', tif: { compression: 'jpg', quality: 50 } }, 'opt-jpg.tif'],
    [{ format: 'jpg', jpg: { progressive: true, icc: true } }, 'opt-prog.jpg'],
    [{ format: 'png8', png8: { reduction: 'blackWhite' } }, 'opt-bw.png'],
    [{ format: 'png8', png8: { reduction: 'grayscale' } }, 'opt-gray.png'],
    [{ format: 'png8', png8: { reduction: 'mac' } }, 'opt-mac.png'],
    [{ format: 'png8', png8: { reduction: 'windows', dither: 'pattern' } }, 'opt-win.png'],
    [{ png24: { transparency: false, matte: 'background' } }, 'opt-bg.png'],
    [{ png24: { transparency: false, matte: 'foreground' } }, 'opt-fg.png'],
  ];
  const res = run(ctx, cases.map(([o, f]) => jobFor(ctx, v, o, f)));
  res.forEach((r, i) => assert.equal(r.ok, true, cases[i][1] + ': ' + JSON.stringify(r)));
  for (const [, f] of cases) assert.ok(fs.statSync(out(f)).size > 0, f);
  const tga = fs.readFileSync(out('opt-default.tga'));
  assert.equal(tga[2], 10, 'default TGA is RLE compressed');
});

// 리뷰 M9: 내보내는 사이에 다른 문서가 활성화되면, 패널이 아는 문서로 돌아가서 이어 간다.
test('export calls switch back to the expected document when another one became active', () => {
  const ctx = setup();
  const info = psCall('getDocInfo');
  const doc = { name: info.name, path: info.path };
  const v = V(ctx, 'a0', 'b0', 'n1');
  const j = Object.assign(jobFor(ctx, v, {}, 'switched.png'), { doc });
  psCall('exportBegin', { layerIds: ctx.layers.map(l => l.id), doc });
  psRun('app.documents.add(10, 10, 72, "lm-intruder"); "added"');
  try {
    const r = psCall('exportOne', j);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(psRun('app.activeDocument.name'), 'fixture.psd');
    assert.deepEqual(pixel(png('switched.png'), 20, 20).slice(0, 3), [255, 0, 0], 'saved from the fixture, A0 red');
    psRun('app.activeDocument = app.documents.getByName("lm-intruder"); "switched"');
    assert.deepEqual(psCall('measureBounds', { on: j.on, off: j.off, doc }).bounds !== undefined, true);
    assert.equal(psRun('app.activeDocument.name'), 'fixture.psd');
    psRun('app.activeDocument = app.documents.getByName("lm-intruder"); "switched"');
    assert.equal(psCall('exportEnd', { doc }).ok, true);
    assert.equal(psRun('app.activeDocument.name'), 'fixture.psd');
  } finally {
    psRun('app.documents.getByName("lm-intruder").close(SaveOptions.DONOTSAVECHANGES); "closed"');
  }
});
