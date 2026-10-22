// 启动遥测：平台页面在每次启动游戏时上报开始、就绪、失败或取消，见 docs/DESIGN.md API-LAUNCH-001 与 §20。
// 不带旅客编号，也不带云存档编号（INV-CLOUD-002）；看板按天、游戏、国家或地区、打开环境汇总。

import type { RunEnv, Runtime } from './protocol';

export type LaunchPhase = 'start' | 'ready' | 'fail' | 'cancel';

// 失败原因，玩家看到的文案按它选（FLOW-LAUNCH 分支）
export type LaunchFailReason =
  | 'offline' // 发请求时浏览器报告离线
  | 'net-error' // 请求出错
  | 'net-timeout' // 首字节超时
  | 'net-stall' // 下载中途卡住
  | 'net-slow' // 整个下载超时
  | 'http-404'
  | 'http-error' // 其余非 2xx
  | 'save-timeout' // 本机存档库打不开或读不出，超时
  | 'save-error' // 本机存档库报错
  | 'boot-timeout' // 游戏装进页面后迟迟没有就绪信号
  | 'boot-error'; // 就绪前游戏报错

export const LAUNCH_FAIL_REASONS: readonly LaunchFailReason[] = [
  'offline', 'net-error', 'net-timeout', 'net-stall', 'net-slow', 'http-404', 'http-error',
  'save-timeout', 'save-error', 'boot-timeout', 'boot-error',
];

// 全屏结果：0 没试，1 试了没成，2 成了
export type FullscreenResult = 0 | 1 | 2;

export interface LaunchEvent {
  p: LaunchPhase;
  g: string; // 游戏标识
  r: Runtime;
  e: RunEnv;
  ms?: number; // 从开始到这一刻的毫秒数，ready、fail、cancel 必填
  why?: LaunchFailReason; // fail 必填
  n?: 1 | 2; // 第几次尝试，自动重试那次是 2
  c?: 0 | 1; // 游戏文件是否来自本机缓存，ready 时填
  fs?: FullscreenResult; // ready 时填
}

export interface LaunchBatch { ev: LaunchEvent[] }
