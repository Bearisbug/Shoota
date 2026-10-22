// 平台页面依赖的能力：本机数据、存档码、云存档与启动前钩子。页面只经这里取数与改数，不直接碰 localStorage 与 IndexedDB。
// 实现由 src/platform 提供，在 src/app/wiring.ts 接线；测试用 src/app/mock.ts 的内存版。

import { createContext, useContext, useSyncExternalStore, type ComponentType } from 'react';
import type { GameEntry } from '../catalog';
import type { AchievementDef, CloudRecoverResult, CollectEvent, GameStat, SavePackV1, UndoSlot } from '../shared';

export interface CloudView {
  code: string; // 恢复码，16 位，不带连字符
  lastSyncAt: number; // 上次同步成功的时间，Unix 毫秒；0 表示开通后还没同步成功过
  tooBig: readonly string[]; // 超过 1 MB、只存在本机的游戏（RULE-CLOUD-002）
  stopped: boolean; // 云端鉴权失败（/errors/cloud-auth），已停止同步
  notice: boolean; // 刚开通，商店顶部还没提示过恢复码（FLOW-CLOUD-FIRST S4）
}

export interface PlatformSnapshot {
  stats: Readonly<Record<string, GameStat>>; // 本机玩家各游戏的统计，即 changju.meta.v1 的 stats.local
  wish: readonly string[];
  achDefs: Readonly<Record<string, AchievementDef[]>>;
  cloud: CloudView | null; // null：这个浏览器还没开通云存档
  undo: Readonly<Record<string, Pick<UndoSlot, 'at' | 'why'>>>; // 30 天内可撤销的被替换存档（FLOW-CLOUD-CONFLICT S3）
}

// 恢复码查找与取回的结果，与 src/platform 的 recover / adopt 同形
export type RecoverLookup =
  | { ok: true; code: string; saveId: string; games: CloudRecoverResult['games'] }
  | { ok: false; why: 'format' | 'own' | 'unknown' | 'network' }; // format：规整后不是 16 位；own：就是这台设备在用的恢复码

export type RecoverAdopt =
  | { ok: true; restored: number } // 取回了几款；中途断网时已写进本机的照算，其余下次同步补齐
  | { ok: false; why: 'expired' | 'unavailable' | 'network' | 'storage' }; // expired：云端没有这份了；unavailable：鉴权失败；storage：本机写不进

export interface PlatformServices {
  /** 启动顺序沿用旧版：建本机玩家 → 地址以 #move= 开头时搬家导入（会改写地址）→ 领旅客编号 → 上报 visit。
   *  resolve 为 true 后才按地址显示页面；false 表示 head 里的搬家检查正在跳去搬家页，平台整体不启动 */
  boot(): Promise<boolean>;
  /** 数据没变时返回同一个对象（useSyncExternalStore 的要求） */
  getSnapshot(): PlatformSnapshot;
  subscribe(onChange: () => void): () => void;
  /** 切换愿望单，返回切换后是否在愿望单里 */
  toggleWish(gid: string): boolean;
  track(ev: CollectEvent): void;
  packSaves(): Promise<SavePackV1>;
  encodeSaves(pack: SavePackV1): Promise<string>;
  /** 读不出时抛 Error：message 为 'old'（CJ1 但浏览器没有 DecompressionStream）或 'bad' */
  decodeSaves(code: string): Promise<SavePackV1>;
  /** 逐款直接替换，返回导入的款数（旧版 applySaves） */
  applySaves(pack: SavePackV1): Promise<number>;
  dismissCloudNotice(): void;
  /** 玩家输入的原文，规整在平台侧（去空格连字符、I L 当 1、O 当 0） */
  recoverLookup(input: string): Promise<RecoverLookup>;
  /** 玩家确认后，这台设备改用这个云存档 */
  recoverAdopt(saveId: string, code: string): Promise<RecoverAdopt>;
  /** 撤销：换回撤销槽那份并强制推上云端。槽已过期返回 false，本机写不进时 reject */
  restoreUndo(gid: string): Promise<boolean>;
  /** 同步把本机存档换成了云端那份（冲突输了），参数是这次被换掉的游戏 */
  onCloudReplaced(listener: (gids: string[]) => void): () => void;
  /** 玩家点了开始游戏，在同一次点击里同步调用：安卓手机全屏并锁方向（ADR-008），不能 await 之后再调。
   *  App 在文档上统一拦 #play- 链接的点击来调它，页面不用自己调 */
  beforeLaunch(game: GameEntry): void;
}

export interface PlayerProps {
  game: GameEntry;
  /** 退出游戏：载入页、失败页、面板里的退出与 Platform.exit() 都调它，平台回到这款游戏的详情页 */
  onExit(): void;
}

export interface AppDeps {
  services: PlatformServices;
  /** 游戏页，src/app/player-ui/PlayerPage.tsx；卸载即退出游戏（存档、报时长、退出全屏） */
  Player: ComponentType<PlayerProps>;
}

const ServicesContext = createContext<PlatformServices | null>(null);
export const ServicesProvider = ServicesContext.Provider;

export function useServices(): PlatformServices {
  const s = useContext(ServicesContext);
  if (!s) throw new Error('useServices 需要在 <ServicesProvider> 里使用');
  return s;
}

export function useSnapshot(): PlatformSnapshot {
  const s = useServices();
  return useSyncExternalStore(s.subscribe, s.getSnapshot, s.getSnapshot);
}
