import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Device, freshPlatform, type Platform } from './testing/env';

// 旧版（dd731d6）留在玩家浏览器里的样子：元数据缺了 achDefs，带着从没读写过的 sendLog 和一个本版不认识的字段
const OLD_META = {
  session:{ email:'local', at:1700000000000 }, users:{ local:{ nickname:'玩家', created:1700000000000 } },
  stats:{ local:{ yike:{ seconds:600, last:1761099000000, ach:{ a:1 }, status:'第 5 关' } } },
  wish:{ local:['f1'] }, sendLog:{ legacy:[1, 2] }, vid:'b'.repeat(32), future:{ x:1 },
};
const YIKE = { 'yikezhicha.v2':'{"level":5}' };

let dev: Device, P: Platform;
beforeEach(async () => {
  vi.useFakeTimers({ toFake:['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  dev = new Device().install();
  dev.nav.onLine = false; // 这一组不测云同步
  P = await freshPlatform();
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('旧版元数据 changju.meta.v1', () => {
  it('浅合并读入，缺的字段补空，未知字段与 sendLog 写回时原样保留', async () => {
    dev.storage.setItem('changju.meta.v1', JSON.stringify(OLD_META));
    await P.boot();
    P.toggleWish('nba');
    expect(dev.meta()).toEqual({ ...OLD_META, achDefs:{}, wish:{ local:['f1', 'nba'] } });
    expect(P.peek('yike')).toEqual(OLD_META.stats.local.yike);
    expect(P.playUser()).toEqual({ id:'u9c436708', nickname:'玩家' });
  });

  it('读不出的元数据当作空，但仍算本机有过平台数据，新领的旅客编号标为老玩家', async () => {
    dev.storage.setItem('changju.meta.v1', '{broken');
    await P.boot();
    const m = dev.meta();
    expect(m.old).toBe(1);
    expect(m.vid).toMatch(/^[0-9a-f]{32}$/);
    expect(m.sendLog).toEqual({});
    expect(m.session.email).toBe('local');
  });
});

describe('本机存档库 IndexedDB changju', () => {
  it('旧版的第 1 版库原样读入，不升版本，kv 与 games 两个库都在', async () => {
    dev.idb.seed('local|yike', YIKE);
    expect(await P.readSave('yike')).toEqual({ ok:true, save:YIKE });
    expect(await P.readSave('nba')).toEqual({ ok:true, save:undefined });
    const db = dev.idb.dbs.get('changju')!;
    expect(db.version).toBe(1);
    expect([...db.stores.keys()].sort()).toEqual(['games', 'kv']);
    expect(db.stores.get('games')!.keyPath).toBe('id');
  });

  it('全新浏览器第一次写存档时建第 1 版库与两个库', async () => {
    expect(await P.writeSave('yike', YIKE)).toBe(true);
    const db = dev.idb.dbs.get('changju')!;
    expect(db.version).toBe(1);
    expect([...db.stores.keys()].sort()).toEqual(['games', 'kv']);
    expect(dev.idb.kv().get('local|yike')).toEqual(YIKE);
  });

  it('本机新增的键只有 changju.cloud.v1 与 undo:<游戏>', async () => {
    dev.nav.onLine = true;
    const { FakeCloud, installFetch } = await import('./testing/server');
    installFetch(new FakeCloud());
    dev.storage.setItem('changju.meta.v1', JSON.stringify(OLD_META));
    dev.idb.seed('local|yike', YIKE);
    await P.boot();
    await P.syncNow();
    await P.undo.keepUndo('yike', YIKE, 'conflict', { k:'cloud' });
    expect([...dev.storage.map.keys()].sort()).toEqual(['changju.cloud.v1', 'changju.meta.v1']);
    expect([...dev.idb.kv().keys()].sort()).toEqual(['local|yike', 'undo:yike']);
  });
});

describe('存档库打不开或超时时的降级', () => {
  it('打开 4 秒没回应：读档报 save-timeout，之后重新打开能读出', async () => {
    dev.idb.seed('local|yike', YIKE);
    dev.idb.knobs.hangOpen = true;
    const r = P.readSave('yike');
    await vi.advanceTimersByTimeAsync(3_999);
    let done = false; void r.then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await r).toEqual({ ok:false, why:'save-timeout' });
    dev.idb.knobs.hangOpen = false;
    expect(await P.readSave('yike')).toEqual({ ok:true, save:YIKE });
  });

  it('打开报错：读档报 save-error，不落到内存里假装有档；写档返回 false', async () => {
    dev.idb.knobs.failOpen = true;
    expect(await P.readSave('yike')).toEqual({ ok:false, why:'save-error' });
    expect(await P.writeSave('yike', YIKE)).toBe(false);
    dev.idb.knobs.failOpen = false;
    expect(await P.readSave('yike')).toEqual({ ok:true, save:undefined });
  });

  it('读出 4 秒没完成：报 save-timeout，丢掉这条连接，下次重新打开', async () => {
    dev.idb.seed('local|yike', YIKE);
    expect((await P.readSave('yike')).ok).toBe(true);
    const opens = dev.idb.opens;
    dev.idb.knobs.hangTx = true;
    const r = P.readSave('yike');
    await vi.advanceTimersByTimeAsync(4_000);
    expect(await r).toEqual({ ok:false, why:'save-timeout' });
    dev.idb.knobs.hangTx = false;
    expect(await P.readSave('yike')).toEqual({ ok:true, save:YIKE });
    expect(dev.idb.opens).toBe(opens + 1);
  });

  it('页面在后台时超时计时暂停，回到前台接着计', async () => {
    dev.idb.knobs.hangOpen = true;
    const r = P.readSave('yike');
    let done = false; void r.then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(2_000);
    dev.setHidden(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(done).toBe(false);
    dev.setHidden(false);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await r).toEqual({ ok:false, why:'save-timeout' });
  });

  it('同一款游戏的读写排队：先发起的写完，后发起的读才读', async () => {
    const w = P.writeSave('yike', YIKE), r = P.readSave('yike');
    expect(await w).toBe(true);
    expect(await r).toEqual({ ok:true, save:YIKE });
  });
});
