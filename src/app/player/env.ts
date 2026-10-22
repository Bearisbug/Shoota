// 打开环境与设备类别，决定全屏怎么做（§13 全屏与引导、ADR-008）。
// 判断靠 UA 与触点数：iPadOS 桌面版 UA 写的是 Macintosh，要再看 maxTouchPoints；iPadOS 改 UA 后这条会失效。

import type { RunEnv } from '../../shared/protocol';

export type Device = 'iphone' | 'ipad' | 'android-phone' | 'android-tablet' | 'desktop';

export interface UaInfo {
  ua: string;
  maxTouchPoints: number;
  standalone: boolean; // display-mode: standalone / fullscreen，或 iOS 的 navigator.standalone
}

export function detectDevice({ ua, maxTouchPoints }: Pick<UaInfo, 'ua' | 'maxTouchPoints'>): Device {
  if (/iPhone|iPod/.test(ua)) return 'iphone';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)) return 'ipad';
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'android-phone' : 'android-tablet';
  return 'desktop';
}

export function detectRun({ ua, standalone }: Pick<UaInfo, 'ua' | 'standalone'>): RunEnv {
  if (/MicroMessenger/i.test(ua)) return 'wechat';
  return standalone ? 'standalone' : 'browser';
}

// 游戏面板里全屏那一格放什么：
// auto 安卓手机开局即全屏，面板里也有按钮；button 只在面板里给按钮；install 引导添加到主屏幕；wechat 引导在浏览器打开；none 不显示
export type FullscreenMode = 'auto' | 'button' | 'install' | 'wechat' | 'none';

export function fullscreenMode(device: Device, run: RunEnv, supported: boolean): FullscreenMode {
  if (run === 'wechat') return 'wechat';
  if (device === 'iphone') return run === 'standalone' ? 'none' : 'install';
  if (!supported) return 'none';
  return device === 'android-phone' ? 'auto' : 'button';
}

export const isHandheld = (device: Device) => device !== 'desktop';

export function readUa(): UaInfo {
  const nav = navigator as Navigator & { standalone?: boolean };
  const standalone = nav.standalone === true
    || matchMedia('(display-mode: standalone)').matches
    || matchMedia('(display-mode: fullscreen)').matches;
  return { ua: nav.userAgent, maxTouchPoints: nav.maxTouchPoints || 0, standalone };
}

export interface RuntimeEnv {
  device: Device;
  run: RunEnv;
  fullscreen: FullscreenMode;
}

let cached: RuntimeEnv | null = null;

export function runtimeEnv(): RuntimeEnv {
  if (cached) return cached;
  const info = readUa();
  const device = detectDevice(info);
  const run = detectRun(info);
  const supported = !!document.fullscreenEnabled && typeof document.documentElement.requestFullscreen === 'function';
  cached = { device, run, fullscreen: fullscreenMode(device, run, supported) };
  return cached;
}
