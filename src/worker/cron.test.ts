// 内部任务 cloud.expire：场景「365 天没同步的云存档」，每次最多 200 个，三张云端表都清掉，可以重复跑（REQ-CLOUD-006）
import { createExecutionContext, createScheduledController, env, waitOnExecutionContext } from 'cloudflare:test';
import { beforeAll, beforeEach, expect, test } from 'vitest';
import worker from './index';
import { expireClouds } from './cron';
import { daysAgo, post, randomHex, resetDb, rows, testEnv } from './test/setup';

// 直接在三张云端表里放一个云存档，最近同步日是 n 天前
function account(sid: string, n: number) {
  return [
    env.DB.prepare("INSERT INTO cloud_accounts (sid, code_hash, sid_box, created_at, seen_day) VALUES (?, ?, 'box', 0, ?)").bind(sid, 'h' + sid, daysAgo(n)),
    env.DB.prepare("INSERT INTO cloud_games (sid, game, rev, enc, body, bytes, seconds, last_played, saved_at, updated_at) VALUES (?, 'yike', 1, 'json', '{}', 2, 0, 0, 0, 0)").bind(sid),
    env.DB.prepare("INSERT INTO cloud_meta (sid, rev, data, saved_at, updated_at) VALUES (?, 1, '{}', 0, 0)").bind(sid),
  ];
}
const left = async () => Object.fromEntries(await Promise.all(['cloud_accounts', 'cloud_games', 'cloud_meta']
  .map(async t => [t, (await rows<{ sid: string }>(`SELECT sid FROM ${t} ORDER BY sid`)).map(r => r.sid)])));

beforeAll(resetDb);
beforeEach(resetDb);

test('删掉最近同步日早于 365 天的云存档，三张表都清掉；365 天整的不删；重复跑不再删', async () => {
  await env.DB.batch([...account('old', 366), ...account('edge', 365), ...account('now', 0)]);
  expect(await expireClouds(testEnv)).toBe(1);
  const keep = ['edge', 'now'];
  expect(await left()).toEqual({ cloud_accounts: keep, cloud_games: keep, cloud_meta: keep });
  expect(await expireClouds(testEnv)).toBe(0);
  expect(await left()).toEqual({ cloud_accounts: keep, cloud_games: keep, cloud_meta: keep });
});

test('每次最多删 200 个，删不完的留到下一次', async () => {
  const sids = Array.from({ length: 201 }, (_, i) => `s${String(i).padStart(3, '0')}`);
  await env.DB.batch(sids.flatMap(s => account(s, 400)));
  expect(await expireClouds(testEnv)).toBe(200);
  expect((await left()).cloud_games).toHaveLength(1);
  expect(await expireClouds(testEnv)).toBe(1);
  expect(await left()).toEqual({ cloud_accounts: [], cloud_games: [], cloud_meta: [] });
});

test('定时触发跑 cloud.expire；删掉的云存档再同步返回 404', async () => {
  const id = randomHex(), code = '0123456789ABCDEF';
  await post('/api/cloud/account', { code }, { authorization: `Save ${id}` });
  await env.DB.prepare('UPDATE cloud_accounts SET seen_day = ?').bind(daysAgo(366)).run();
  const ctx = createExecutionContext();
  await worker.scheduled(createScheduledController({ cron: '0 20 * * *' }), testEnv, ctx);
  await waitOnExecutionContext(ctx);
  expect(await rows('SELECT * FROM cloud_accounts')).toEqual([]);
  const res = await post('/api/cloud/sync', { have: {}, haveMeta: 0, push: [] }, { authorization: `Save ${id}` });
  expect(res.status).toBe(404);
  expect(((await res.json()) as { type: string }).type).toBe('/errors/cloud-not-found');
});
