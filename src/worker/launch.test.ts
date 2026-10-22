// API-LAUNCH-001 启动遥测：校验与限额、内部标记、按天游戏国家环境累加（REQ-LAUNCH-005、INV-002）
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { bjToday, call, post, resetDb, rows } from './test/setup';

const ev = (p: string, extra: object = {}) => ({ p, g: 'yike', r: 'legacy', e: 'browser', ...extra });
const launchRows = () => rows('SELECT * FROM launch_days ORDER BY game, env');
const failRows = () => rows('SELECT * FROM launch_fails ORDER BY reason');
const z = { starts: 0, ready: 0, fail: 0, cancel: 0, b1: 0, b3: 0, b10: 0, b30: 0, bx: 0, fs_try: 0, fs_ok: 0 };

beforeAll(resetDb);
beforeEach(resetDb);

describe('API-LAUNCH-001 POST /api/launch', () => {
  test('按北京日期、游戏、国家或地区、打开环境累加，就绪耗时分桶，全屏结果计入 fs_try 与 fs_ok', async () => {
    const res = await post('/api/launch', { ev: [
      ev('start'), ev('ready', { ms: 1000, c: 1, fs: 2 }), ev('ready', { ms: 1001, fs: 1 }), ev('ready', { ms: 3000, fs: 0 }),
      ev('ready', { ms: 10000 }), ev('ready', { ms: 30000 }), ev('ready', { ms: 30001 }),
      ev('fail', { ms: 15000, why: 'boot-timeout', n: 1 }), ev('cancel', { ms: 50 }),
      ev('start', { g: 'spud-dawn', r: 'play', e: 'standalone' }),
    ] });
    expect(res.status).toBe(204);
    const day = bjToday();
    expect(await launchRows()).toEqual([
      { day, game: 'spud-dawn', country: 'CN', env: 'standalone', ...z, starts: 1 },
      { day, game: 'yike', country: 'CN', env: 'browser', ...z, starts: 1, ready: 6, fail: 1, cancel: 1, b1: 1, b3: 2, b10: 1, b30: 1, bx: 1, fs_try: 2, fs_ok: 1 },
    ]);
    expect(await failRows()).toEqual([{ day, country: 'CN', reason: 'boot-timeout', n: 1 }]);

    await post('/api/launch', { ev: [ev('start'), ev('fail', { ms: 9000, why: 'net-stall', n: 2 }), ev('fail', { ms: 12000, why: 'boot-timeout' })] });
    expect((await launchRows())[1]).toMatchObject({ starts: 2, fail: 3 });
    expect(await failRows()).toEqual([{ day, country: 'CN', reason: 'boot-timeout', n: 2 }, { day, country: 'CN', reason: 'net-stall', n: 1 }]);
  });

  test('取不到国家或地区时记 XX', async () => {
    await call('/api/launch', { method: 'POST', body: JSON.stringify({ ev: [ev('start')] }), cf: {} });
    expect(await rows('SELECT country FROM launch_days')).toEqual([{ country: 'XX' }]);
  });

  test('超过 10 个事件、超过 4 KB、阶段或其他字段非法时整批 400 bad-launch', async () => {
    const bad: unknown[] = [
      { ev: Array.from({ length: 11 }, () => ev('start')) },
      { ev: [ev('start', { pad: 'x'.repeat(4096) })] },
      { ev: [ev('boot')] },
      { ev: [] },
      { ev: [ev('start', { g: 'YIKE' })] },
      { ev: [ev('start', { r: 'native' })] },
      { ev: [ev('start', { e: 'app' })] },
      { ev: [ev('ready')] },
      { ev: [ev('ready', { ms: 600001 })] },
      { ev: [ev('cancel', { ms: -1 })] },
      { ev: [ev('fail', { ms: 100 })] },
      { ev: [ev('fail', { ms: 100, why: 'timeout' })] },
      { ev: [ev('ready', { ms: 100, fs: 3 })] },
      { ev: [ev('ready', { ms: 100, c: 2 })] },
      { ev: [ev('fail', { ms: 100, why: 'offline', n: 3 })] },
      { ev: [ev('start'), 'start'] },
      'nope',
    ];
    for (const body of bad) {
      const res = await post('/api/launch', body);
      expect(res.status, JSON.stringify(body).slice(0, 80)).toBe(400);
      expect(await res.json()).toEqual({ type: '/errors/bad-launch', title: '启动上报格式不对', status: 400, instance: '' });
    }
    expect([await launchRows(), await failRows()]).toEqual([[], []]);
  });

  test('正好 10 个事件可以收', async () => {
    expect((await post('/api/launch', { ev: Array.from({ length: 10 }, () => ev('start')) })).status).toBe(204);
    expect(await rows('SELECT starts FROM launch_days')).toEqual([{ starts: 10 }]);
  });

  test('带 sk_staff 返回 204 但不写库；先校验格式，坏数据仍是 400（INV-002）', async () => {
    const staff = { cookie: 'sk_staff=1' };
    expect((await post('/api/launch', { ev: [ev('start'), ev('fail', { ms: 1, why: 'offline' })] }, staff)).status).toBe(204);
    expect((await post('/api/launch', { ev: [ev('boot')] }, staff)).status).toBe(400);
    expect([await launchRows(), await failRows()]).toEqual([[], []]);
  });
});
