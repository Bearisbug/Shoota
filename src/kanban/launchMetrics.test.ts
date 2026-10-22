import { describe, expect, it } from 'vitest';
import { counts } from './fixtures';
import { BUCKETS, fastReady, groupReasons, noAnswer } from './launchMetrics';
import { failText } from './useKanbanData';

describe('启动口径（§3）', () => {
  it('没回音 = 开始 − 就绪 − 失败 − 取消，上报丢失算出负数时按 0', () => {
    expect(noAnswer(counts({ starts: 100, ready: 97, fail: 2, cancel: 0 }))).toBe(1);
    expect(noAnswer(counts({ starts: 1, ready: 2 }))).toBe(0);
  });

  it('3 秒内就绪 = 前两档之和', () => {
    expect(fastReady(counts({ b1: 4, b3: 5, b10: 6 }))).toBe(9);
  });

  it('分桶文案按 TELEMETRY.readyBucketsMs 的上界', () => {
    expect(BUCKETS.map(b => b.label)).toEqual(['≤ 1 秒', '1–3 秒', '3–10 秒', '10–30 秒', '超过 30 秒']);
  });

  it('失败原因按原因合并，各自和地区都按次数从多到少', () => {
    const g = groupReasons([
      { country: 'US', reason: 'net-stall', n: 1 },
      { country: 'CN', reason: 'boot-timeout', n: 1 },
      { country: 'CN', reason: 'net-stall', n: 2 },
    ]);
    expect(g.map(r => [r.reason, r.n])).toEqual([['net-stall', 3], ['boot-timeout', 1]]);
    expect(g[0]).toMatchObject({ label: '网络中途卡住', kind: '网络' });
    expect(g[0].places).toEqual([{ country: 'CN', n: 2 }, { country: 'US', n: 1 }]);
  });
});

describe('读取失败提示（沿用旧版文案）', () => {
  it('超时、断网与服务器错误', () => {
    expect(failText(new DOMException('aborted', 'AbortError'))).toBe('读取失败：15 秒内没有响应。检查网络后点重试。');
    expect(failText(new TypeError('Failed to fetch'))).toBe('读取失败：网络断开。检查网络后点重试。');
    expect(failText(new TypeError('Load failed'))).toBe('读取失败：网络断开。检查网络后点重试。');
    expect(failText(new Error('服务器返回 500'))).toBe('读取失败：服务器返回 500。检查网络后点重试。');
  });
});
