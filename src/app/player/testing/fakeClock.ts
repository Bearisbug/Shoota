// 单测用的假时钟：手动推进时间、手动切前后台。推进时每触发一个计时器都先让出微任务，
// 下载、读档这类 await 链能在两次触发之间跑完。

import type { Clock } from '../clock';

type TimerId = ReturnType<typeof setTimeout>;

// 让出一轮宏任务：之前排下的微任务（promise 回调）都跑完
export const settle = () => new Promise<void>(r => setTimeout(r, 0));

export class FakeClock implements Clock {
  t = 0;
  private seq = 0;
  private timers = new Map<number, { at: number; fn: () => void }>();
  private isHidden = false;
  private listeners = new Set<() => void>();

  now() {
    return this.t;
  }

  setTimeout(fn: () => void, ms: number): TimerId {
    const id = ++this.seq;
    this.timers.set(id, { at: this.t + Math.max(0, ms), fn });
    return id as unknown as TimerId;
  }

  clearTimeout(id: TimerId | undefined) {
    if (id !== undefined) this.timers.delete(id as unknown as number);
  }

  hidden() {
    return this.isHidden;
  }

  onVisibilityChange(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  setHidden(hidden: boolean) {
    this.isHidden = hidden;
    for (const fn of [...this.listeners]) fn();
  }

  get pending() {
    return this.timers.size;
  }

  // 推进 ms 毫秒，按到期先后逐个触发
  async advance(ms: number) {
    const end = this.t + ms;
    await settle();
    for (;;) {
      let next: [number, { at: number; fn: () => void }] | null = null;
      for (const e of this.timers) if (e[1].at <= end && (!next || e[1].at < next[1].at)) next = e;
      if (!next) break;
      this.timers.delete(next[0]);
      this.t = next[1].at;
      next[1].fn();
      await settle();
    }
    this.t = end;
    await settle();
  }
}
