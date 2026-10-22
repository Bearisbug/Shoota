// 舞台排版。旧版把 390×760 的整块舞台（顶栏、秤、台面、暂存台、道具）等比缩放，横屏时缩到 0.44 倍。
// 改写后顶栏交给 GameShell 的顶部信息区、道具放进 GameShell 的侧栏，舞台只剩秤、台面、暂存台三块，铺满核心区：
// 竖屏三块上下排，与旧版相同；横屏秤与暂存台在左、台面在右。缩放沿用旧版 k = max(.3, min(宽比, 高比, 1.35))，
// 放大后多出来的空间分到块与块之间（每处最多 32），其余两边均分，舞台始终等于核心区。
import type { Group } from './model';

// 舞台外的几块固定尺寸，App 按它们排，fit.test.ts 按它们算核心区占比
export const CHROME = {
  head: 58, // 顶部信息区展开：两行，同旧版顶栏
  line: 44, // 横屏收成一行
  dockRow: 72, // 竖屏道具栏高：道具 52，上下各 10
  dockCol: 112, // 横屏道具栏宽：道具 96，左 4 右 12（角标探出 5）
};

// 各块在旧版坐标里的纵向范围：秤从标签「药包放这台」起，台面到抽屉标签下沿，暂存台到「暂存台 n/m」下沿
const S = { y0: 48, y1: 243 }, B = { y0: 243, y1: 589 }, T = { y0: 589, y1: 672 };
// 横屏台面单独一列：上沿让出最高一层药包探出台面的 7 像素，左右各留 8
const BL = { x0: 6, x1: 384, y0: 236, y1: 589 };
const COL = 390; // 秤与暂存台的宽，同旧版舞台

export type Off = Record<Group, { x: number; y: number }>;
export interface StageFit { k: number; w: number; h: number; off: Off } // w、h 是舞台的逻辑尺寸，乘 k 等于核心区

const scaleFor = (cw: number, ch: number, minW: number, minH: number) => Math.max(.3, Math.min(cw / minW, ch / minH, 1.35));

export function fitStage(orientation: 'portrait' | 'landscape', cw: number, ch: number): StageFit {
  if (orientation === 'portrait') {
    const minH = T.y1 - S.y0;
    const k = scaleFor(cw, ch, COL + 20, minH), w = cw / k, h = ch / k;
    const x = (w - COL) / 2;
    const extra = Math.max(0, h - minH), gap = Math.min(32, extra / 4), y = (extra - 2 * gap) / 2 - S.y0;
    return { k, w, h, off: { S: { x, y }, B: { x, y: y + gap }, T: { x, y: y + 2 * gap } } };
  }
  const colR = BL.x1 - BL.x0, hS = S.y1 - S.y0, hL = hS + T.y1 - T.y0, hR = BL.y1 - BL.y0;
  const minW = 8 + COL + 4 + colR + 8;
  const k = scaleFor(cw, ch, minW, hR), w = cw / k, h = ch / k;
  const gapX = 4 + Math.min(28, Math.max(0, w - minW) / 3), x = (w - COL - gapX - colR) / 2;
  const gapY = Math.min(32, Math.max(0, h - hL) / 3), top = (h - hL - gapY) / 2;
  return {
    k, w, h,
    off: {
      S: { x, y: top - S.y0 },
      T: { x, y: top + hS + gapY - T.y0 },
      B: { x: x + COL + gapX - BL.x0, y: (h - hR) / 2 - BL.y0 },
    },
  };
}

// 特效给的是旧版坐标，按纵向位置归到秤、台面或暂存台
export function place(fit: StageFit, x: number, y: number) {
  const g: Group = y < S.y1 ? 'S' : y < B.y1 ? 'B' : 'T';
  return { x: x + fit.off[g].x, y: y + fit.off[g].y };
}
