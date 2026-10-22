// API-CLOUD-001 开通、API-CLOUD-002 恢复、API-CLOUD-003 同步：状态码与错误码按 §14，冲突按 RULE-CLOUD-001，
// 服务端不存编号与恢复码原文（INV-CLOUD-001），版本号只增不减（INV-CLOUD-004）
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import type { CloudGamePush, CloudMetaData, CloudRecoverResult, CloudSyncBody, CloudSyncResult } from '../shared/api';
import { CLOUD } from '../shared/limits';
import { bjToday, exec, post, randomHex, resetDb, rows } from './test/setup';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => CROCKFORD[b % 32]).join('');
const auth = (id: string) => ({ authorization: `Save ${id}` });
const sha = async (t: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t))), b => b.toString(16).padStart(2, '0')).join('');

async function openCloud(id = randomHex(), code = newCode()) {
  const res = await post('/api/cloud/account', { code }, auth(id));
  expect(res.status).toBe(201);
  return { id, code };
}

const game = (over: Partial<CloudGamePush> = {}): CloudGamePush =>
  ({ g: 'yike', base: 0, enc: 'json', body: '{"lvl":"1"}', bytes: 11, s: 60, last: 1000, status: '第 1 关', at: 1000, ...over });
const syncRaw = (id: string, body: Partial<CloudSyncBody> & Record<string, unknown>) => post('/api/cloud/sync', { have: {}, haveMeta: 0, push: [], ...body }, auth(id));
const sync = async (id: string, body: Partial<CloudSyncBody>) => {
  const res = await syncRaw(id, body);
  expect(res.status).toBe(200);
  return res.json() as Promise<CloudSyncResult>;
};
const age = () => exec('UPDATE cloud_games SET updated_at = updated_at - 20000'); // 越过同一款 10 秒写入间隔
const cloudRow = async (g = 'yike') => (await rows<Record<string, unknown>>('SELECT * FROM cloud_games WHERE game = ?', g))[0];
const problemOf = async (res: Response) => ({ status: res.status, ...(await res.json() as { type: string }) });

beforeAll(resetDb);
beforeEach(resetDb);

describe('API-CLOUD-001 POST /api/cloud/account', () => {
  test('开通写编号摘要、恢复码摘要与编号密文；同一对重发 200，不同恢复码 409', async () => {
    const { id, code } = await openCloud();
    const [acc] = await rows<Record<string, unknown>>('SELECT * FROM cloud_accounts');
    expect(acc).toMatchObject({ sid: await sha(id), code_hash: await sha(code), seen_day: bjToday(), recover_n: 0 });
    expect(acc.sid_box).toMatch(/^[A-Za-z0-9+/]+=*$/);

    const again = await post('/api/cloud/account', { code }, auth(id));
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ created: false });

    const other = await post('/api/cloud/account', { code: newCode() }, auth(id));
    expect(await problemOf(other)).toMatchObject({ status: 409, type: '/errors/cloud-exists' });
    // 恢复码撞上别的云存档同样 409，前端重新生成一对
    expect((await post('/api/cloud/account', { code }, auth(randomHex()))).status).toBe(409);
    expect(await rows('SELECT COUNT(*) n FROM cloud_accounts')).toEqual([{ n: 1 }]);
  });

  test('鉴权头缺失或编号格式不对 401，先于正文校验', async () => {
    const id = randomHex();
    for (const headers of [{} as Record<string, string>, { authorization: `Bearer ${id}` }, { authorization: `Save ${id.toUpperCase()}` }, { authorization: `Save ${id.slice(1)}` }, { authorization: `save ${id}` }]) {
      expect(await problemOf(await post('/api/cloud/account', { code: newCode() }, headers))).toMatchObject({ status: 401, type: '/errors/cloud-auth' });
    }
    expect((await post('/api/cloud/account', { code: 'bad' }, {})).status).toBe(401);
  });

  test('恢复码不是 16 位 Crockford base32 大写时 400', async () => {
    const good = newCode();
    for (const body of [{ code: good.toLowerCase() }, { code: good.slice(1) }, { code: good.slice(0, 15) + 'I' }, { code: good.slice(0, 15) + 'L' },
      { code: good.slice(0, 15) + 'O' }, { code: good.slice(0, 15) + 'U' }, { code: `${good.slice(0, 4)}-${good.slice(4, 8)}-${good.slice(8, 12)}-${good.slice(12)}` },
      {}, { code: 1234 }, 'nope', { code: good, pad: 'x'.repeat(2000) }]) {
      expect(await problemOf(await post('/api/cloud/account', body, auth(randomHex())))).toMatchObject({ status: 400, type: '/errors/bad-cloud-request' });
    }
  });
});

