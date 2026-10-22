// 方向感知的排版判断，GameShell 与不用 React 的游戏共用（ADR-006、FLOW-ROTATE S4）：
// 宽大于高为横屏；横屏且游戏区高不到 500 像素时，顶部信息区收成一行，点开再展开。

import type { ShellOrientation } from './protocolExt';

export const COMPACT_HEADER_BELOW = 500;

export interface ShellLayout {
  orientation: ShellOrientation;
  compact: boolean; // 顶部信息区该收成一行
  width: number;
  height: number;
}

export function shellLayout({ width, height }: { width: number; height: number }): ShellLayout {
  const orientation: ShellOrientation = width > height ? 'landscape' : 'portrait';
  return { orientation, compact: orientation === 'landscape' && height < COMPACT_HEADER_BELOW, width, height };
}
