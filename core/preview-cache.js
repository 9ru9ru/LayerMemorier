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

  // 화질 칸의 값을 1~100 정수로. 숫자가 아니면(빈칸 포함) null.
  function clampPercent(value) {
    if (value == null || String(value).trim() === '') return null;
    const n = Number(value);
    if (!isFinite(n)) return null;
    return Math.min(100, Math.max(1, Math.round(n)));
  }

  // 미리보기는 웹용 저장으로 쓰므로 가로·세로 8192px를 넘을 수 없다 (export spec §5.3).
  const MAX_PREVIEW_SIDE = 8192;

  // 원본 대비 percent일 때의 그림 크기. width·height는 호스트(renderPreview)가 maxSize로 줄인 결과와 같다.
  function previewSize(percent, width, height) {
    const long = Math.max(width, height);
    const maxSize = Math.max(1, Math.min(MAX_PREVIEW_SIDE, Math.round(long * percent / 100)));
    const k = Math.min(1, maxSize / long);
    return { maxSize, width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
  }

  // 디스크에 보관한 그림을 지금 문서에 그대로 믿어도 되는가.
  // index: 저장해 둔 {mark, dirty}. mark는 히스토리 상태와 {saved, stamp(파일 시각:크기)}, dirty는 저장 안 된 수정이 있었는지.
  // 패널만 다시 연 경우(히스토리 상태까지 같음)와, 수정 없이 저장돼 있던 파일을 그대로 다시 연 경우만 믿는다.
  function cacheIsFresh(index, now) {
    const was = index.mark;
    if (!was || !now) return false;
    if (was.id === now.id && was.index === now.index && was.count === now.count && was.name === now.name && was.stamp === now.stamp) return true;
    return !!now.saved && !index.dirty && now.stamp != null && was.stamp === now.stamp;
  }

  // 파일 경로마다 폴더 하나. 대소문자·슬래시 모양이 달라도 같은 파일이면 같은 이름 (FNV-1a).
  function cacheFolderName(path) {
    const s = String(path).replace(/\\/g, '/').toLowerCase();
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(36);
  }

  return { createCache, createScheduler, clampSplit, clampPercent, previewSize, cacheIsFresh, cacheFolderName };
});
