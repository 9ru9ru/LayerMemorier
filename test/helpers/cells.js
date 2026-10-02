'use strict';
// fixture 칸 표 (test/fixture/make-fixture.jsx). 이름 → [열, 행, rgb]. 칸은 40×40, 캔버스 240×160.
const CELL = {
  A0: [0, 0, [255, 0, 0]], A1: [1, 0, [0, 255, 0]], B0: [2, 0, [0, 0, 255]], B1: [3, 0, [255, 255, 0]],
  B2: [4, 0, [0, 255, 255]], N1: [5, 0, [255, 0, 255]], N2: [0, 1, [128, 128, 128]],
  GA: [1, 1, [255, 128, 0]], GB: [2, 1, [128, 0, 255]], H: [3, 1, [0, 0, 0]], BG: [4, 1, [255, 255, 255]],
};

// fixture 문서 데이터(조합)로 배리에이션 v 에서 그 칸이 보이는가 (independent preview spec §3.1).
// 체크한 레이어 + 그 부모 그룹만 켜진다: GA(B0)가 켜지면 부모 G 도 켜지고, G(A1)만 켜진 경우 안의 GB 는 꺼진 채다.
// 어느 조합에도 없는 BG·H 는 PSD 눈 상태와 상관없이 꺼진다.
function expectedOn(name, v) {
  switch (name) {
    case 'A0': return v.cA === 'a0';
    case 'A1': return v.cA === 'a1';
    case 'B0': return v.cB === 'b0';
    case 'B1': return v.cB === 'b1';
    case 'B2': return v.cB === 'b2';
    case 'N1': return v.cN === 'n1';
    case 'N2': return v.cN === 'n2';
    case 'GA': return v.cB === 'b0';
    case 'GB': return false;
    case 'H': return false;
    case 'BG': return false;
  }
  throw new Error(name);
}

// 배리에이션에서 보이는 칸들의 영역(px). hidden: 강제로 꺼 둔 레이어 이름들 (예: ['BG']).
function visibleBounds(v, hidden = []) {
  let b = null;
  for (const name of Object.keys(CELL)) {
    if (hidden.includes(name) || !expectedOn(name, v)) continue;
    const [col, row] = CELL[name];
    const r = { left: col * 40, top: row * 40, right: col * 40 + 40, bottom: row * 40 + 40 };
    b = b ? { left: Math.min(b.left, r.left), top: Math.min(b.top, r.top), right: Math.max(b.right, r.right), bottom: Math.max(b.bottom, r.bottom) } : r;
  }
  return b;
}

// pngjs 이미지의 (x, y) RGBA.
function pixel(png, x, y) {
  const i = (y * png.width + x) * 4;
  return [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]];
}

module.exports = { CELL, expectedOn, visibleBounds, pixel };
