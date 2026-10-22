// API-001 上报与 API-005 合并：TC-004、TC-006、TC-007、TC-029，校验顺序与写库对照旧版 src/worker.js
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { bjToday, call, post, resetDb, rows } from './test/setup';

const V = 'a'.repeat(32), W = 'b'.repeat(32);
const STAFF = { cookie: 'sk_staff=1' };
const visit = (v = V) => ({ v, ev: [{ t: 'visit' }] });
const counts = async () => Object.fromEntries(await Promise.all(['visitors', 'visitor_days', 'game_days']
  .map(async t => [t, (await rows<{ n: number }>(`SELECT COUNT(*) n FROM ${t}`))[0].n])));

beforeAll(resetDb);
beforeEach(resetDb);

describe('API-001 POST /api/e', () => {
  test('访问记进旅客表与旅客日，设备、微信、国家按首访请求判断', async () => {
    const res = await post('/api/e', visit(), { 'user-agent': 'Mozilla/5.0 (iPhone) MicroMessenger/8.0' });
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    expect(await rows('SELECT vid, first_day, device, wechat, country, prior FROM visitors'))
      .toEqual([{ vid: V, first_day: bjToday(), device: 'mobile', wechat: 1, country: 'CN', prior: 0 }]);
    expect(await rows('SELECT visits, seconds FROM visitor_days')).toEqual([{ visits: 1, seconds: 0 }]);
  });

  test('开局与时长累加进游戏日与旅客日', async () => {
    await post('/api/e', { v: V, ev: [{ t: 'start', g: 'yike' }, { t: 'play', g: 'yike', s: 120 }, { t: 'backup' }] });
    await post('/api/e', { v: V, ev: [{ t: 'play', g: 'yike', s: 30 }, { t: 'restore' }] });
    expect(await rows('SELECT game, starts, seconds FROM game_days')).toEqual([{ game: 'yike', starts: 1, seconds: 150 }]);
    expect(await rows('SELECT visits, seconds, backups, restores FROM visitor_days')).toEqual([{ visits: 0, seconds: 150, backups: 1, restores: 1 }]);
  });

  test('老玩家标记只在首次写入时生效', async () => {
    await post('/api/e', { ...visit(), o: 1 });
    await post('/api/e', visit());
    await post('/api/e', { ...visit(W), o: 0 });
    await post('/api/e', { ...visit(W), o: 1 });
    expect(await rows('SELECT vid, prior FROM visitors ORDER BY vid')).toEqual([{ vid: V, prior: 1 }, { vid: W, prior: 0 }]);
  });

  test('TC-004 非法上报整批拒绝', async () => {
    const bad = [
      { v: 'abc', ev: [{ t: 'visit' }] },
      { v: V, ev: [{ t: 'click' }] },
      { v: V, ev: [{ t: 'play', g: 'yike', s: 900 }] },
      { v: V, ev: [{ t: 'play', g: 'yike', s: 200 }, { t: 'play', g: 'f1', s: 200 }] },
      { v: V, ev: Array.from({ length: 21 }, () => ({ t: 'visit' })) },
      { v: V, ev: [{ t: 'start' }] },
      { v: V, ev: [] },
      { v: V, ev: [{ t: 'play', g: 'yike', s: 1.5 }] },
      { v: V, ev: [{ t: 'start', g: 'Yike' }] },
      { v: V.toUpperCase(), ev: [{ t: 'visit' }] },
      '{not json',
      { v: V, ev: [{ t: 'visit' }], pad: 'x'.repeat(8192) },
    ];
    for (const body of bad) {
      const res = await post('/api/e', body);
      expect(res.status, JSON.stringify(body).slice(0, 80)).toBe(400);
      expect(res.headers.get('content-type')).toBe('application/problem+json; charset=utf-8');
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(await res.json()).toEqual({ type: '/errors/bad-event', title: '上报格式不对', status: 400, instance: '' });
    }
    expect(await counts()).toEqual({ visitors: 0, visitor_days: 0, game_days: 0 });
  });

  test('错误信封的 instance 是 cf-ray', async () => {
    const res = await post('/api/e', { v: 'abc', ev: [] }, { 'cf-ray': '8f0123abcd-HKG' });
    expect((await res.json() as { instance: string }).instance).toBe('8f0123abcd-HKG');
  });

  test('TC-006 内部浏览器的上报 204 但不写库；先校验格式，坏数据仍是 400', async () => {
    expect((await post('/api/e', { v: V, ev: [{ t: 'visit' }, { t: 'start', g: 'yike' }, { t: 'play', g: 'yike', s: 30 }] }, STAFF)).status).toBe(204);
    expect((await post('/api/e', { v: V, ev: [{ t: 'click' }] }, STAFF)).status).toBe(400);
    expect((await post('/api/e', visit(), { cookie: 'a=b; sk_staff=1; c=d' })).status).toBe(204);
    expect(await counts()).toEqual({ visitors: 0, visitor_days: 0, game_days: 0 });
    await post('/api/e', visit(), { cookie: 'sk_staff=0' }); // 值不是 1 的照常计入
    expect((await counts()).visitors).toBe(1);
  });

  test('TC-007 同一旅客两个标签页同时首访', async () => {
    const [a, b] = await Promise.all([post('/api/e', visit()), post('/api/e', visit())]);
    expect([a.status, b.status]).toEqual([204, 204]);
    expect(await rows('SELECT COUNT(*) n FROM visitors')).toEqual([{ n: 1 }]);
    expect(await rows('SELECT visits FROM visitor_days')).toEqual([{ visits: 2 }]);
  });

  test('方法不对或路径不认识时交给静态资源', async () => {
    expect((await call('/api/e')).status).toBe(404);
    expect((await post('/api/nope', visit())).status).toBe(404);
  });
});

