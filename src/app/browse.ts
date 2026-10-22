// 商店与游戏库的取数规则，沿用旧版 renderStore / renderLibrary / 标签点击（dd731d6 public/index.html）。

import type { GameEntry } from '../catalog';
import type { AchievementDef, GameStat } from '../shared';

export const ALL_GENRES = '全部';

export interface StoreFilter { q: string; genre: string }

// 搜索匹配 title + genre + tags + tagline 拼起来的小写串
export function filterGames(games: readonly GameEntry[], { q, genre }: StoreFilter) {
  const needle = q.trim().toLowerCase();
  return games.filter(g => (genre === ALL_GENRES || g.genre === genre) && (!needle || (g.title + g.genre + g.tags.join('') + g.tagline).toLowerCase().includes(needle)));
}

// 类型筛选条：「全部」加按首次出现顺序的类型，各带数量
export function genreCounts(games: readonly GameEntry[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const g of games) counts.set(g.genre, (counts.get(g.genre) ?? 0) + 1);
  return [[ALL_GENRES, games.length], ...counts];
}

// 继续游玩：打开过的游戏按最近一次倒序取 3 款（打开就写 last，0 秒的也算）
export function recentGames(games: readonly GameEntry[], stats: Readonly<Record<string, GameStat>>) {
  return games.filter(g => stats[g.id]?.last).sort((a, b) => stats[b.id].last - stats[a.id].last).slice(0, 3);
}

// 游戏库：打开过或在愿望单里的游戏，按最近一次倒序
export function libraryGames(games: readonly GameEntry[], stats: Readonly<Record<string, GameStat>>, wish: readonly string[]) {
  return games.filter(g => stats[g.id]?.last || wish.includes(g.id)).sort((a, b) => (stats[b.id]?.last || 0) - (stats[a.id]?.last || 0));
}

// 标签与面包屑类型的点击：是已知类型就按类型筛选，不是就当搜索词
export function filterForTag(games: readonly GameEntry[], tag: string): StoreFilter {
  if (tag === ALL_GENRES || games.some(g => g.genre === tag)) return { q: '', genre: tag };
  return { q: tag, genre: ALL_GENRES };
}

// 成就定义：目录里的静态定义优先于游戏上报的
export const achList = (g: GameEntry, achDefs: Readonly<Record<string, AchievementDef[]>>) => g.achievements || achDefs[g.id] || [];

// 已解锁数只算在定义里的键
export const unlockedKeys = (achs: readonly AchievementDef[], stat: GameStat | undefined) =>
  Object.keys(stat?.ach || {}).filter(k => achs.some(a => a.key === k));
