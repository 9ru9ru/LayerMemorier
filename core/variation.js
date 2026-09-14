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
