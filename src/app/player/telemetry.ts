// 启动遥测（API-LAUNCH-001）：开始、就绪、失败、取消各一条，攒到这一轮事件循环末尾一起发。
// 请求里只有游戏、运行层、打开环境与耗时，不带旅客编号，也不带云存档编号（INV-CLOUD-002）。
// 最多一次：网络失败直接丢弃，不重试；页面隐藏时还没发出的改用 sendBeacon 补发。

import { TELEMETRY } from '../../shared/limits';
import type { LaunchBatch, LaunchEvent } from '../../shared/telemetry';

export const LAUNCH_ENDPOINT = '/api/launch';

export interface ReporterDeps {
  fetch: (url: string, init: RequestInit) => Promise<unknown>;
  beacon?: (url: string, body: Blob) => boolean;
  defer: (fn: () => void) => void;
}

export interface LaunchReporter {
  send(ev: LaunchEvent): void;
  flushBeacon(): void; // 页面隐藏时调
}

const MAX_MS = 600_000;

export function createReporter(deps: ReporterDeps): LaunchReporter {
  let queue: LaunchEvent[] = [];
  let scheduled = false;

  // 按条数与正文字节切批，一批最多 10 条、4 KB
  const batches = (list: LaunchEvent[]) => {
    const out: string[] = [];
    let cur: LaunchEvent[] = [];
    const body = (ev: LaunchEvent[]) => JSON.stringify({ ev } satisfies LaunchBatch);
    for (const ev of list) {
      const next = [...cur, ev];
      if (cur.length && (next.length > TELEMETRY.maxEvents || new TextEncoder().encode(body(next)).length > TELEMETRY.maxBodyBytes)) {
        out.push(body(cur));
        cur = [ev];
      } else cur = next;
    }
    if (cur.length) out.push(body(cur));
    return out;
  };

  const take = () => {
    const list = queue;
    queue = [];
    scheduled = false;
    return batches(list);
  };

  const flush = () => {
    for (const body of take()) {
      deps.fetch(LAUNCH_ENDPOINT, { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } }).catch(() => {});
    }
  };

  return {
    send(ev) {
      const clean: LaunchEvent = { ...ev };
      if (clean.ms !== undefined) clean.ms = Math.min(MAX_MS, Math.max(0, Math.round(clean.ms)));
      queue.push(clean);
      if (!scheduled) {
        scheduled = true;
        deps.defer(flush);
      }
    },
    flushBeacon() {
      for (const body of take()) {
        const blob = new Blob([body], { type: 'application/json' });
        if (deps.beacon?.(LAUNCH_ENDPOINT, blob)) continue;
        deps.fetch(LAUNCH_ENDPOINT, { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } }).catch(() => {});
      }
    },
  };
}

export const browserReporter = (): LaunchReporter =>
  createReporter({
    fetch: (url, init) => fetch(url, init),
    beacon: typeof navigator !== 'undefined' && navigator.sendBeacon ? (url, body) => navigator.sendBeacon(url, body) : undefined,
    defer: fn => queueMicrotask(fn),
  });
