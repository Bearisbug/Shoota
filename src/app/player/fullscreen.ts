// 全屏与方向锁定（ADR-008、§13 全屏与引导）。
// 全屏对页面根元素请求，平台浮层都在根下面，全屏后仍可见；安卓 Chrome 只认用户点击里的全屏请求，
// 所以 requestFullscreen 必须在点击回调里同步调用，await 之后再锁方向。锁定失败不报错，方向不符时改为提示旋转。

import type { Orientation } from '../../shared/protocol';
import type { FullscreenResult } from '../../shared/telemetry';

type OrientationLock = 'portrait' | 'landscape';
type LockableOrientation = ScreenOrientation & { lock?: (o: OrientationLock) => Promise<void>; unlock?: () => void };

export const isFullscreen = () => !!document.fullscreenElement;

export async function lockOrientation(prefer: Orientation): Promise<boolean> {
  const o = screen.orientation as LockableOrientation | undefined;
  if (prefer === 'any') {
    try { o?.unlock?.(); } catch { /* 没锁过 */ }
    return false;
  }
  if (!isFullscreen() || !o?.lock) return false;
  try {
    await o.lock(prefer);
    return true;
  } catch {
    return false;
  }
}

export interface FullscreenOutcome { ok: boolean; locked: boolean }

// 进入全屏并按偏好锁方向。调用必须发生在点击回调里（第一句 await 之前就发出请求）
export async function enterFullscreen(prefer: Orientation): Promise<FullscreenOutcome> {
  const el = document.documentElement;
  if (!document.fullscreenEnabled || typeof el.requestFullscreen !== 'function') return { ok: false, locked: false };
  if (isFullscreen()) return { ok: true, locked: await lockOrientation(prefer) };
  try {
    await el.requestFullscreen({ navigationUI: 'hide' });
  } catch {
    return { ok: false, locked: false };
  }
  // 有的 WebView 不报错也不全屏，按 fullscreenElement 为准
  if (!isFullscreen()) return { ok: false, locked: false };
  return { ok: true, locked: await lockOrientation(prefer) };
}

export async function exitFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
  } catch { /* 已经退出 */ }
}

export function onFullscreenChange(fn: () => void): () => void {
  document.addEventListener('fullscreenchange', fn);
  return () => document.removeEventListener('fullscreenchange', fn);
}

export const toResult = (tried: boolean, ok: boolean): FullscreenResult => (!tried ? 0 : ok ? 2 : 1);
