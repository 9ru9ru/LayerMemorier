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
