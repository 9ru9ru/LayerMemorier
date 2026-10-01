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
  const golden = fs.readFileSync(path.join(__dirname, '..', 'golden', 'alssagi.txt'), 'utf8').trim().split(/\r?\n/).map(s => s.normalize('NFC'));
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
  const names = enumerate(doc.categories).map(v => relativePath(doc, v).normalize('NFC'));
  assert.equal(names.length, 80);
  assert.deepEqual(names, golden);
});

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
