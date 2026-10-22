import { describe, expect, it } from 'vitest';
import { CATALOG } from '../catalog';
import { ALL_GENRES, filterForTag, filterGames, genreCounts, libraryGames, recentGames } from './browse';
import { fmtPlay, fmtSize, fmtWhen } from './format';
import { stat } from './mock';

const ids = (gs: readonly { id: string }[]) => gs.map(g => g.id);
const DAY = 86400e3;

describe('商店与游戏库的取数（REQ-016、REQ-017、REQ-019）', () => {
  it('搜索匹配名称、类型、标签与简介，类型回到全部', () => {
    expect(ids(filterGames(CATALOG, { q: '首富', genre: ALL_GENRES }))).toEqual(['wealth-reborn']);
    expect(ids(filterGames(CATALOG, { q: '赛车经理', genre: ALL_GENRES }))).toEqual(['f1']);
    expect(ids(filterGames(CATALOG, { q: '肉鸽', genre: ALL_GENRES }))).toEqual(['spud-dawn']);
    expect(ids(filterGames(CATALOG, { q: '戥秤', genre: ALL_GENRES }))).toEqual(['yike']);
    expect(filterGames(CATALOG, { q: '没有这款游戏', genre: ALL_GENRES })).toHaveLength(0);
  });

  it('类型筛选与类型条计数', () => {
    expect(ids(filterGames(CATALOG, { q: '', genre: '体育经理' }))).toEqual(['nba', 'cba']);
    const counts = genreCounts(CATALOG);
    expect(counts[0]).toEqual([ALL_GENRES, 13]);
    expect(counts).toContainEqual(['体育经理', 2]);
  });

  it('标签：已知类型按类型筛选，否则当搜索词', () => {
    expect(filterForTag(CATALOG, '体育经理')).toEqual({ q: '', genre: '体育经理' });
    expect(filterForTag(CATALOG, '肉鸽')).toEqual({ q: '肉鸽', genre: ALL_GENRES });
    expect(filterForTag(CATALOG, ALL_GENRES)).toEqual({ q: '', genre: ALL_GENRES });
  });

  it('继续游玩只取最近 3 款；游戏库收录打开过与愿望单，按最近倒序', () => {
    const now = Date.now();
    const stats = {
      douluo: stat({ seconds: 600, last: now - 4 * DAY }),
      yike: stat({ seconds: 600, last: now - 3 * DAY }),
      'f1-driver': stat({ seconds: 600, last: now - 2 * DAY }),
      'basketball-star': stat({ seconds: 600, last: now - DAY }),
    };
    expect(ids(recentGames(CATALOG, stats))).toEqual(['basketball-star', 'f1-driver', 'yike']);
    expect(ids(libraryGames(CATALOG, { yike: stats.yike, douluo: stats.douluo }, ['f1-driver']))).toEqual(['yike', 'douluo', 'f1-driver']);
  });
});

describe('三种格式沿用旧版', () => {
  it('时长', () => {
    expect(fmtPlay(0)).toBe('还没玩过');
    expect(fmtPlay(20)).toBe('不到 1 分钟');
    expect(fmtPlay(1800)).toBe('30 分钟');
    expect(fmtPlay(5400)).toBe('1.5 小时');
  });
  it('多久前', () => {
    const now = Date.now();
    expect(fmtWhen(0)).toBe('—');
    expect(fmtWhen(now - 10e3, now)).toBe('刚刚');
    expect(fmtWhen(now - 3 * 3600e3, now)).toBe('3 小时前');
  });
  it('大小', () => {
    expect(fmtSize(617963)).toBe('603 KB');
    expect(fmtSize(3080669)).toBe('2.9 MB');
  });
});
