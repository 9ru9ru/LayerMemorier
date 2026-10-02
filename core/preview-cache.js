// independent preview spec §4.2·§4.4 패널 미리보기의 캐시·그리기 순서·분할 비율.
// UMD: 브라우저는 LMCore.previewCache, Node는 module.exports.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.LMCore = root.LMCore || {}; root.LMCore.previewCache = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 최근에 쓴 limit개만 남긴다. get도 "최근에 씀"으로 친다.
  function createCache(limit) {
    const map = new Map();
    return {
      get(key) {
        if (!map.has(key)) return null;
        const v = map.get(key);
        map.delete(key);
        map.set(key, v);
        return v;
      },
      set(key, value) {
        map.delete(key);
        map.set(key, value);
        while (map.size > limit) map.delete(map.keys().next().value);
      },
      delete(key) { map.delete(key); },
      clear() { map.clear(); },
      get size() { return map.size; },
    };
  }

  // 한 번에 하나만 그린다. 그리는 중에 온 요청은 대기 칸 하나에 덮어쓴다 (마지막 요청만).
  // request는 대기 칸까지 다 비면 끝나는 Promise를 돌려준다.
  function createScheduler(worker) {
    let current = null;
    let pending = null;
    let hasPending = false;

    async function loop(job) {
      let next = job;
      for (;;) {
        try { await worker(next); } catch (e) { /* worker가 오류를 스스로 알린다 */ }
        if (!hasPending) break;
        next = pending;
        pending = null;
        hasPending = false;
      }
    }

    return {
      request(job) {
        if (current) { pending = job; hasPending = true; return current; }
        current = loop(job).then(() => { current = null; });
        return current;
      },
      get busy() { return current !== null; },
    };
  }

  // 그림 쪽 비율(0~1)을 양쪽 최소 크기 안으로 넣는다. 둘 다 지킬 수 없으면 그림 최소를 지킨다.
  function clampSplit(ratio, total, minPane, minMain) {
    const DEFAULT = 0.4;
    if (!(total > 0)) return DEFAULT;
    if (!(ratio > 0 && ratio < 1)) ratio = DEFAULT;
    let px = Math.min(ratio * total, total - minMain);
    px = Math.max(px, minPane);
    return Math.min(1, Math.max(0, Math.round(px / total * 10000) / 10000));
  }

  return { createCache, createScheduler, clampSplit };
});
