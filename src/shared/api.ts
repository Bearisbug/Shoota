// 平台页面、看板与 Worker 之间的接口形状，见 docs/DESIGN.md §8。旧接口（API-001～API-005）的字段原样沿用。

import type { AchievementDef } from './save';
import type { LaunchFailReason } from './telemetry';
import type { RunEnv } from './protocol';

// 错误信封：application/problem+json
export interface Problem { type: ErrorType; title: string; status: number; instance: string }

export type ErrorType =
  | '/errors/bad-event'
  | '/errors/bad-merge'
  | '/errors/not-logged-in'
  | '/errors/bad-launch'
  | '/errors/bad-cloud-request'
  | '/errors/cloud-auth'
  | '/errors/cloud-not-found'
  | '/errors/cloud-exists'
  | '/errors/cloud-too-large'
  | '/errors/recovery-code-unknown';

/* ───────── API-001 上报 POST /api/e ───────── */
export type CollectType = 'visit' | 'start' | 'play' | 'backup' | 'restore';
export interface CollectEvent { t: CollectType; g?: string; s?: number }
export interface CollectBody { v: string; o?: 1; ev: CollectEvent[] }

/* ───────── API-005 合并旅客 POST /api/merge ───────── */
export interface MergeBody { v: string; from: string }

/* ───────── API-004 看板数据 GET /kanban/data ───────── */
export interface PeriodStat { active: number; new: number; seconds: number }

export interface KanbanData {
  today: string;
  statsStart: string;
  priorSince: string;
  generatedAt: number;
  overview: { today: PeriodStat; d7: PeriodStat; d30: PeriodStat; backups30: number; restores30: number };
  trend: { day: string; active: number; new: number; seconds: number }[];
  retention: { day: string; n: number; r1: number | null; r7: number | null; r30: number | null }[];
  games: { id: string; title: string; players: number; starts: number; seconds: number; nextDay: { n: number; r: number } }[];
  sources: { total: number; wechat: number; mobile: number; desktop: number; countries: { code: string; n: number }[] };
  launch: KanbanLaunch; // 新增块，旧看板页面不读它
}

// 近 7 天的启动情况；成功率 = ready ÷ starts，没回音 = starts − ready − fail − cancel
export interface LaunchCounts {
  starts: number;
  ready: number;
  fail: number;
  cancel: number;
  b1: number; // 就绪耗时 ≤ 1 秒
  b3: number; // 1～3 秒
  b10: number; // 3～10 秒
  b30: number; // 10～30 秒
  bx: number; // 超过 30 秒
  fsTry: number;
  fsOk: number;
}

export interface KanbanLaunch {
  from: string; // 起始北京日期，含
  total: LaunchCounts;
  byCountry: (LaunchCounts & { country: string })[]; // 按开始次数降序，前 10
  byGame: (LaunchCounts & { id: string; title: string })[];
  byEnv: (LaunchCounts & { env: RunEnv })[];
  reasons: { country: string; reason: LaunchFailReason; n: number }[];
}

/* ───────── 云存档 ───────── */
// 鉴权头：Authorization: Save <saveId>
export const SAVE_AUTH_SCHEME = 'Save';

export type SaveEncoding = 'json' | 'gz64'; // 原文 JSON / gzip 后 base64

// API-CLOUD-001 POST /api/cloud/account
export interface CloudAccountBody { code: string }
export interface CloudAccountResult { created: boolean } // 201 新建；200 同一编号同一恢复码已存在

// API-CLOUD-002 POST /api/cloud/recover
export interface CloudRecoverBody { code: string }
export interface CloudRecoverResult {
  saveId: string;
  games: { g: string; s: number; at: number }[]; // 云端有哪些游戏，确认页据此列出取回范围，不含存档正文
}

// API-CLOUD-003 POST /api/cloud/sync
export interface CloudGamePush {
  g: string;
  base: number; // 这份存档是在哪个云端版本上改的，本机从没同步过写 0
  enc: SaveEncoding;
  body: string;
  bytes: number; // JSON 原文字节数
  s: number; // 累计游玩秒数
  last: number; // 最近游玩，Unix 毫秒
  status: string;
  at: number; // 本机最后改存档的时间，Unix 毫秒
  force?: true; // 撤销替换时用：不比较，直接覆盖云端
}

export interface CloudMetaData {
  wish: string[];
  ach: Record<string, Record<string, number>>; // 游戏 → 成就键 → 解锁时间
  achDefs: Record<string, AchievementDef[]>;
}

export interface CloudMetaPush { base: number; data: CloudMetaData; at: number }

export interface CloudSyncBody {
  have: Record<string, number>; // 本机已有的各游戏云端版本
  haveMeta: number;
  push: CloudGamePush[];
  meta?: CloudMetaPush;
}

export type CloudPushOutcome =
  | 'ok' // 写入云端
  | 'kept-cloud' // 冲突时云端那份游玩时长更长或更晚，云端不变，云端那份在 pull 里
  | 'too-soon' // 同一款游戏 10 秒内写过，下次再推
  | 'too-big'; // 按上传编码后的正文超过 1 MB，不上云（RULE-CLOUD-002）

export interface CloudPushResult { g: string; r: CloudPushOutcome; rev: number }

export interface CloudGameRow {
  g: string;
  rev: number;
  enc: SaveEncoding;
  body: string;
  bytes: number;
  s: number;
  last: number;
  status: string;
  at: number;
  beat?: number; // 这一版是冲突胜出或强制覆盖写进来的，被替换掉的是哪个版本
}

export interface CloudSyncResult {
  results: CloudPushResult[];
  pull: CloudGameRow[]; // 云端版本比 have 新的游戏
  meta?: { rev: number; data: CloudMetaData; at: number }; // 云端元数据比 haveMeta 新时才带
  now: number;
}

/* ───────── API-LAUNCH-001 启动遥测 POST /api/launch ───────── */
export type { LaunchBatch, LaunchEvent } from './telemetry';