describe('API-005 POST /api/merge', () => {
  test('from 的旅客日与游戏日累加进 v，然后删掉 from 的三张表的行（INV-005）', async () => {
    await post('/api/e', { v: V, ev: [{ t: 'visit' }, { t: 'start', g: 'yike' }, { t: 'play', g: 'yike', s: 100 }] });
    await post('/api/e', { v: W, o: 1, ev: [{ t: 'visit' }, { t: 'visit' }, { t: 'start', g: 'yike' }, { t: 'play', g: 'yike', s: 50 }, { t: 'start', g: 'f1' }] });
    expect((await post('/api/merge', { v: V, from: W })).status).toBe(204);
    expect(await rows('SELECT vid, prior FROM visitors')).toEqual([{ vid: V, prior: 0 }]);
    expect(await rows('SELECT vid, visits, seconds FROM visitor_days')).toEqual([{ vid: V, visits: 3, seconds: 150 }]);
    expect(await rows('SELECT vid, game, starts, seconds FROM game_days ORDER BY game'))
      .toEqual([{ vid: V, game: 'f1', starts: 1, seconds: 0 }, { vid: V, game: 'yike', starts: 2, seconds: 150 }]);
    // 重发时 from 已经没有行，什么都不改
    expect((await post('/api/merge', { v: V, from: W })).status).toBe(204);
    expect(await rows('SELECT visits FROM visitor_days')).toEqual([{ visits: 3 }]);
  });

  test('v 在旅客表没有行时照抄 from 那一行', async () => {
    await post('/api/e', { v: W, o: 1, ev: [{ t: 'visit' }] }, { 'user-agent': 'Android' });
    await post('/api/merge', { v: V, from: W });
    expect(await rows('SELECT vid, device, prior FROM visitors')).toEqual([{ vid: V, device: 'mobile', prior: 1 }]);
  });

  test('TC-029 编号格式不对或两个编号相同返回 400 bad-merge', async () => {
    for (const body of [{ v: V, from: V }, { v: V }, { v: 'x', from: W }, { v: V, from: W.toUpperCase() }, '[]', 'nope']) {
      const res = await post('/api/merge', body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ type: '/errors/bad-merge', title: '合并请求的编号格式不对', status: 400, instance: '' });
    }
  });

  test('内部浏览器 204 不写库，坏数据仍是 400', async () => {
    await post('/api/e', visit(W));
    expect((await post('/api/merge', { v: V, from: W }, STAFF)).status).toBe(204);
    expect(await rows('SELECT vid FROM visitors')).toEqual([{ vid: W }]);
    expect((await post('/api/merge', { v: V, from: V }, STAFF)).status).toBe(400);
  });
});
