// combos spec §5.7 내보내기 작업 목록 + 경고.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./combos'), require('./naming'));
  } else {
    root.LMCore = root.LMCore || {};
    root.LMCore.jobs = factory(root.LMCore.combos, root.LMCore.naming);
  }
})(typeof self !== 'undefined' ? self : this, function (combosLib, naming) {
  'use strict';

  // 관리 레이어가 아닌 조상 그룹 중 꺼진 것이 있으면 그 그룹 id, 없으면 null.
  function hiddenUnmanagedAncestor(layer, byId, managed) {
    let parentId = layer.parentId;
    while (parentId != null) {
      const parent = byId.get(parentId);
      if (!parent) return null;
      if (!managed.has(parent.id) && !parent.visible) return parent.id;
      parentId = parent.parentId;
    }
    return null;
  }

  function buildJobs(docData, layers, variations) {
    const combos = docData.combos || [];
    const byId = new Map(layers.map(l => [l.id, l]));
    const managedIds = combosLib.managedLayerIds(combos, layers);
    const managed = new Set(managedIds);
    const warnings = [];

    for (const id of combosLib.orphanLayerIds(combos, layers)) warnings.push({ type: 'orphan', layerId: id });
    for (const c of combos) {
      if (combosLib.isStale(c.when, docData.categories)) warnings.push({ type: 'stale', detail: { when: c.when } });
    }
    for (const id of managedIds) {
      const groupId = hiddenUnmanagedAncestor(byId.get(id), byId, managed);
      if (groupId != null) warnings.push({ type: 'parentHidden', layerId: id, detail: { groupId } });
    }

    const seen = new Map();
    const conflicts = [];
    const jobs = variations.map(variation => {
      const onSet = new Set(combosLib.onLayerIds(combos, variation));
      const on = managedIds.filter(id => onSet.has(id));
      const off = managedIds.filter(id => !onSet.has(id));
      const relativePath = naming.relativePath(docData, variation);
      const count = (seen.get(relativePath) || 0) + 1;
      seen.set(relativePath, count);
      if (count === 2) conflicts.push(relativePath);
      return { on, off, relativePath };
    });

    return { jobs, conflicts, warnings };
  }

  return { buildJobs };
});
