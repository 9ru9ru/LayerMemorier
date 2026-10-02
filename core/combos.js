// combos spec §5 조합 항목. UMD: 브라우저는 LMCore.combos, Node는 module.exports.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.LMCore = root.LMCore || {}; root.LMCore.combos = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const asc = (a, b) => a - b;

  // when의 모든 (카테고리→값)이 배리에이션과 같으면 true. {}는 항상 true.
  // 없는 카테고리·값을 가리키는 키는 배리에이션 값과 같아질 수 없어 자연히 false.
  function matches(when, variation) {
    return Object.keys(when).every(k => variation[k] === when[k]);
  }

  // a의 모든 쌍이 b에도 있다 = a가 b보다 넓거나 같다.
  function covers(a, b) {
    return Object.keys(a).every(k => b[k] === a[k]);
  }

  function sameWhen(a, b) {
    return Object.keys(a).length === Object.keys(b).length && covers(a, b);
  }

  function allLayerIds(combos) {
    const set = new Set();
    for (const c of combos) for (const id of c.layers) set.add(id);
    return set;
  }

  function existingIds(layers) {
    return new Set(layers.map(l => l.id));
  }

  function onLayerIds(combos, variation) {
    const set = new Set();
    for (const c of combos) if (matches(c.when, variation)) for (const id of c.layers) set.add(id);
    return Array.from(set).sort(asc);
  }

  // independent preview spec §3.1. 체크한 레이어(문서에 있는 것) + 그 조상 그룹. PSD 눈 상태와 무관하다.
  function visibleLayerIds(combos, layers, variation) {
    const byId = new Map(layers.map(l => [l.id, l]));
    const set = new Set();
    for (const id of onLayerIds(combos, variation)) {
      // 이미 넣은 레이어를 만나면 그 위 조상도 이미 들어 있다.
      for (let l = byId.get(id); l && !set.has(l.id); l = l.parentId != null ? byId.get(l.parentId) : null) set.add(l.id);
    }
    return Array.from(set).sort(asc);
  }

  // independent preview spec §3.3. ids와 그중 그룹의 모든 하위 레이어.
  function withDescendants(layers, ids) {
    const out = new Set(ids);
    let grew = true;
    while (grew) {
      grew = false;
      for (const l of layers) {
        if (l.parentId != null && out.has(l.parentId) && !out.has(l.id)) { out.add(l.id); grew = true; }
      }
    }
    return Array.from(out);
  }

  // independent preview spec §3.2. 어느 조합에도 없고, 어느 조합 레이어의 조상도 아닌 레이어.
  // 낡은 조합(없는 카테고리·값)은 어떤 배리에이션과도 맞지 않으므로 체크로 치지 않는다 (#5).
  function unusedLayerIds(combos, layers, categories) {
    const live = combos.filter(c => !isStale(c.when, categories));
    const used = new Set(visibleLayerIds([{ when: {}, layers: Array.from(allLayerIds(live)) }], layers, {}));
    return layers.filter(l => !used.has(l.id)).map(l => l.id).sort(asc);
  }

  // independent preview spec §4.4. 레이어 id·부모·순서가 같으면 같은 문자열 (눈·이름은 무시).
  function layerSignature(layers) {
    return layers.map(l => l.id + ':' + (l.parentId == null ? '' : l.parentId)).join(',');
  }

  function managedLayerIds(combos, layers) {
    const existing = existingIds(layers);
    return Array.from(allLayerIds(combos)).filter(id => existing.has(id)).sort(asc);
  }

  function orphanLayerIds(combos, layers) {
    const existing = existingIds(layers);
    return Array.from(allLayerIds(combos)).filter(id => !existing.has(id)).sort(asc);
  }

  // 빈 항목은 저장하지 않는다 (spec §4.1).
  function compact(combos) {
    return combos.filter(c => c.layers.length > 0);
  }

  function pruneOrphans(combos, layers) {
    const existing = existingIds(layers);
    return compact(combos.map(c => ({ when: c.when, layers: c.layers.filter(id => existing.has(id)) })));
  }

  function toggle(combos, when, layerIds, on) {
    let found = false;
    const out = combos.map(c => {
      if (!sameWhen(c.when, when)) return c;
      found = true;
      const set = new Set(c.layers);
      for (const id of layerIds) { if (on) set.add(id); else set.delete(id); }
      return { when: c.when, layers: Array.from(set) };
    });
    if (!found && on && layerIds.length) out.push({ when: Object.assign({}, when), layers: Array.from(new Set(layerIds)) });
    return compact(out);
  }

  function removeLayers(combos, layerIds) {
    const drop = new Set(layerIds);
    return compact(combos.map(c => ({ when: c.when, layers: c.layers.filter(id => !drop.has(id)) })));
  }

  function countWithLayers(combos, layerIds) {
    const ids = new Set(layerIds);
    return combos.filter(c => c.layers.some(id => ids.has(id))).length;
  }

  function refersTo(when, categoryId, valueId) {
    if (!has(when, categoryId)) return false;
    return valueId == null || when[categoryId] === valueId;
  }

  function removeFor(combos, categoryId, valueId) {
    return combos.filter(c => !refersTo(c.when, categoryId, valueId));
  }

  function countFor(combos, categoryId, valueId) {
    return combos.filter(c => refersTo(c.when, categoryId, valueId)).length;
  }

  // spec §5.3. inherited면 from = 이동할 항목(더 넓은 것 중 가장 좁은 것, 같으면 앞의 것)의 when.
  function layerState(combos, when, layerId) {
    let from = null;
    for (const c of combos) {
      if (c.layers.indexOf(layerId) === -1) continue;
      if (sameWhen(c.when, when)) return { state: 'checked', from: null };
      if (covers(c.when, when) && (!from || Object.keys(c.when).length > Object.keys(from).length)) from = c.when;
    }
    return from ? { state: 'inherited', from } : { state: 'none', from: null };
  }

  function isStale(when, categories) {
    return Object.keys(when).some(k => {
      const c = categories.find(c => c.id === k);
      return !c || !c.values.some(v => v.id === when[k]);
    });
  }

  // 없는 카테고리·값을 가리키는 키를 뺀 새 조합. 레이어 탭 선택이 낡은 키를 들고 있으면
  // toggle이 어떤 배리에이션과도 맞지 않는 항목을 만들어 그 레이어가 항상 꺼진다.
  function cleanWhen(when, categories) {
    const out = {};
    for (const k of Object.keys(when)) if (!isStale({ [k]: when[k] }, categories)) out[k] = when[k];
    return out;
  }

  function comboName(when, categories) {
    const parts = [];
    for (const c of categories) {
      if (!has(when, c.id)) continue;
      const v = c.values.find(v => v.id === when[c.id]);
      parts.push(c.name + (v ? v.name : '?'));
    }
    for (const k of Object.keys(when)) if (!categories.some(c => c.id === k)) parts.push('?');
    return parts.length ? parts.join('_') : '모든 조합';
  }

  // 카테고리마다 0 = 전체, 1.. = 값 순서, 없는 값은 맨 뒤. 마지막 칸은 낡은 항목 표시.
  function sortKey(when, categories) {
    const key = categories.map(c => {
      if (!has(when, c.id)) return 0;
      const i = c.values.findIndex(v => v.id === when[c.id]);
      return i === -1 ? c.values.length + 1 : i + 1;
    });
    key.push(isStale(when, categories) ? 1 : 0);
    return key;
  }

  function sortCombos(combos, categories) {
    const keyed = combos.map((c, i) => ({ c, i, k: sortKey(c.when, categories) }));
    keyed.sort((a, b) => {
      for (let j = 0; j < a.k.length; j++) if (a.k[j] !== b.k[j]) return a.k[j] - b.k[j];
      return a.i - b.i;
    });
    return keyed.map(x => x.c);
  }

  function combosOfLayer(combos, layerId, categories) {
    return sortCombos(combos.filter(c => c.layers.indexOf(layerId) !== -1), categories);
  }

  function previewVariation(when, categories) {
    const v = {};
    for (const c of categories) {
      if (has(when, c.id)) v[c.id] = when[c.id];
      else if (c.values.length) v[c.id] = c.values[0].id;
      else return null;
    }
    return v;
  }

  // version 1 → 2 (combos spec §4.2). 레이어 마크의 값 집합을 카테고리 순서대로 펼친다.
  // 없는 카테고리 키·없는 값은 뺀다. 남는 것이 없으면 그 마크는 버리고 dropped로 센다.
  function migrate(data) {
    const categories = data.categories || [];
    const known = new Map(categories.map(c => [c.id, new Set(c.values.map(v => v.id))]));
    const marks = data.marks || {};
    const combos = [];
    let dropped = 0;
    for (const key of Object.keys(marks)) {
      const mark = marks[key] || {};
      if (!Object.keys(mark).length) continue;
      const id = Number(key);
      let partials = [{}];
      let considered = 0;
      let empty = false;
      for (const c of categories) {
        if (!has(mark, c.id)) continue;
        considered++;
        const values = (mark[c.id] || []).filter(v => known.get(c.id).has(v));
        if (!values.length) { empty = true; break; }
        const next = [];
        for (const p of partials) for (const v of values) next.push(Object.assign({}, p, { [c.id]: v }));
        partials = next;
      }
      if (empty || considered === 0) { dropped++; continue; }
      for (const when of partials) {
        const hit = combos.find(c => sameWhen(c.when, when));
        if (!hit) combos.push({ when, layers: [id] });
        else if (hit.layers.indexOf(id) === -1) hit.layers.push(id);
      }
    }
    const next = Object.assign({}, data, { version: 2, combos });
    delete next.marks;
    delete next.nativeColor;
    return { data: next, dropped };
  }

  return {
    matches, covers, sameWhen, onLayerIds, visibleLayerIds, withDescendants, unusedLayerIds, layerSignature, managedLayerIds, orphanLayerIds, pruneOrphans,
    toggle, removeLayers, countWithLayers, removeFor, countFor, layerState,
    isStale, cleanWhen, comboName, sortCombos, combosOfLayer, previewVariation, migrate,
  };
});
