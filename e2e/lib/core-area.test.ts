// 核对核心区占比的汇总口径：用 2026-10-22 旧版逐款读数（同一测量脚本、同一组视口）复现 docs/DESIGN.md §13 的旧版中位数与最低值。
// 汇总口径一旦改了（漏掉薯光规则、取整方式不同），新版读数就没法和旧版比。
import { describe, expect, test } from 'vitest';
import { GAMES, MEASURE_VPS, OLD, STEPS, stepsFor, summarize, type Reading } from './core-area';
import type { MeasureVp } from './viewports';

// 顺序同 GAMES：spud-dawn、f1-driver、f1、basketball-star、wealth-reborn、douluo、yexiao、hougong、nba、cba、lol、yike、entertainment-career
const OLD_AREA: Record<MeasureVp, number[]> = {
  portrait: [100, 67.5, 60.1, 64.2, 69.8, 64.7, 71.2, 88.4, 58.3, 58.3, 88.4, 61.9, 80.9],
  landscape: [100, 61.3, 48.3, 48.2, 37.9, 35.9, 56.7, 55.9, 47.4, 47.4, 87.3, 14, 79.5],
  'safari-portrait': [100, 58, 48.4, 53.7, 61, 54.3, 62.8, 85, 46.1, 46.1, 85, 49.2, 75.3],
  'safari-landscape': [100, 39.4, 40.8, 43.1, 28.9, 26.5, 50.4, 85.4, 43.1, 30.3, 85.4, 13.5, 76.6],
  tablet: [100, 87.1, 82.8, 83.5, 77.8, 78.6, 85.6, 95.8, 83.5, 83.5, 95.8, 45.6, 86.9],
  desktop: [93.7, 75.7, 75.7, 76.3, 70.3, 71.5, 87.4, 93.7, 87.9, 87.9, 86.8, 22.9, 79.4],
};
const OLD_SCREEN: Partial<Record<MeasureVp, number[]>> = {
  'safari-portrait': [77.3, 44.8, 37.4, 41.5, 47.2, 42, 48.6, 65.7, 35.7, 35.7, 65.7, 38, 58.2],
  'safari-landscape': [75.2, 29.6, 30.7, 32.4, 21.7, 19.9, 37.9, 64.2, 32.4, 22.8, 64.2, 10.2, 57.6],
};

const readings: Reading[] = MEASURE_VPS.flatMap(vp => GAMES.map((id, i) => ({
  vp, id, coreAreaPct: OLD_AREA[vp][i], screenAreaPct: OLD_SCREEN[vp]?.[i] ?? null,
  frame: { x: 0, y: 0, w: 0, h: 0 }, mode: 'no-scroll' as const, misses: [],
})));

describe('核心区占比汇总', () => {
  test('目录 13 款与旧版读数的顺序一致，每款都登记了进主界面的步骤', () => {
    expect(GAMES).toEqual(['spud-dawn', 'f1-driver', 'f1', 'basketball-star', 'wealth-reborn', 'douluo', 'yexiao', 'hougong', 'nba', 'cba', 'lol', 'yike', 'entertainment-career']);
    for (const id of GAMES) expect(STEPS[id], id).toBeDefined();
  });

  test('旧版读数复现 §13 的旧版中位数、最低值与最低的游戏', () => {
    const s = summarize(readings);
    for (const vp of MEASURE_VPS) {
      expect(s[vp], vp).toMatchObject({ median: OLD[vp].median, min: OLD[vp].min, minIds: OLD[vp].minIds });
    }
  });

  test('电脑 13 款都计，其余视口不计薯光', () => {
    const s = summarize(readings);
    expect(s.desktop?.n).toBe(13);
    for (const vp of MEASURE_VPS.filter(v => v !== 'desktop')) expect(s[vp]?.n, vp).toBe(12);
  });

  test('竖屏 Safari 可见区换算到整块屏幕的中位数为旧版 43%', () => {
    expect(summarize(readings)['safari-portrait']?.screenMedian).toBe(OLD['safari-portrait'].screenMedian);
  });

  test('偶数款取中间两款的平均，按 0.1 个百分点 .5 进位：56.15 记 56.2，41.95 记 42.0', () => {
    const s = summarize(readings);
    expect(s['safari-portrait']?.median).toBe(56.2);
    expect(s['safari-landscape']?.median).toBe(42);
  });

  test('薯光只给竖屏登记了单独的步骤，其余视口用横屏那组', () => {
    expect(stepsFor('spud-dawn', 'portrait')[0]).toBe('te:无法旋转，直接继续');
    for (const vp of ['safari-portrait', 'tablet', 'desktop'] as const) expect(stepsFor('spud-dawn', vp)[0], vp).toBe('te:开始');
  });
});
