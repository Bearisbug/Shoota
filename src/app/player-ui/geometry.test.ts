import { describe, expect, it } from 'vitest';
import { clampToArea, FLOAT, panelPlacement, PANEL_W, placeSpot, popoverPos, snap, type Area } from './geometry';

const PORTRAIT: Area = { x: 0, y: 0, w: 393, h: 852 };
const LANDSCAPE: Area = { x: 0, y: 0, w: 852, h: 393 };
const center = (p: { x: number; y: number }) => ({ x: p.x + FLOAT.size / 2, y: p.y + FLOAT.size / 2 });
// 按住按钮中心拖到 (x, y) 松手
const dropAt = (a: Area, x: number, y: number) => placeSpot(a, snap(a, clampToArea(a, { x: x - FLOAT.size / 2, y: y - FLOAT.size / 2 })));

describe('悬浮按钮的位置（TC-PLAY-001、TC-PLAY-002、TC-PLAY-014、TC-PLAY-019）', () => {
  it('默认贴右边缘、游戏区垂直居中，离边缘 8', () => {
    const p = placeSpot(PORTRAIT, null);
    expect(393 - (p.x + FLOAT.size)).toBe(8);
    expect(center(p).y).toBe(426);
    expect(center(placeSpot(LANDSCAPE, null)).y).toBeCloseTo(196.5);
  });

  it('拖到 (60, 150) 松手贴到左边，中心高度不变；同一游戏区里放回原处', () => {
    const spot = snap(PORTRAIT, clampToArea(PORTRAIT, { x: 60 - 22, y: 150 - 22 }));
    expect(spot.side).toBe('left');
    const p = placeSpot(PORTRAIT, spot);
    expect(p.x).toBe(8);
    expect(center(p).y).toBeCloseTo(150, 5);
  });

  it('拖到右下角松手，下边离游戏区底边不少于 8', () => {
    const p = dropAt(PORTRAIT, 380, 850);
    expect(p.x + FLOAT.size).toBe(393 - 8);
    expect(852 - (p.y + FLOAT.size)).toBeGreaterThanOrEqual(8);
  });

  it('横屏 iPhone 左右安全区 62、下 20：按钮离屏幕右边缘 70，拖到最右边仍是 70', () => {
    const a: Area = { x: 62, y: 0, w: 750, h: 382 };
    expect(874 - (placeSpot(a, null).x + FLOAT.size)).toBe(70);
    expect(874 - (dropAt(a, 874, 200).x + FLOAT.size)).toBe(70);
    expect(dropAt(a, 0, 200).x).toBe(62 + 8);
  });

  it('记住的位置放不进当前游戏区时放回默认', () => {
    const near = { side: 'left' as const, y: 0.03 }; // 竖屏 852 高时中心 25.6，按钮顶到 3.6，进了边距
    expect(placeSpot(PORTRAIT, near)).toEqual(placeSpot(PORTRAIT, null));
    const ok = { side: 'left' as const, y: 0.2 };
    expect(placeSpot(PORTRAIT, ok).x).toBe(8);
  });

  it('拖动中整个按钮不出游戏区', () => {
    expect(clampToArea(PORTRAIT, { x: -50, y: 2000 })).toEqual({ x: 0, y: 852 - 44 });
  });
});

describe('游戏面板的形态（TC-PLAY-004、TC-PLAY-005）', () => {
  it('横屏高 ≤ 500 从右侧滑出，其余宽 < 760 从底部弹出，平板与电脑在按钮旁', () => {
    expect(panelPlacement(393, 852)).toBe('sheet');
    expect(panelPlacement(852, 393)).toBe('side');
    expect(panelPlacement(734, 343)).toBe('side');
    expect(panelPlacement(820, 1180)).toBe('popover');
    expect(panelPlacement(1440, 900)).toBe('popover');
  });

  it('按钮旁弹出时整块在游戏区内，不压住按钮', () => {
    const a: Area = { x: 0, y: 0, w: 820, h: 1180 };
    const btn = placeSpot(a, null);
    const at = popoverPos(a, btn, 480);
    expect(at.x + PANEL_W).toBeLessThanOrEqual(btn.x);
    expect(at.x).toBeGreaterThanOrEqual(8);
    expect(at.y + 480).toBeLessThanOrEqual(1180 - 8);
    const left = placeSpot(a, { side: 'left', y: 0.95 });
    const at2 = popoverPos(a, left, 480);
    expect(at2.x).toBeGreaterThanOrEqual(left.x + FLOAT.size);
    expect(at2.y + 480).toBeLessThanOrEqual(1180 - 8);
  });
});
