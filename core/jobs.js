// combos spec §5.7 내보내기 작업 목록 + 경고. on/off 규칙은 independent preview spec §3.1·§3.2.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./combos'), require('./naming'));
  } else {
    root.LMCore = root.LMCore || {};
    root.LMCore.jobs = factory(root.LMCore.combos, root.LMCore.naming);
  }
})(typeof self !== 'undefined' ? self : this, function (combosLib, naming) {
  'use strict';

  function buildJobs(docData, layers, variations) {
    const combos = docData.combos || [];
    const allIds = layers.map(l => l.id).sort((a, b) => a - b);
    const warnings = [];

    for (const id of combosLib.orphanLayerIds(combos, layers)) warnings.push({ type: 'orphan', layerId: id });
    for (const c of combos) {
      if (combosLib.isStale(c.when, docData.categories)) warnings.push({ type: 'stale', detail: { when: c.when } });
    }
    const unused = combosLib.unusedLayerIds(combos, layers, docData.categories).length;
    if (unused) warnings.push({ type: 'unused', detail: { count: unused } });

    const seen = new Map();
    const conflicts = [];
    const jobs = variations.map(variation => {
      // independent preview spec §3.1: 문서의 모든 레이어를 켜짐/꺼짐으로 나눈다 (PSD 눈 상태와 무관).
      const onSet = new Set(combosLib.visibleLayerIds(combos, layers, variation));
      const on = allIds.filter(id => onSet.has(id));
      const off = allIds.filter(id => !onSet.has(id));
      const relativePath = naming.relativePath(docData, variation);
      const count = (seen.get(relativePath) || 0) + 1;
      seen.set(relativePath, count);
      if (count === 2) conflicts.push(relativePath);
      return { on, off, relativePath };
    });

    return { jobs, conflicts, warnings };
  }

  // 폴더 구성 미리보기 (#15): 경로 목록을 폴더별로 묶는다. 실제 내보낼 경로에서 만들므로 결과와 어긋나지 않는다.
  // rows는 트리 순서로 {depth, name, count}, count는 그 폴더에 바로 들어가는 파일 수. rootFiles는 출력 폴더 바로 아래 파일 수.
  function folderSummary(paths) {
    const root = { children: new Map(), count: 0 };
    for (const p of paths) {
      const parts = p.split('/');
      parts.pop();
      let node = root;
      for (const name of parts) {
        // Windows 폴더 이름은 대소문자를 가리지 않으므로 디스크에서 한 폴더가 된다.
        const key = name.toLowerCase();
        if (!node.children.has(key)) node.children.set(key, { name, children: new Map(), count: 0 });
        node = node.children.get(key);
      }
      node.count++;
    }
    const rows = [];
    const walk = (node, depth) => {
      for (const child of node.children.values()) {
        rows.push({ depth, name: child.name, count: child.count });
        walk(child, depth + 1);
      }
    };
    walk(root, 0);
    return { rows, rootFiles: root.count };
  }

  return { buildJobs, folderSummary };
});
