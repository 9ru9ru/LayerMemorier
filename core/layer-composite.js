// 빠른 그리기: 레이어별 축소 그림을 패널 캔버스에서 합치는 계획과 그리기.
// 내보낼 그림과 조금 다를 수 있다 (조정 레이어는 빠지고, 캔버스에 없는 블렌드는 비슷한 것으로 그린다).
// UMD: 브라우저는 LMCore.layerComposite, Node는 module.exports.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.LMCore = root.LMCore || {}; root.LMCore.layerComposite = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const asc = (a, b) => a - b;

  const CANVAS_MODE = {
    normal: 'source-over', passThrough: 'source-over', dissolve: 'source-over',
    multiply: 'multiply', screen: 'screen', overlay: 'overlay', darken: 'darken', lighten: 'lighten',
    colorDodge: 'color-dodge', colorBurn: 'color-burn', hardLight: 'hard-light', softLight: 'soft-light',
    difference: 'difference', exclusion: 'exclusion', hue: 'hue', saturation: 'saturation', color: 'color', luminosity: 'luminosity',
    linearDodge: 'lighter',
    // 캔버스에 없는 모드는 가장 비슷한 것으로.
    linearBurn: 'color-burn', vividLight: 'hard-light', linearLight: 'hard-light', pinLight: 'hard-light', hardMix: 'hard-light',
    darkerColor: 'darken', lighterColor: 'lighten',
    subtract: 'difference', blendSubtraction: 'difference', divide: 'color-dodge', blendDivide: 'color-dodge',
  };

  function canvasMode(mode) { return CANVAS_MODE[mode] || 'source-over'; }

  // layers: getLayers 순서(위에서 아래). 결과: 아래부터 그릴 노드 목록.
  // 그림 노드 {ids, mode}: ids를 함께 켜고 뽑은 그림 한 장. 묶음 노드 {group, mode, children}: 따로 합친 뒤 mode로 얹는다.
  // 클리핑은 바탕과 함께 뽑아 포토샵이 계산하게 한다 (바탕이 꺼지면 클리핑 레이어도 안 나온다).
  function buildPlan(layers, visibleIds) {
    const visible = new Set(visibleIds);
    const kids = new Map();
    for (const l of layers) {
      const p = l.parentId == null ? null : l.parentId;
      if (!kids.has(p)) kids.set(p, []);
      kids.get(p).push(l);
    }
    const childrenOf = id => kids.get(id) || [];
    const collect = l => {
      if (!visible.has(l.id)) return [];
      return l.kind === 'group' ? [l.id].concat(...childrenOf(l.id).map(collect)) : [l.id];
    };

    function walk(siblings) {
      const out = [];
      let i = siblings.length - 1;
      while (i >= 0) {
        const base = siblings[i];
        const clipped = [];
        i--;
        while (i >= 0 && siblings[i].clipped) clipped.push(siblings[i--]);
        if (!visible.has(base.id)) continue;
        const onTop = [].concat(...clipped.map(collect));
        const passThrough = base.mode == null || base.mode === 'passThrough';
        if (base.kind === 'group' && !onTop.length) {
          const children = walk(childrenOf(base.id));
          if (passThrough) out.push(...children);
          else if (children.length) out.push({ group: base.id, mode: base.mode, children });
        } else {
          out.push({ ids: collect(base).concat(onTop).sort(asc), mode: passThrough ? 'normal' : base.mode });
        }
      }
      return out;
    }
    return walk(childrenOf(null));
  }

  // 계획에 든 그림 노드 전부 (아래부터).
  function planUnits(nodes) {
    return [].concat(...nodes.map(n => (n.children ? planUnits(n.children) : [n])));
  }

  // 그림을 뽑을 때 켤 레이어: ids와 그 부모 그룹. 그룹의 마스크·불투명도가 그림에 함께 담긴다.
  function unitOnIds(ids, layers) {
    const byId = new Map(layers.map(l => [l.id, l]));
    const on = new Set();
    for (const id of ids) {
      for (let l = byId.get(id); l && !on.has(l.id); l = l.parentId != null ? byId.get(l.parentId) : null) on.add(l.id);
    }
    return Array.from(on).sort(asc);
  }

  // pictureOf(그림 노드): 그릴 그림 또는 아직 없으면 null. makeLayer(): 같은 크기의 빈 캔버스.
  function drawNodes(ctx, nodes, pictureOf, makeLayer) {
    for (const n of nodes) {
      let source = null;
      if (n.children) {
        source = makeLayer();
        drawNodes(source.getContext('2d'), n.children, pictureOf, makeLayer);
      } else {
        source = pictureOf(n);
      }
      if (!source) continue;
      ctx.globalCompositeOperation = canvasMode(n.mode);
      ctx.drawImage(source, 0, 0, ctx.canvas.width, ctx.canvas.height);
    }
  }

  return { buildPlan, planUnits, unitOnIds, canvasMode, drawNodes };
});
