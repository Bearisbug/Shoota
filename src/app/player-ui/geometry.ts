// 游戏页的几何：悬浮按钮落在哪、面板用哪种形态与放在哪（§13 悬浮按钮、游戏面板）。坐标一律是视口 CSS 像素。

import type { FloatSpot } from '../../shared/save';

export const FLOAT = {
  size: 44, // 按钮边长
  gap: 8, // 离游戏区边缘
  slop: 8, // 按下后移动不到这么多算点击
  idleMs: 3000, // 没碰多久后变淡
  dotMs: 2000, // 存档小点亮多久
} as const;

export const PANEL_W = 320;

/** 游戏区：视口四边各扣掉安全区后的矩形 */
export interface Area { x: number; y: number; w: number; h: number }
/** 按钮左上角 */
export interface Pos { x: number; y: number }

export const DEFAULT_SPOT: FloatSpot = { side: 'right', y: 0.5 };

const { size, gap } = FLOAT;
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

// 记住的位置放进当前游戏区后，按钮整个在游戏区里、离边缘不少于 gap 才算放得下（容 0.5 像素舍入）
function fits(area: Area, spot: FloatSpot) {
  const cy = area.y + spot.y * area.h;
  return cy - size / 2 >= area.y + gap - 0.5 && cy + size / 2 <= area.y + area.h - gap + 0.5;
}

/** 位置 → 按钮左上角；没记过或放不下时用默认（右边缘、垂直居中） */
export function placeSpot(area: Area, spot: FloatSpot | null): Pos {
  const s = spot && fits(area, spot) ? spot : DEFAULT_SPOT;
  const x = s.side === 'left' ? area.x + gap : area.x + area.w - gap - size;
  const y = clamp(area.y + s.y * area.h - size / 2, area.y + gap, area.y + area.h - gap - size);
  return { x, y };
}

/** 拖动中跟手，但整个按钮不出游戏区 */
export const clampToArea = (area: Area, p: Pos): Pos => ({
  x: clamp(p.x, area.x, area.x + area.w - size),
  y: clamp(p.y, area.y, area.y + area.h - size),
});

/** 松手：贴到最近的左边或右边，高度留在游戏区内，离上下边缘不少于 gap */
export function snap(area: Area, p: Pos): FloatSpot {
  const side = p.x + size / 2 < area.x + area.w / 2 ? 'left' : 'right';
  const top = clamp(p.y, area.y + gap, area.y + area.h - gap - size);
  const y = area.h > 0 ? (top + size / 2 - area.y) / area.h : 0.5;
  return { side, y: Math.min(1, Math.max(0, y)) };
}

export type Placement = 'sheet' | 'side' | 'popover';

/** 手机横屏（高 ≤ 500）从右侧滑出；其余宽 < 760 从底部弹出；平板与电脑在按钮旁弹出 */
export function panelPlacement(vw: number, vh: number): Placement {
  if (vw > vh && vh <= 500) return 'side';
  if (vw < 760) return 'sheet';
  return 'popover';
}

/** 按钮旁弹出的面板：放在按钮朝游戏区中间的一侧，顶边与按钮对齐，整块留在游戏区内 */
export function popoverPos(area: Area, btn: Pos, panelH: number): Pos {
  const onRight = btn.x + size / 2 >= area.x + area.w / 2;
  const x = onRight ? btn.x - gap - PANEL_W : btn.x + size + gap;
  return {
    x: clamp(x, area.x + gap, area.x + area.w - gap - PANEL_W),
    y: clamp(btn.y, area.y + gap, area.y + area.h - gap - panelH),
  };
}
