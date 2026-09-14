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
