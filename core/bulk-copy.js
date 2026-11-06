// 조합 일괄 복사 (#14): 기준값의 조합을 다른 값의 배리에이션으로 한 번에 옮긴다.
// 복사하는 것은 켜는 레이어 목록이고, 복사한 뒤에는 각자 따로 고친다. UMD: 브라우저는 LMCore.bulkCopy, Node는 module.exports.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./combos'), require('./variation'));
  else { root.LMCore = root.LMCore || {}; root.LMCore.bulkCopy = factory(root.LMCore.combos, root.LMCore.variation); }
})(typeof self !== 'undefined' ? self : this, function (combosLib, variationLib) {
  'use strict';

  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  // source: 고정할 카테고리와 값 {카테고리: 값}. targets: 고정한 카테고리마다 대상 값 {카테고리: [값]}.
  // 기준에 넣지 않은 카테고리는 값을 그대로 둔 채 짝을 짓는다. 원본 자신은 뺀다.
  function pairs(categories, source, targets) {
    const fixed = categories.filter(c => has(source, c.id));
    if (!fixed.length) return [];
    const free = categories.filter(c => !has(source, c.id));
    const tos = variationLib.enumerate(fixed.map(c => ({ id: c.id, values: (targets[c.id] || []).map(id => ({ id })) })));
    const rests = variationLib.enumerate(free);
    const out = [];
    for (const to of tos) {
      if (fixed.every(c => to[c.id] === source[c.id])) continue;
      for (const rest of rests) out.push({ from: Object.assign({}, source, rest), to: Object.assign({}, to, rest) });
    }
    return out;
  }

  // options.overwrite: 이미 작성한 대상도 덮어쓴다 (기본은 빈 대상만 채움. 패널에 조합 실행 취소가 없다).
  // options.excluded: 항상 뺄 조합. 원본이나 대상이 여기에 들면 건너뛴다.
  // options.layerIds: 문서에 있는 레이어. 그 사이 지워진 레이어는 옮기지 않는다.
  // 원본이 비어 있으면 건너뛴다 (대상을 비우지 않는다).
  function copy(combos, categories, source, targets, options) {
    const o = options || {};
    const existing = o.layerIds ? new Set(o.layerIds) : null;
    const r = { combos, copied: 0, overwritten: 0, skippedFilled: 0, skippedEmpty: 0, skippedExcluded: 0, skippedSame: 0 };
    for (const { from, to } of pairs(categories, source, targets)) {
      if (variationLib.isExcluded(from, o.excluded) || variationLib.isExcluded(to, o.excluded)) { r.skippedExcluded++; continue; }
      const ids = combosLib.onLayerIds(combos, from).filter(id => !existing || existing.has(id));
      if (!ids.length) { r.skippedEmpty++; continue; }
      const had = combosLib.onLayerIds(r.combos, to);
      if (had.length && !o.overwrite) { r.skippedFilled++; continue; }
      if (had.join() === ids.join()) { r.skippedSame++; continue; }
      if (had.length) r.overwritten++;
      r.combos = combosLib.setVariationLayers(r.combos, categories, to, ids);
      r.copied++;
    }
    return r;
  }

  return { pairs, copy };
});
