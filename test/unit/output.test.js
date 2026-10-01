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
