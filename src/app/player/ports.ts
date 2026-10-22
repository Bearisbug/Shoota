// 游戏运行层用到的平台能力，形状对齐 src/platform/ 的 idb.ts、meta.ts、collect.ts 与云同步。
// 平台入口启动时调一次 configurePlayer 接进来；运行层只认这里的形状，单测里换成假的。

import type { CollectEvent } from '../../shared/api';
import type { PlayUser } from '../../shared/protocol';
import type { AchievementDef, GameSave, GameStat } from '../../shared/save';

// 读一款游戏的本机存档：打开存档库与读出各有 4 秒前台超时（LAUNCH.idbOpenMs、idbReadMs），
// 失败后丢掉连接，下一次调用重新打开；同一款的读写排队，云同步正在写这一款时读要等它写完
export type SaveRead = { ok: true; save: GameSave | undefined } | { ok: false; why: 'save-timeout' | 'save-error' };

export interface PlayerPorts {
  readSave(gid: string): Promise<SaveRead>; // 读失败的这款这次不上云（RULE-LAUNCH-001），由平台记下
  writeSave(gid: string, save: GameSave): Promise<boolean>;
  hold(gid: string): void; // 启动或游玩中：云同步不往本机写这一款
  release(gid: string): void;
  user(): PlayUser;
  stat(gid: string): GameStat; // 没有就建一行；改完调 persist
  persist(): void;
  setAchDefs(gid: string, list: AchievementDef[]): void;
  achName(gid: string, key: string): string | undefined; // 目录静态定义优先，其次游戏上报的定义
  track(ev: CollectEvent): void; // API-001
  requestSync(): void; // 退出游戏、页面隐藏时，本机存档写完后调（FLOW-CLOUD-SYNC 触发）
}

let ports: PlayerPorts | null = null;

export function configurePlayer(p: PlayerPorts) {
  ports = p;
}

export function getPorts(): PlayerPorts {
  if (!ports) throw new Error('游戏运行层还没接上平台：入口脚本要先调 configurePlayer');
  return ports;
}
