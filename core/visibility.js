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
