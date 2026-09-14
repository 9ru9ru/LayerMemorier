// spec §5.5 내보내기 작업 목록 + §9 경고.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./visibility'), require('./naming'));
  } else {
    root.LMCore = root.LMCore || {};
    root.LMCore.jobs = factory(root.LMCore.visibility, root.LMCore.naming);
  }
})(typeof self !== 'undefined' ? self : this, function (visibility, naming) {
  'use strict';

  function layerMap(layers) {
    const map = new Map();
    for (const l of layers) map.set(String(l.id), l);
    return map;
  }

  function markedLayerIds(marks, layers) {
    const existing = layerMap(layers);
    return Object.keys(marks || {}).filter(id => existing.has(id)).map(Number).sort((a, b) => a - b);
  }

  function orphanMarkIds(marks, layers) {
    const existing = layerMap(layers);
    return Object.keys(marks || {}).filter(id => !existing.has(id)).map(Number).sort((a, b) => a - b);
  }

  // 마크 없는 조상 그룹 중 꺼진 것이 있으면 그 그룹 id, 없으면 null.
  function hiddenUnmarkedAncestor(layer, byId, marks) {
    let parentId = layer.parentId;
    while (parentId != null) {
      const parent = byId.get(String(parentId));
      if (!parent) return null;
      const parentMarked = marks[String(parent.id)] && Object.keys(marks[String(parent.id)]).length > 0;
      if (!parentMarked && !parent.visible) return parent.id;
      parentId = parent.parentId;
    }
    return null;
  }

  function buildJobs(docData, layers, variations) {
    const marks = docData.marks || {};
    const byId = layerMap(layers);
    const warnings = [];
    const marked = [];

    for (const key of Object.keys(marks)) {
      const layer = byId.get(key);
      if (!layer) { warnings.push({ type: 'orphan', layerId: Number(key) }); continue; }
      const mark = marks[key];
      if (!mark || Object.keys(mark).length === 0) continue;
      for (const issue of visibility.markIssues(mark, docData.categories)) {
        warnings.push({ type: 'stale', layerId: layer.id, detail: issue });
      }
      const hiddenGroup = hiddenUnmarkedAncestor(layer, byId, marks);
      if (hiddenGroup != null) warnings.push({ type: 'parentHidden', layerId: layer.id, detail: { groupId: hiddenGroup } });
      marked.push({ layer, mark });
    }
    marked.sort((a, b) => a.layer.id - b.layer.id);

    const seen = new Map();
    const conflicts = [];
    const jobs = variations.map(variation => {
      const on = [], off = [];
      for (const { layer, mark } of marked) {
        const v = visibility.judge(mark, variation, docData.categories);
        if (v === true) on.push(layer.id);
        else if (v === false) off.push(layer.id);
      }
      const relativePath = naming.relativePath(docData, variation);
      const count = (seen.get(relativePath) || 0) + 1;
      seen.set(relativePath, count);
      if (count === 2) conflicts.push(relativePath);
      return { on, off, relativePath };
    });

    return { jobs, conflicts, warnings };
  }

  return { buildJobs, orphanMarkIds, markedLayerIds };
});
