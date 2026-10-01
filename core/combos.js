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

  return {
    matches, covers, sameWhen, onLayerIds, managedLayerIds, orphanLayerIds, pruneOrphans,
    toggle, removeLayers, countWithLayers, removeFor, countFor, layerState,
    isStale, comboName, sortCombos, combosOfLayer, previewVariation,
  };
});
