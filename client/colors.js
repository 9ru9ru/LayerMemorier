// 배지 색 이름 ↔ 화면 hex ↔ 포토샵 네이티브 enum (spec §4.1, §7)
const LMColors = (() => {
  const TABLE = {
    red:    { hex: '#e5484d', native: 'red' },
    orange: { hex: '#f5a623', native: 'orange' },
    yellow: { hex: '#e3c000', native: 'yellowColor' },
    green:  { hex: '#46b450', native: 'grain' },
    blue:   { hex: '#3b82f6', native: 'blue' },
    violet: { hex: '#8b5cf6', native: 'violet' },
    gray:   { hex: '#9ca3af', native: 'gray' },
  };
  const ORDER = ['red', 'orange', 'yellow', 'green', 'blue', 'violet', 'gray'];
  return {
    ORDER,
    hex: name => (TABLE[name] || TABLE.gray).hex,
    native: name => (TABLE[name] || TABLE.gray).native,
  };
})();
