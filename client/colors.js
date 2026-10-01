// 카테고리 색 이름 ↔ 화면 hex (spec §4.1). 포토샵 레이어 색은 건드리지 않는다 (combos spec §2).
const LMColors = (() => {
  const TABLE = {
    red: '#e5484d',
    orange: '#f5a623',
    yellow: '#e3c000',
    green: '#46b450',
    blue: '#3b82f6',
    violet: '#8b5cf6',
    gray: '#9ca3af',
  };
  const ORDER = ['red', 'orange', 'yellow', 'green', 'blue', 'violet', 'gray'];
  // 포토샵 레이어 색 enum(getLayers().color) → 트리 눈 칸 배경. none 이면 null.
  const LAYER = {
    red: '#b34a4a',
    orange: '#c27a3a',
    yellowColor: '#b5a23c',
    grain: '#5d9152',
    blue: '#4f78b5',
    violet: '#8763b3',
    gray: '#7a7a7a',
  };
  return {
    ORDER,
    hex: name => TABLE[name] || TABLE.gray,
    layerHex: color => LAYER[color] || null,
  };
})();
