// 浏览器本地数据的键名与形状。旧版 public/index.html（dd731d6）写下的数据原样沿用，见 docs/DESIGN.md §9。
// 平台页面、Service Worker 与 Worker 都可引用，这里不出现 DOM 类型。

export const META_KEY = 'changju.meta.v1'; // 平台元数据，localStorage；只做浅合并，未知字段原样保留
export const MOVED_KEY = 'changju.moved'; // 搬家标记：'1'～'3' 是第几次去查，'done' 是查完了
export const CLOUD_KEY = 'changju.cloud.v1'; // 云存档本机状态，单独一个键，旧标签页写回元数据时不会冲掉它
export const UI_KEY = 'changju.ui.v1'; // 悬浮按钮位置等界面偏好

export const IDB_NAME = 'changju';
export const IDB_VERSION = 1;
export const IDB_STORES = { kv: 'kv', games: 'games' } as const;

// 没有注册：每个浏览器只有一个本机玩家，旧版的 session.email 固定为 'local'
export const LOCAL_PLAYER = 'local';
export const saveKey = (gid: string, player: string = LOCAL_PLAYER) => `${player}|${gid}`;
export const undoKey = (gid: string) => `undo:${gid}`;

// 一款游戏的存档：游戏眼里的 localStorage 快照，键和值都是字符串。旧运行层与 SDK v2 读写同一份
export type GameSave = Record<string, string>;

export interface AchievementDef { key: string; name: string }

export interface GameStat {
  seconds: number; // 累计游玩秒数
  last: number; // 最近一次游玩，Unix 毫秒
  ach: Record<string, number>; // 成就键 → 解锁时间
  status: string; // 游戏自报的进度文字，最多 60 字
}

export interface LocalUser { nickname: string; created: number }

export interface MetaV1 {
  session: { email: string; at: number } | null;
  users: Record<string, LocalUser>;
  stats: Record<string, Record<string, GameStat>>; // 玩家 → 游戏 → 统计
  wish: Record<string, string[]>; // 玩家 → 愿望单里的游戏
  achDefs: Record<string, AchievementDef[]>; // 游戏 → 成就定义
  sendLog: Record<string, unknown>; // 旧版留下的字段，新版不读，只保留
  vid?: string; // 旅客编号，32 位小写十六进制
  old?: 1; // 领编号时本机已有平台数据
  [field: string]: unknown;
}

// 存档码 CJ1（gzip 后 base64）/ CJ0（直接 base64）包着的 JSON
export interface SavePackV1 {
  v: 1;
  at: number;
  saves: Record<string, GameSave>;
  stats: Record<string, GameStat>;
  wish: string[];
  achDefs: Record<string, AchievementDef[]>;
}

// changju.cloud.v1：这个浏览器的云存档状态
export interface CloudGameSync {
  rev: number; // 上次和云端对齐时的版本号
  hash: string; // 上次对齐时存档内容的摘要，用来判断本机改过没有
  s: number; // 上次对齐时的游玩秒数：本机累计秒数比它多也算改过（FLOW-CLOUD-SYNC S1）
  at: number; // 上次对齐时间，Unix 毫秒
}

export interface CloudLocalState {
  v: 1;
  saveId: string; // 32 位小写十六进制，只存在玩家的浏览器里
  code: string; // 恢复码，16 位 Crockford base32，不带连字符
  games: Record<string, CloudGameSync>;
  meta: { rev: number; hash: string };
  lastSyncAt: number;
  tooBig: string[]; // 超过上限、没有上云的游戏
}

// IndexedDB kv 里 undo:<gid> 的值：被云端版本替换掉的本机存档，一款游戏只留最近一份
export interface UndoSlot {
  save: GameSave;
  stat: GameStat | null;
  at: number; // 被替换的时间
  why: 'conflict' | 'recover';
}

// changju.ui.v1
export interface UiPrefsV1 {
  v: 1;
  float: Record<string, { portrait?: FloatSpot; landscape?: FloatSpot }>; // 游戏 → 各方向下悬浮按钮的位置
  rotateHintSeen: Record<string, 1>; // 已经提示过旋转的游戏
  wechatHintAt?: number; // 上次自动弹出「在浏览器打开」的时间
  installHintAt?: number; // 上次提示「添加到主屏幕」的时间
}

export interface FloatSpot { side: 'left' | 'right'; y: number } // y 是按钮中心占游戏区高度的比例，0～1