describe('API-CLOUD-002 POST /api/cloud/recover', () => {
  test('凭恢复码换回编号与游戏清单，不含存档正文，恢复次数加 1', async () => {
    const { id, code } = await openCloud();
    await sync(id, { push: [game({ s: 300, at: 5000 }), game({ g: 'spud-dawn', s: 42, at: 7000 })] });
    const res = await post('/api/cloud/recover', { code });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ saveId: id, games: [{ g: 'spud-dawn', s: 42, at: 7000 }, { g: 'yike', s: 300, at: 5000 }] } satisfies CloudRecoverResult);
    await post('/api/cloud/recover', { code });
    expect(await rows('SELECT recover_n FROM cloud_accounts')).toEqual([{ recover_n: 2 }]);
  });

  test('恢复码不存在 404 recovery-code-unknown，格式不对 400', async () => {
    await openCloud();
    expect(await problemOf(await post('/api/cloud/recover', { code: newCode() }))).toMatchObject({ status: 404, type: '/errors/recovery-code-unknown' });
    expect(await problemOf(await post('/api/cloud/recover', { code: 'abcd' }))).toMatchObject({ status: 400, type: '/errors/bad-cloud-request' });
  });
});

describe('API-CLOUD-003 POST /api/cloud/sync', () => {
  test('鉴权 401、云存档不存在 404、正文超过 2 MB 413', async () => {
    const { id } = await openCloud();
    expect(await problemOf(await post('/api/cloud/sync', { have: {}, haveMeta: 0, push: [] }))).toMatchObject({ status: 401, type: '/errors/cloud-auth' });
    expect(await problemOf(await syncRaw(randomHex(), {}))).toMatchObject({ status: 404, type: '/errors/cloud-not-found' });
    const big = { push: [game({ body: 'x'.repeat(2_097_152) })] };
    expect(await problemOf(await syncRaw(id, big))).toMatchObject({ status: 413, type: '/errors/cloud-too-large' });
    expect((await post('/api/cloud/sync', big)).status).toBe(401);
  });

  test('请求格式不对或一次超过 14 款 400', async () => {
    const { id } = await openCloud();
    const many = ['spud-dawn', 'f1-driver', 'f1', 'basketball-star', 'wealth-reborn', 'douluo', 'yexiao', 'hougong', 'nba', 'cba', 'lol', 'yike', 'entertainment-career'];
    const bad: Record<string, unknown>[] = [
      { push: Array.from({ length: 15 }, (_, i) => game({ g: many[i % many.length] })) },
      { push: [game({ g: 'nope' })] },
      { push: [game(), game()] },
      { push: [game({ enc: 'br' as never })] },
      { push: [game({ status: '字'.repeat(61) })] },
      { push: [game({ bytes: 0 })] },
      { push: [game({ body: '' })] },
      { push: [game({ s: -1 })] },
      { push: [game({ base: 1.5 })] },
      { push: [game({ force: false as never })] },
      { have: { yike: 'x' } },
      { have: [] },
      { haveMeta: undefined },
      { meta: { base: 0, at: 1, data: { wish: ['YIKE'], ach: {}, achDefs: {} } } },
      { meta: { base: 0, at: 1, data: { wish: [], ach: { yike: { a: 'x' } }, achDefs: {} } } },
      { meta: { base: 0, at: 1, data: { wish: [], ach: {}, achDefs: { yike: [{ key: 'a' }] } } } },
      { meta: { base: 0, data: { wish: [], ach: {}, achDefs: {} } } },
    ];
    for (const body of bad) expect(await problemOf(await syncRaw(id, body)), JSON.stringify(body).slice(0, 80)).toMatchObject({ status: 400, type: '/errors/bad-cloud-request' });
    expect((await post('/api/cloud/sync', '{nope', auth(id))).status).toBe(400);
    expect(await rows('SELECT * FROM cloud_games')).toEqual([]);
    expect((await syncRaw(id, { push: Array.from({ length: 13 }, (_, i) => game({ g: many[i] })) })).status).toBe(200);
  });

  test('首次推送写入版本 1；同一份内容重推不加版本号；同一款 10 秒内只写一次', async () => {
    const { id } = await openCloud();
    const first = await sync(id, { push: [game()] });
    expect(first.results).toEqual([{ g: 'yike', r: 'ok', rev: 1 }]);
    expect(first.pull).toEqual([]);
    expect(typeof first.now).toBe('number');
    expect(await cloudRow()).toMatchObject({ rev: 1, enc: 'json', body: '{"lvl":"1"}', bytes: 11, seconds: 60, last_played: 1000, status: '第 1 关', saved_at: 1000, beat_rev: null });
    const writtenAt = (await cloudRow()).updated_at;

    // 场景「同一份内容重推」：base 1 再推同一份，ok 且版本号仍是 1
    expect((await sync(id, { push: [game({ base: 1 })], have: { yike: 1 } })).results).toEqual([{ g: 'yike', r: 'ok', rev: 1 }]);
    // 网络失败后原样重推（base 仍是 0）也不加版本号
    expect((await sync(id, { push: [game()] })).results).toEqual([{ g: 'yike', r: 'ok', rev: 1 }]);
    expect((await cloudRow()).updated_at).toBe(writtenAt);

    expect((await sync(id, { push: [game({ base: 1, body: '{"lvl":"2"}' })], have: { yike: 1 } })).results).toEqual([{ g: 'yike', r: 'too-soon', rev: 1 }]);
    expect(await cloudRow()).toMatchObject({ rev: 1, body: '{"lvl":"1"}' });
    await age();
    expect((await sync(id, { push: [game({ base: 1, body: '{"lvl":"2"}' })], have: { yike: 1 } })).results).toEqual([{ g: 'yike', r: 'ok', rev: 2 }]);
    expect(await cloudRow()).toMatchObject({ rev: 2, body: '{"lvl":"2"}', beat_rev: null });
  });

  describe('RULE-CLOUD-001 冲突', () => {
    // 云端一克之差版本 2：累计 60 秒，改档时间 1000
    async function atRev2() {
      const { id } = await openCloud();
      await sync(id, { push: [game()] });
      await age();
      await sync(id, { push: [game({ base: 1, body: '{"lvl":"2"}' })] });
      await age();
      return id;
    }

    test('推送的更长：写入，记下被换掉的版本号', async () => {
      const id = await atRev2();
      const r = await sync(id, { push: [game({ base: 1, body: '{"b":"1"}', s: 61 })], have: { yike: 1 } });
      expect(r.results).toEqual([{ g: 'yike', r: 'ok', rev: 3 }]);
      expect(r.pull).toEqual([]);
      expect(await cloudRow()).toMatchObject({ rev: 3, body: '{"b":"1"}', seconds: 61, beat_rev: 2 });
    });

    test('推送的更短：云端不变，回传云端那份', async () => {
      const id = await atRev2();
      const r = await sync(id, { push: [game({ base: 1, body: '{"a":"9"}', s: 59, at: 9999 })], have: { yike: 2 } });
      expect(r.results).toEqual([{ g: 'yike', r: 'kept-cloud', rev: 2 }]);
      expect(r.pull).toEqual([{ g: 'yike', rev: 2, enc: 'json', body: '{"lvl":"2"}', bytes: 11, s: 60, last: 1000, status: '第 1 关', at: 1000 }]);
      expect(await cloudRow()).toMatchObject({ rev: 2, body: '{"lvl":"2"}' });
    });

    test('时长相同：推送的改档时间更晚才写入', async () => {
      const id = await atRev2();
      expect((await sync(id, { push: [game({ base: 1, body: '{"t":"1"}', at: 1000 })] })).results[0].r).toBe('kept-cloud');
      expect((await sync(id, { push: [game({ base: 1, body: '{"t":"1"}', at: 999 })] })).results[0].r).toBe('kept-cloud');
      expect((await sync(id, { push: [game({ base: 1, body: '{"t":"1"}', at: 1001 })] })).results).toEqual([{ g: 'yike', r: 'ok', rev: 3 }]);
      expect(await cloudRow()).toMatchObject({ rev: 3, beat_rev: 2 });
    });

    test('撤销强制推送：不比较直接写入，记下被换掉的版本号', async () => {
      const id = await atRev2();
      const r = await sync(id, { push: [game({ base: 2, body: '{"undo":"1"}', s: 1, at: 1, force: true })] });
      expect(r.results).toEqual([{ g: 'yike', r: 'ok', rev: 3 }]);
      expect(await cloudRow()).toMatchObject({ rev: 3, body: '{"undo":"1"}', seconds: 1, beat_rev: 2 });
    });

    test('被换掉的设备下次同步拉回胜出的一版，带 beat', async () => {
      const id = await atRev2();
      await sync(id, { push: [game({ base: 1, body: '{"b":"1"}', s: 120 })] });
      const a = await sync(id, { have: { yike: 2 } });
      expect(a.pull).toEqual([expect.objectContaining({ g: 'yike', rev: 3, body: '{"b":"1"}', s: 120, beat: 2 })]);
      expect((await sync(id, { have: { yike: 3 } })).pull).toEqual([]);
    });

    test('胜出方之后的普通写入保留 beat：被换掉的设备晚些同步仍拿得到', async () => {
      const id = await atRev2();
      await sync(id, { push: [game({ base: 1, body: '{"b":"1"}', s: 120 })] });
      await age();
      expect((await sync(id, { push: [game({ base: 3, body: '{"b":"2"}', s: 180 })], have: { yike: 3 } })).results).toEqual([{ g: 'yike', r: 'ok', rev: 4 }]);
      expect(await cloudRow()).toMatchObject({ rev: 4, body: '{"b":"2"}', beat_rev: 2 });
      const a = await sync(id, { have: { yike: 2 } });
      expect(a.pull).toEqual([expect.objectContaining({ g: 'yike', rev: 4, body: '{"b":"2"}', s: 180, beat: 2 })]);
    });

    test('竞态「两台设备同时推同一款」：先到的写入，后到的再比一次，版本号只加一次', async () => {
      const id = await atRev2();
      const [a, b] = await Promise.all([
        sync(id, { push: [game({ base: 2, body: '{"dev":"A"}', s: 70 })] }),
        sync(id, { push: [game({ base: 2, body: '{"dev":"B"}', s: 80 })] }),
      ]);
      const outcomes = [a.results[0], b.results[0]];
      expect(outcomes.filter(r => r.r === 'ok')).toEqual([{ g: 'yike', r: 'ok', rev: 3 }]);
      expect(outcomes.filter(r => r.r !== 'ok').map(r => r.r)).toEqual([expect.stringMatching(/^(too-soon|kept-cloud)$/)]);
      expect((await cloudRow()).rev).toBe(3);
    });
  });

  test('单款按上传编码后的正文超过 1 MB 不上云（RULE-CLOUD-002）；原文字节数不设上限，json 的以服务端量的为准', async () => {
    const { id } = await openCloud();
    const json = (n: number) => `{"k":"${'x'.repeat(n - 8)}"}`; // 正好 n 字节的 json 正文
    const r1 = await sync(id, { push: [
      game({ g: 'spud-dawn', enc: 'gz64', body: 'A'.repeat(CLOUD.gameMaxBytes + 1), bytes: 3_000_000 }),
      game({ g: 'hougong', enc: 'gz64', body: 'H4sI', bytes: 5_000_000 }),
      game({ g: 'douluo', body: '{"名":"一克"}', bytes: 3 }),
    ] });
    expect(r1.results).toEqual([{ g: 'spud-dawn', r: 'too-big', rev: 0 }, { g: 'hougong', r: 'ok', rev: 1 }, { g: 'douluo', r: 'ok', rev: 1 }]);
    // TC-CLOUD-012 第 4、5 步：正好 1,048,577 字节 too-big，正好 1,048,576 字节 ok
    expect((await sync(id, { push: [game({ g: 'f1', body: json(CLOUD.gameMaxBytes + 1), bytes: 10 })] })).results).toEqual([{ g: 'f1', r: 'too-big', rev: 0 }]);
    expect((await sync(id, { push: [game({ body: json(CLOUD.gameMaxBytes), bytes: 10 })] })).results).toEqual([{ g: 'yike', r: 'ok', rev: 1 }]);
    expect(await rows('SELECT game, bytes FROM cloud_games ORDER BY game')).toEqual([
      { game: 'douluo', bytes: 16 }, { game: 'hougong', bytes: 5_000_000 }, { game: 'yike', bytes: CLOUD.gameMaxBytes },
    ]);
    // 云端已有的一款再推超限的一份：云端不变，回云端的版本号
    await age();
    expect((await sync(id, { push: [game({ base: 1, body: json(CLOUD.gameMaxBytes + 1), s: 999 })] })).results).toEqual([{ g: 'yike', r: 'too-big', rev: 1 }]);
    expect(await cloudRow()).toMatchObject({ rev: 1, bytes: CLOUD.gameMaxBytes, seconds: 60 });
  });

  test('pull 回传云端比 have 新的游戏，这次写入的不回传', async () => {
    const { id } = await openCloud();
    await sync(id, { push: [game(), game({ g: 'f1', body: '{"f":"1"}' })] });
    const other = await sync(id, {});
    expect(other.pull.map(p => [p.g, p.rev])).toEqual([['f1', 1], ['yike', 1]]);
    expect((await sync(id, { have: { yike: 1, f1: 1 } })).pull).toEqual([]);
    await age();
    const mixed = await sync(id, { have: { yike: 1 }, push: [game({ base: 1, body: '{"lvl":"3"}' })] });
    expect(mixed.results).toEqual([{ g: 'yike', r: 'ok', rev: 2 }]);
    expect(mixed.pull.map(p => p.g)).toEqual(['f1']);
  });

  test('最近同步日不是今天时改成今天', async () => {
    const { id } = await openCloud();
    await exec("UPDATE cloud_accounts SET seen_day = '2025-01-01'");
    await sync(id, {});
    expect(await rows('SELECT seen_day FROM cloud_accounts')).toEqual([{ seen_day: bjToday() }]);
  });

  describe('元数据', () => {
    const meta = (over: Partial<CloudMetaData> = {}): CloudMetaData => ({ wish: ['f1'], ach: { yike: { win: 100 } }, achDefs: { yike: [{ key: 'win', name: '过关' }] }, ...over });

    test('首次推送为版本 1；版本号一致时整体替换；内容不变不加版本号', async () => {
      const { id } = await openCloud();
      const first = await sync(id, { meta: { base: 0, data: meta(), at: 10 } });
      expect(first.meta).toEqual({ rev: 1, data: meta(), at: 10 });
      expect((await sync(id, { haveMeta: 1, meta: { base: 1, data: meta(), at: 20 } })).meta).toBeUndefined();
      expect(await rows('SELECT rev, saved_at FROM cloud_meta')).toEqual([{ rev: 1, saved_at: 10 }]);
      const next = meta({ wish: [] });
      expect((await sync(id, { haveMeta: 1, meta: { base: 1, data: next, at: 30 } })).meta).toEqual({ rev: 2, data: next, at: 30 });
      expect((await sync(id, { haveMeta: 0 })).meta?.rev).toBe(2);
      expect((await sync(id, { haveMeta: 2 })).meta).toBeUndefined();
    });

    test('版本号不一致时愿望单与成就取并集，同一成就取更早的解锁时间', async () => {
      const { id } = await openCloud();
      await sync(id, { meta: { base: 0, data: meta(), at: 10 } });
      const mine: CloudMetaData = { wish: ['douluo', 'f1'], ach: { yike: { win: 50, fast: 70 }, f1: { pole: 80 } }, achDefs: { yike: [{ key: 'win', name: '新名字' }, { key: 'fast', name: '快' }], f1: [{ key: 'pole', name: '杆位' }] } };
      const r = await sync(id, { meta: { base: 0, data: mine, at: 5 } });
      expect(r.meta).toEqual({
        rev: 2, at: 10,
        data: {
          wish: ['f1', 'douluo'],
          ach: { yike: { win: 50, fast: 70 }, f1: { pole: 80 } },
          achDefs: { yike: [{ key: 'win', name: '过关' }, { key: 'fast', name: '快' }], f1: [{ key: 'pole', name: '杆位' }] },
        },
      });
    });
  });

  test('INV-CLOUD-001 库里只有编号摘要、恢复码摘要与编号密文，没有原文', async () => {
    const { id, code } = await openCloud();
    await sync(id, { push: [game()], meta: { base: 0, data: { wish: [], ach: {}, achDefs: {} }, at: 1 } });
    await post('/api/cloud/recover', { code });
    expect((await rows<{ name: string }>('PRAGMA table_info(cloud_accounts)')).map(c => c.name)).toEqual(['sid', 'code_hash', 'sid_box', 'created_at', 'seen_day', 'recover_n']);
    for (const table of ['cloud_accounts', 'cloud_games', 'cloud_meta', 'launch_days', 'launch_fails', 'visitors', 'visitor_days', 'game_days']) {
      const dump = JSON.stringify(await rows(`SELECT * FROM ${table}`));
      expect(dump.includes(id) || dump.includes(code), table).toBe(false);
    }
  });
});
