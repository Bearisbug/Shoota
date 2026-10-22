// 两种运行层共用的接口：运行层只负责 iframe 与消息，存档、计时与界面由 player.ts 按回调去做。

import type { Orientation, PlayEnv } from '../../shared/protocol';
import type { StorageOp } from './playSession';

export interface RunnerHandlers {
  storage(m: StorageOp): void;
  status(text: string): void;
  defs(list: unknown[]): void;
  unlock(key: string): void;
  exit(): void;
  ready(): void; // 就绪信号，只会来自当前 iframe
  bootError(message: string): void; // 就绪前游戏报错
  orientation(prefer: Orientation): void; // 只有 SDK v2 游戏会发
  shell(orientation: 'portrait' | 'landscape', expanded: boolean): void; // GameShell 顶部信息区展开或收起，只有 SDK v2 游戏会发
}

export interface Runner {
  readonly frame: HTMLIFrameElement;
  sendEnv(env: PlayEnv): void;
  suspend(reason: 'exit' | 'hidden'): Promise<void>; // 请游戏收尾，最多等 PLAY.suspendWaitMs
  destroy(): void;
}
