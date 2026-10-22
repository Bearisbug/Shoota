// SDK v2 在共享协议之外多出的一条消息：GameShell 顶部信息区的展开状态要跨次记住（FLOW-ROTATE S4、ADR-006
// 「玩家展开过信息区，同一方向下次仍展开」），共享协议里还没有它的位置。平台按游戏记在 changju.ui.v1，welcome 时带回来。
// 待并入 src/shared/protocol.ts（API-SDK-003）；并入后这里改为从共享协议重导出。

import type { SDK_NS, SDK_VERSION, SdkWelcome } from '../../shared/protocol';

export type ShellOrientation = 'portrait' | 'landscape';

// 只记展开过的方向；没有记录就是收起
export type ShellPrefs = Partial<Record<ShellOrientation, boolean>>;

// 游戏 → 平台：玩家展开或收起了顶部信息区
export interface SdkShell {
  ns: typeof SDK_NS;
  sdk: typeof SDK_VERSION;
  type: 'shell';
  orientation: ShellOrientation;
  expanded: boolean;
}

// 平台 → 游戏：welcome 多带一份展开状态
export type SdkWelcomeWithShell = SdkWelcome & { shell?: ShellPrefs };
