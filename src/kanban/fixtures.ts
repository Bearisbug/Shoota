// 看板单测用的 /kanban/data 响应。形状同 src/shared/api.ts 的 KanbanData；数字取自 docs/DESIGN.md §19 的场景
import type { KanbanData, LaunchCounts } from '../shared';

export const TODAY = '2026-10-22';
const addDays = (day: string, n: number) => new Date(Date.parse(day + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

export const counts = (p: Partial<LaunchCounts> = {}): LaunchCounts => ({
  starts: 0, ready: 0, fail: 0, cancel: 0, b1: 0, b3: 0, b10: 0, b30: 0, bx: 0, fsTry: 0, fsOk: 0, ...p,
});

// 统计表全空时 Worker 返回的样子：趋势 30 天补 0，其余为空
export function emptyData(): KanbanData {
  const zero = { active: 0, new: 0, seconds: 0 };
  return {
    today: TODAY,
    statsStart: '2026-10-20',
    priorSince: '2026-10-21',
    generatedAt: Date.parse('2026-10-22T06:30:00Z'), // 北京时间 14:30
    overview: { today: zero, d7: zero, d30: zero, backups30: 0, restores30: 0 },
    trend: Array.from({ length: 30 }, (_, i) => ({ day: addDays(TODAY, i - 29), active: 0, new: 0, seconds: 0 })),
    retention: [],
    games: [],
    sources: { total: 0, wechat: 0, mobile: 0, desktop: 0, countries: [] },
    launch: { from: addDays(TODAY, -6), total: counts(), byCountry: [], byGame: [], byEnv: [], reasons: [] },
  };
}

export function sampleData(): KanbanData {
  const d = emptyData();
  d.overview = {
    today: { active: 12, new: 5, seconds: 5400 },
    d7: { active: 40, new: 18, seconds: 36000 },
    d30: { active: 1234, new: 300, seconds: 720000 },
    backups30: 7,
    restores30: 2,
  };
  d.trend = d.trend.map((t, i) => ({ ...t, active: i + 1, new: i % 3, seconds: i === 29 ? 150000 : 600 }));
  d.retention = [
    { day: TODAY, n: 5, r1: null, r7: null, r30: null },
    { day: addDays(TODAY, -10), n: 10, r1: 3, r7: 1, r30: null },
    { day: '2026-10-20', n: 4, r1: 2, r7: null, r30: null },
  ];
  d.games = [
    { id: 'f1', title: 'F1-Team Principal', players: 3, starts: 9, seconds: 7200, nextDay: { n: 2, r: 1 } },
    { id: 'yike', title: '一克之差', players: 0, starts: 0, seconds: 0, nextDay: { n: 0, r: 0 } },
  ];
  d.sources = { total: 4, wechat: 1, mobile: 3, desktop: 1, countries: [{ code: 'CN', n: 3 }, { code: 'XX', n: 1 }] };
  const cn = counts({ starts: 100, ready: 97, fail: 2, cancel: 0, b1: 60, b3: 30, b10: 5, b30: 2, fsTry: 10, fsOk: 9 });
  const us = counts({ starts: 3, ready: 2, fail: 1, b3: 2 });
  d.launch = {
    from: addDays(TODAY, -6),
    total: counts({ starts: 103, ready: 99, fail: 3, cancel: 0, b1: 60, b3: 32, b10: 5, b30: 2, fsTry: 10, fsOk: 9 }),
    byCountry: [{ ...cn, country: 'CN' }, { ...us, country: 'US' }],
    byGame: [{ ...cn, id: 'yike', title: '一克之差' }, { ...us, id: 'f1', title: 'F1-Team Principal' }],
    byEnv: [{ ...cn, env: 'wechat' }, { ...us, env: 'browser' }, { ...counts(), env: 'standalone' }],
    reasons: [
      { country: 'US', reason: 'net-stall', n: 1 },
      { country: 'CN', reason: 'net-stall', n: 2 },
    ],
  };
  return d;
}
