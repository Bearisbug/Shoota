// 平台页面与游戏之间的 postMessage 协议，见 docs/DESIGN.md API-SDK-001～API-SDK-004。
// 两种运行层并存：旧单文件游戏走 Platform 1.0（消息带 __cj: 1，平台注入 BOOT 脚本代游戏收发），
// 改写后的游戏走 SDK v2（消息带 ns: 'shoota' 与 sdk: 2）。两种运行层读写同一份存档（save.ts 的 GameSave），
// 一款游戏从旧运行层换成 SDK v2 时玩家的进度不用迁移。

import type { AchievementDef, GameSave } from './save';

export type Orientation = 'portrait' | 'landscape' | 'any';
export type RunEnv = 'browser' | 'wechat' | 'standalone'; // 普通浏览器 / 微信内置浏览器 / 添加到主屏幕后打开
export type Runtime = 'legacy' | 'play';

export interface PlayGame { id: string; title: string }
export interface PlayUser { id: string; nickname: string } // id 是本机玩家名的摘要，不是旅客编号，也不是云存档编号

/* ───────── SDK v2 ───────── */

export const SDK_NS = 'shoota';
export const SDK_VERSION = 2;

interface Envelope<T extends string> { ns: typeof SDK_NS; sdk: typeof SDK_VERSION; type: T }

// 游戏区的实时环境；横竖屏、全屏、安全区变化时平台发 env 消息
export interface PlayEnv {
  orientation: 'portrait' | 'landscape';
  fullscreen: boolean;
  width: number; // 游戏区宽高，CSS 像素，已扣掉安全区
  height: number;
  safe: { top: number; right: number; bottom: number; left: number }; // 游戏区外沿到屏幕安全区的距离，平台已留出，游戏一般不用再处理
  run: RunEnv;
  reducedMotion: boolean;
}

// 游戏 → 平台
export type SdkHello = Envelope<'hello'> & { game: string; build?: string }; // SDK 载入后立即发，平台回 welcome
export type SdkReady = Envelope<'ready'>; // 第一帧可交互画面出来后发，平台据此关掉载入页（FLOW-LAUNCH S3、S4）
export type SdkStorage = Envelope<'storage'> & (
  | { op: 'set'; key: string; value: string }
  | { op: 'del'; key: string }
  | { op: 'clear' }
);
export type SdkUnlock = Envelope<'unlock'> & { key: string };
export type SdkDefs = Envelope<'defs'> & { list: AchievementDef[] };
export type SdkStatus = Envelope<'status'> & { text: string };
export type SdkOrientation = Envelope<'orientation'> & { prefer: Orientation }; // 游戏运行中改偏好方向，如进入横屏比赛
export type SdkExit = Envelope<'exit'>;
export type SdkError = Envelope<'error'> & { message: string }; // 就绪前出错时发，平台记入失败原因
export type SdkSuspended = Envelope<'suspended'>; // 收到 suspend 后存完档时回

export type GameToPlatform =
  | SdkHello | SdkReady | SdkStorage | SdkUnlock | SdkDefs | SdkStatus
  | SdkOrientation | SdkExit | SdkError | SdkSuspended;

// 平台 → 游戏
export type SdkWelcome = Envelope<'welcome'> & { game: PlayGame; user: PlayUser; storage: GameSave; env: PlayEnv };
export type SdkEnv = Envelope<'env'> & { env: PlayEnv };
export type SdkSuspend = Envelope<'suspend'> & { reason: 'exit' | 'hidden' }; // 平台最多等 PLAY.suspendWaitMs

export type PlatformToGame = SdkWelcome | SdkEnv | SdkSuspend;

export type SdkMessage = GameToPlatform | PlatformToGame;

// 只核对信封，字段逐项校验由收方做；来源窗口与 origin 也由收方核对
export function isSdkMessage(m: unknown): m is SdkMessage {
  if (!m || typeof m !== 'object') return false;
  const o = m as { ns?: unknown; sdk?: unknown; type?: unknown };
  return o.ns === SDK_NS && o.sdk === SDK_VERSION && typeof o.type === 'string';
}

/* ───────── Platform 1.0（旧运行层） ───────── */

// 注入给旧游戏的初始化数据，BOOT 脚本据此造出 window.Platform 与假 localStorage
export interface LegacyInit { game: PlayGame; user: PlayUser; storage: GameSave }

// 游戏经 window.Platform 与假 localStorage 发出的消息，字段名沿用旧版
export type LegacyGameMessage =
  | { __cj: 1; type: 'ls-set'; k: string; v: string }
  | { __cj: 1; type: 'ls-del'; k: string }
  | { __cj: 1; type: 'ls-clear' }
  | { __cj: 1; type: 'status'; text: string }
  | { __cj: 1; type: 'defs'; list: unknown[] }
  | { __cj: 1; type: 'unlock'; key: string }
  | { __cj: 1; type: 'exit' };

// BOOT 脚本自己发的启动信号，游戏看不到：DOMContentLoaded 时发 boot-ready，就绪前的第一个未捕获错误发 boot-error
export type LegacyBootMessage =
  | { __cj: 1; type: 'boot-ready' }
  | { __cj: 1; type: 'boot-error'; message: string };

export type LegacyMessage = LegacyGameMessage | LegacyBootMessage;

export function isLegacyMessage(m: unknown): m is LegacyMessage {
  if (!m || typeof m !== 'object') return false;
  const o = m as { __cj?: unknown; type?: unknown };
  return o.__cj === 1 && typeof o.type === 'string';
}

// 旧游戏 iframe 的沙箱与权限，逐字沿用旧版
export const LEGACY_SANDBOX = 'allow-scripts allow-forms allow-pointer-lock allow-popups allow-popups-to-escape-sandbox';
export const LEGACY_ALLOW = 'fullscreen; autoplay';
