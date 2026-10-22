// 游戏 SDK 核心：纯 TS，不依赖 React。网页游戏用 windowTransport 接平台；没有 DOM 的环境自己实现 Transport。
export { createClient, OrphanError, parseEnv, type ClientOptions, type ClientState, type OutMessage, type ShootaClient, type SuspendReason, type Timers, type Transport } from './client';
export { COMPACT_HEADER_BELOW, shellLayout, type ShellLayout } from './layout';
export type { SdkShell, SdkWelcomeWithShell, ShellOrientation, ShellPrefs } from './protocolExt';
export { GameStorage, type StorageOp } from './storage';
export { captureBootErrors, windowTransport } from './window';
export type { Orientation, PlayEnv, PlayGame, PlayUser, RunEnv } from '../../shared/protocol';
export type { AchievementDef, GameSave } from '../../shared/save';
