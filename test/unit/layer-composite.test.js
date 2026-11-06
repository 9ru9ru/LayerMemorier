'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPlan, planUnits, unitOnIds, canvasMode, drawNodes } = require('../../core/layer-composite');

// 목록은 getLayers와 같이 위에서 아래 순서다.
const L = (id, parentId, extra) => Object.assign({ id, parentId, kind: 'layer', mode: 'normal', clipped: false }, extra);
const G = (id, parentId, mode, extra) => Object.assign({ id, parentId, kind: 'group', mode, clipped: false }, extra);
const shape = nodes => nodes.map(n => (n.children ? { group: n.group, mode: n.mode, children: shape(n.children) } : { ids: n.ids, mode: n.mode }));

test('plain layers are drawn bottom first with their own mode, and hidden ones are left out', () => {
  const layers = [L(3, null, { mode: 'multiply' }), L(2, null), L(1, null)];
  assert.deepEqual(shape(buildPlan(layers, [1, 3])), [{ ids: [1], mode: 'normal' }, { ids: [3], mode: 'multiply' }]);
});

test('a clipping base and its clipped layers that are on become one picture with the base mode', () => {
  const layers = [L(4, null), L(3, null, { clipped: true }), L(2, null, { clipped: true }), L(1, null, { mode: 'screen' })];
  assert.deepEqual(shape(buildPlan(layers, [1, 3, 4])), [{ ids: [1, 3], mode: 'screen' }, { ids: [4], mode: 'normal' }]);
});

test('clipped layers draw nothing when their base is off', () => {
  const layers = [L(2, null, { clipped: true }), L(1, null)];
  assert.deepEqual(shape(buildPlan(layers, [2])), []);
});

test('a pass-through group adds no step of its own, and an empty group draws nothing', () => {
  const layers = [G(10, null, 'passThrough'), L(2, 10, { mode: 'overlay' }), L(1, 10), G(20, null, 'passThrough'), L(5, 20)];
  assert.deepEqual(shape(buildPlan(layers, [10, 1, 2, 20])), [{ ids: [1], mode: 'normal' }, { ids: [2], mode: 'overlay' }]);
});

test('a group with its own mode composites its children first', () => {
  const layers = [G(10, null, 'multiply'), L(2, 10, { mode: 'screen' }), L(1, 10), L(0, null)];
  assert.deepEqual(shape(buildPlan(layers, [10, 1, 2, 0])), [
    { ids: [0], mode: 'normal' },
    { group: 10, mode: 'multiply', children: [{ ids: [1], mode: 'normal' }, { ids: [2], mode: 'screen' }] },
  ]);
});

test('layers clipped to a group become one picture with the group and its visible layers', () => {
  const layers = [L(5, null, { clipped: true }), G(10, null, 'passThrough'), L(2, 10), L(1, 10)];
  assert.deepEqual(shape(buildPlan(layers, [5, 10, 1])), [{ ids: [1, 5, 10], mode: 'normal' }]);
});

test('planUnits lists every picture, including those inside groups, bottom first', () => {
  const layers = [G(10, null, 'normal'), L(2, 10), L(1, null)];
  assert.deepEqual(planUnits(buildPlan(layers, [10, 2, 1])).map(u => u.ids), [[1], [2]]);
});

test('unitOnIds adds the parent groups, so group masks and opacity stay in the picture', () => {
  const layers = [G(10, null, 'normal'), G(20, 10, 'normal'), L(2, 20), L(1, null)];
  assert.deepEqual(unitOnIds([2], layers), [2, 10, 20]);
  assert.deepEqual(unitOnIds([1], layers), [1]);
});

test('canvasMode uses the same mode when the canvas has it, the closest one otherwise, and normal when unknown', () => {
  for (const [ps, want] of [['normal', 'source-over'], ['multiply', 'multiply'], ['colorDodge', 'color-dodge'], ['softLight', 'soft-light'], ['linearDodge', 'lighter'], ['vividLight', 'hard-light'], ['linearBurn', 'color-burn'], ['nonsense', 'source-over']]) {
    assert.equal(canvasMode(ps), want, ps);
  }
});

test('drawNodes draws in plan order, skips pictures not ready yet, and composites a group on its own layer', () => {
  const log = [];
  const makeCtx = name => ({
    globalCompositeOperation: 'source-over',
    drawImage(src) { log.push([name, src, this.globalCompositeOperation]); },
    canvas: { width: 10, height: 10 },
  });
  const nodes = [
    { ids: [1], mode: 'normal' },
    { ids: [9], mode: 'normal' },
    { group: 10, mode: 'multiply', children: [{ ids: [2], mode: 'screen' }] },
  ];
  const pictureOf = n => (n.ids[0] === 9 ? null : 'p' + n.ids[0]);
  const makeLayer = () => { const c = makeCtx('sub'); return { getContext: () => c, name: 'subCanvas' }; };
  drawNodes(makeCtx('main'), nodes, pictureOf, makeLayer);
  assert.deepEqual(log.map(e => (typeof e[1] === 'string' ? e : [e[0], e[1].name, e[2]])), [
    ['main', 'p1', 'source-over'],
    ['sub', 'p2', 'screen'],
    ['main', 'subCanvas', 'multiply'],
  ]);
});

test('preloadUnits lists the pictures every combo uses first, then each remaining layer alone', () => {
  const { preloadUnits } = require('../../core/layer-composite');
  const layers = [L(4, null), L(3, null, { clipped: true }), L(2, null), L(1, null)];
  assert.deepEqual(preloadUnits(layers, [[1, 2, 3], [1]]), [[1], [2, 3], [2], [4]]);
});

test('preloadUnits leaves out groups and clipped layers on their own, and repeats nothing', () => {
  const { preloadUnits } = require('../../core/layer-composite');
  const layers = [G(10, null, 'passThrough'), L(3, 10), L(2, 10, { clipped: true }), L(1, 10)];
  assert.deepEqual(preloadUnits(layers, [[10, 1], [10, 1]]), [[1], [3]]);
});
