// 游玩中的存档与计时（FLOW-PLAY，REQ-SDK-001）：连续改动合并 700 毫秒写一次，内容没变不写，退出与隐藏时立刻写。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaySession } from './playSession';
import { fakePorts } from './testing/fakePorts';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

function session(save: Record<string, string> = {}, hidden = false) {
  const f = fakePorts();
  let mono = 0;
  const s = new PlaySession('yike', save, { ports: f.ports, hidden: () => hidden, mono: () => mono, now: () => 1_000, onChange: () => {} });
  // 单调时钟与计时器一起走，每步不超过 1 秒
  const advance = (ms: number) => {
    for (let left = ms; left > 0; left -= 1_000) {
      const step = Math.min(1_000, left);
      mono += step;
      vi.advanceTimersByTime(step);
    }
  };
  return { s, f, advance };
}

describe('存档合并写入', () => {
  it('700 毫秒内的连续改动只写一次，写的是最后的内容', () => {
    const { s, f, advance } = session({ 'yike.save': '{"lv":5}' });
    expect(s.status).toEqual({ kind: 'loaded' });
    s.storage({ op: 'set', key: 'yike.save', value: '{"lv":6}' });
    advance(300);
    s.storage({ op: 'set', key: 'yike.save', value: '{"lv":7}' });
    s.storage({ op: 'set', key: 'other', value: '1' });
    advance(399);
    expect(f.ports.writeSave).not.toHaveBeenCalled();
    advance(1);
    expect(f.ports.writeSave).toHaveBeenCalledTimes(1);
    expect(f.ports.writeSave).toHaveBeenCalledWith('yike', { 'yike.save': '{"lv":7}', other: '1' });
    expect(s.status).toEqual({ kind: 'saved', at: 1_000 });
  });

  it('改回原样就不写，提示也不变', () => {
    const { s, f, advance } = session({ a: '1' });
    s.storage({ op: 'set', key: 'a', value: '2' });
    s.storage({ op: 'set', key: 'a', value: '1' });
    advance(700);
    expect(f.ports.writeSave).not.toHaveBeenCalled();
    expect(s.status).toEqual({ kind: 'loaded' });
  });

  it('退出时不等 700 毫秒，立刻写，并报这次的时长', async () => {
    const { s, f, advance } = session();
    expect(s.status).toEqual({ kind: 'new' });
    s.startClock();
    advance(5_000);
    s.storage({ op: 'set', key: 'a', value: '1' });
    await s.close();
    expect(f.ports.writeSave).toHaveBeenCalledWith('yike', { a: '1' });
    expect(f.ports.track).toHaveBeenCalledWith({ t: 'play', g: 'yike', s: 5 });
    advance(700);
    expect(f.ports.writeSave).toHaveBeenCalledTimes(1);
  });

  it('只计前台时长，满 2 分钟上报一次', () => {
    const { s, f, advance } = session();
    s.startClock();
    advance(120_000);
    expect(f.ports.track).toHaveBeenCalledWith({ t: 'play', g: 'yike', s: 120 });
    expect(s.secs).toBe(120);
    expect(f.stats.yike.seconds).toBe(120);
  });

  it('成就只在第一次解锁时返回显示名', () => {
    const { s } = session();
    expect(s.unlock('first')).toBe('第一次');
    expect(s.unlock('first')).toBeNull();
    expect(s.unlock('k2')).toBe('k2');
  });
});
