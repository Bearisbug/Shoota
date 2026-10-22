import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CloudGamePush, CloudSyncBody, GameSave } from '../shared';
import { Device, freshPlatform, type Platform } from './testing/env';
import { FakeCloud, installFetch } from './testing/server';

// 等假件与请求的异步回调跑完；需要 gzip 大存档的用例直接 await syncNow
const macrotask = (globalThis as unknown as { setImmediate(fn: () => void): void }).setImmediate; // 不受假计时器影响
const flush = async (n = 100) => { for (let i = 0; i < n; i++) await new Promise<void>(r => macrotask(r)); };
// gzip 在线程池里跑，轮几次事件循环不一定够：等到条件成立为止
async function until(ok: () => unknown){ for (let i = 0; i < 20_000 && !ok(); i++) await new Promise<void>(r => macrotask(r)); }
// 不可压缩的随机文本：64 个字符均匀出现，gzip 后约为原文的 3/4，再 base64 又涨回原文大小
function noise(n: number, seed: number){
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let x = seed, out = '';
  for (let i = 0; i < n; i++) { x = (Math.imul(x, 1103515245) + 12345) >>> 0; out += A[x >>> 26]; }
  return out;
}

type Seed = Record<string, { save: GameSave; s?: number; last?: number }>;
function seed(dev: Device, games: Seed){
  const stats: Record<string, object> = {};
  for (const [g, x] of Object.entries(games)) { dev.idb.seed('local|' + g, x.save); stats[g] = { seconds:x.s ?? 60, last:x.last ?? 1000, ach:{}, status:'' }; }
  dev.storage.setItem('changju.meta.v1', JSON.stringify({ session:{ email:'local', at:1 }, users:{ local:{ nickname:'玩家', created:1 } },
    stats:{ local:stats }, wish:{ local:[] }, achDefs:{}, sendLog:{}, vid:'a'.repeat(32) }));
}

// 一个标签页：每次操作前把它所在的设备装成全局，操作后等异步回调跑完
class Tab {
  constructor(readonly dev: Device, readonly P: Platform){}
  async run<T>(fn: (P: Platform) => Promise<T> | T): Promise<T> { this.dev.install(); const r = await fn(this.P); await flush(); return r; }
  // 模拟玩了一会儿：存档写进本机，累计秒数与最近游玩更新
  play(g: string, save: GameSave, seconds: number, last = Date.now()){
    return this.run(async P => { expect(await P.writeSave(g, save)).toBe(true); const s = P.stat(g)!; s.seconds = seconds; s.last = last; P.persist(); });
  }
  sync(){ return this.run(P => P.syncNow()); }
  save(g: string){ return this.dev.idb.kv().get('local|' + g); }
}
// boot：走完整的平台启动（定时同步、联网与隐藏事件都接上）；否则只建本机玩家并同步一次
async function open(dev: Device, o: { boot?: boolean } = {}){
  dev.install();
  const P = await freshPlatform();
  if (o.boot) { await P.boot(); await flush(); } else { P.metaMod.ensurePlayer(); await P.syncNow(); await flush(); }
  return new Tab(dev, P);
}

let server: FakeCloud;
const syncs = () => server.syncs().map(s => s.body as CloudSyncBody);
const pushed = () => syncs().flatMap(b => b.push);
const sidOf = (dev: Device) => dev.cloud()?.saveId as string;

beforeEach(() => {
  vi.useFakeTimers({ toFake:['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(1761200000000);
  server = new FakeCloud(); installFetch(server);
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('首次上云 FLOW-CLOUD-FIRST', () => {
  it('本机有进度时打开平台就开通云存档并整份上传，商店提示一次恢复码；云存档编号不进统计', async () => {
    const dev = new Device();
    seed(dev, { yike:{ save:{ 'yikezhicha.v2':'{"level":5}' }, s:600 }, douluo:{ save:{ d:'1' }, s:65 } });
    dev.install();
    const P = await freshPlatform(), created: [string, number][] = [];
    P.onCloud(e => { if (e.type === 'created') created.push([e.code, server.accounts.size]); });
    await P.boot(); await flush();
    const st = dev.cloud(), sid = sidOf(dev);
    expect(sid).toMatch(/^[0-9a-f]{32}$/);
    expect(st.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/);
    expect(server.sent.map(s => [s.path, s.auth])).toEqual([['/api/cloud/account', 'Save ' + sid], ['/api/cloud/sync', 'Save ' + sid]]);
    expect(server.sent[0].body).toEqual({ code:st.code });
    expect(pushed().map(p => [p.g, p.base, p.enc, p.s])).toEqual([['douluo', 0, 'json', 65], ['yike', 0, 'json', 600]]);
    expect(server.saveOf(sid, 'yike')).toEqual({ 'yikezhicha.v2':'{"level":5}' });
    expect(P.cloudStatus()).toEqual({ phase:'idle', code:st.code, lastSyncAt:Date.now(), tooBig:[] });
    expect(created).toEqual([[st.code, 1]]); // 云端开通成功之后才提示，只提示一次
    expect(JSON.stringify(await dev.collected())).not.toContain(sid);
  });

  it('只打开过游戏、存档为空：不开通，等真有进度', async () => {
    const dev = new Device();
    seed(dev, { yike:{ save:{} } });
    const A = await open(dev, { boot:true });
    expect(server.sent).toEqual([]);
    expect(A.P.cloudStatus()).toEqual({ phase:'off', code:null, lastSyncAt:0, tooBig:[] });
    await A.play('yike', { k:'1' }, 70);
    await A.run(() => vi.advanceTimersByTimeAsync(60_000));
    expect(server.accounts.size).toBe(1);
  });

  it('写不了本地存储或存档库读不出：不开通', async () => {
    const d1 = new Device(); seed(d1, { yike:{ save:{ k:'1' } } }); d1.storage.failWrites = true;
    await open(d1, { boot:true });
    const d2 = new Device(); seed(d2, { yike:{ save:{ k:'1' } } }); d2.idb.knobs.failOpen = true;
    await open(d2, { boot:true });
    expect(server.sent).toEqual([]);
    expect(d1.cloud()).toBeNull();
    expect(d2.cloud()).toBeNull();
  });

  it('两个标签页同时开通：只开通一个，另一个用它的编号与恢复码', async () => {
    const dev = new Device(); seed(dev, { yike:{ save:{ k:'1' } } });
    dev.install();
    const [A, B] = [await freshPlatform(), await freshPlatform()];
    await Promise.all([A.boot(), B.boot()]);
    await flush();
    await B.syncNow();
    expect(server.accounts.size).toBe(1);
    expect(new Set(server.sent.map(s => s.auth))).toEqual(new Set(['Save ' + sidOf(dev)]));
    expect(B.cloudStatus().code).toBe(dev.cloud().code);
  });

  it('编号已被开通且恢复码不同（409）：重新生成一对再开通', async () => {
    const dev = new Device(); seed(dev, { yike:{ save:{ k:'1' } } });
    server.failNext = { status:409, type:'/errors/cloud-exists' };
    await open(dev);
    const [first, second] = server.sent;
    expect(first.auth).not.toBe(second.auth);
    expect(second.auth).toBe('Save ' + sidOf(dev));
    expect(server.accounts.get(sidOf(dev))!.code).toBe(dev.cloud().code);
  });

  it('还没开通时切后台，运行层写完存档再请求同步：不开通', async () => {
    const dev = new Device(); seed(dev, { yike:{ save:{} } });
    const A = await open(dev, { boot:true });
    await A.play('yike', { k:'1' }, 70);
    await A.run(async P => { dev.setHidden(true); P.requestSync(); await P.syncNow(); });
    expect(server.sent).toEqual([]);
    expect(dev.cloud()).toBeNull();
  });

  it('开通请求没送到：下一分钟用同一对编号与恢复码再试', async () => {
    const dev = new Device(); seed(dev, { yike:{ save:{ k:'1' } } });
    server.down = true;
    const A = await open(dev, { boot:true });
    const st = dev.cloud();
    expect(st.lastSyncAt).toBe(0);
    server.down = false;
    await A.run(() => vi.advanceTimersByTimeAsync(60_000));
    expect(server.accounts.get(st.saveId)!.code).toBe(st.code);
    expect(server.saveOf(st.saveId, 'yike')).toEqual({ k:'1' });
  });
});

describe('云同步 FLOW-CLOUD-SYNC', () => {
  let dev: Device, A: Tab;
  beforeEach(async () => {
    dev = new Device(); seed(dev, { yike:{ save:{ k:'1' } }, douluo:{ save:{ d:'1' } } });
    A = await open(dev, { boot:true });
  });

  it('平台页面开着时每 60 秒同步一次，只推改过的；游戏中没有改动时不发请求', async () => {
    const n = syncs().length;
    await A.run(() => vi.advanceTimersByTimeAsync(60_000));
    expect(syncs().length).toBe(n + 1);
    expect(syncs().at(-1)!.push).toEqual([]); // 没改过：只问云端有没有更新
    A.P.holdGame('yike');
    await A.run(() => vi.advanceTimersByTimeAsync(60_000));
    expect(syncs().length).toBe(n + 1);
    await A.play('yike', { k:'2' }, 120);
    await A.run(() => vi.advanceTimersByTimeAsync(60_000));
    expect(syncs().at(-1)!.push.map(p => [p.g, p.base, p.body])).toEqual([['yike', 1, '{"k":"2"}']]);
    expect(syncs().at(-1)!.have).toEqual({ yike:1, douluo:1 });
  });

  it('退出游戏后请求一次同步', async () => {
    await A.play('douluo', { d:'2' }, 80);
    await A.run(P => P.requestSync());
    expect(server.saveOf(sidOf(dev), 'douluo')).toEqual({ d:'2' });
  });

  it('存档没变、只多了游玩秒数也推，云端秒数跟上、版本号不变；10 秒内写过的下一分钟再推', async () => {
    const row = () => server.accounts.get(sidOf(dev))!.games.get('douluo')!;
    expect([row().rev, row().s]).toEqual([1, 60]);
    server.tooSoonMs = 10_000;
    await A.run(P => { const s = P.stat('douluo')!; s.seconds = 75; s.last = Date.now(); P.persist(); P.requestSync(); });
    expect(syncs().at(-1)!.push.map(p => [p.g, p.base, p.body, p.s])).toEqual([['douluo', 1, '{"d":"1"}', 75]]);
    expect([row().rev, row().s]).toEqual([1, 60]); // too-soon：本机仍算改过
    await A.run(() => vi.advanceTimersByTimeAsync(60_000));
    expect(syncs().at(-1)!.push.map(p => [p.g, p.s])).toEqual([['douluo', 75]]);
    expect([row().rev, row().s]).toEqual([1, 75]);
    expect(dev.cloud().games.douluo).toMatchObject({ rev:1, s:75 });
    await A.run(() => vi.advanceTimersByTimeAsync(60_000));
    expect(syncs().at(-1)!.push).toEqual([]); // 对齐之后不再推
  });

  it('离线时跳过，改动留在本机；联网后立刻补一次', async () => {
    const n = server.sent.length;
    dev.nav.onLine = false;
    await A.play('yike', { k:'offline' }, 200);
    await A.run(async P => { P.requestSync(); await vi.advanceTimersByTimeAsync(120_000); });
    expect(server.sent.length).toBe(n);
    dev.nav.onLine = true;
    await A.run(() => { dispatchEvent(new Event('online')); });
    expect(server.saveOf(sidOf(dev), 'yike')).toEqual({ k:'offline' });
    expect(server.accounts.get(sidOf(dev))!.games.get('yike')!.s).toBe(200);
  });

  it('网络失败：本机不变，下一分钟原样重推', async () => {
    await A.play('yike', { k:'3' }, 90);
    server.down = true;
    await A.run(P => P.requestSync());
    const before = dev.cloud();
    server.down = false;
    await A.run(() => vi.advanceTimersByTimeAsync(60_000));
    expect(before.games.yike.rev).toBe(1);
    expect(server.saveOf(sidOf(dev), 'yike')).toEqual({ k:'3' });
    expect(dev.cloud().games.yike.rev).toBe(2);
  });

  it('页面隐藏时用 keepalive 补推，只推 60 KB 以内的游戏，其余等下次', async () => {
    await A.play('yike', { k:'hide' }, 90);
    await A.play('douluo', { d:noise(100_000, 7) }, 90);
    await A.run(() => dev.setHidden(true));
    await until(() => server.sent.at(-1)!.keepalive);
    const last = server.sent.at(-1)!;
    expect(last.keepalive).toBe(true);
    expect(last.bytes).toBeLessThanOrEqual(60_000);
    expect((last.body as CloudSyncBody).push.map(p => p.g)).toEqual(['yike']);
    await A.run(() => dev.setHidden(false));
    await A.run(P => P.syncNow());
    expect(server.saveOf(sidOf(dev), 'douluo')).toEqual({ d:noise(100_000, 7) });
  });

  it('游戏中切后台，运行层写完存档再请求同步：仍只用 keepalive 发，正文不超过 60 KB，一款都放不下时不发请求', async () => {
    A.P.holdGame('yike');
    await A.play('yike', { k:noise(90_000, 5) }, 120);
    const n = server.sent.length;
    await A.run(async P => { dev.setHidden(true); P.requestSync(); await P.syncNow(); });
    expect(server.sent.length).toBe(n);
    await A.play('douluo', { d:'2' }, 90);
    await A.run(async P => { P.requestSync(); await P.syncNow(); });
    const sent = server.sent.slice(n);
    expect(sent.map(s => [s.path, s.keepalive])).toEqual([['/api/cloud/sync', true]]);
    expect(sent[0].bytes).toBeLessThanOrEqual(60_000);
    expect((sent[0].body as CloudSyncBody).push.map(p => p.g)).toEqual(['douluo']);
    expect(server.saveOf(sidOf(dev), 'yike')).toEqual({ k:'1' });
  });

  it('切后台那次同步还没回来时运行层写完存档再请求：回来后再用 keepalive 补推这次的改动', async () => {
    await A.play('yike', { k:'a' }, 90);
    const n = server.sent.length, f = server.fetch;
    let release = () => {};
    const gate = new Promise<void>(r => { release = r; });
    vi.stubGlobal('fetch', async (i: RequestInfo | URL, init?: RequestInit) => { await gate; return f(i, init); });
    await A.run(() => dev.setHidden(true));
    await A.play('yike', { k:'b' }, 95);
    await A.run(P => { P.requestSync(); release(); });
    expect(server.sent.slice(n).map(s => [s.path, s.keepalive])).toEqual([['/api/cloud/sync', true], ['/api/cloud/sync', true]]);
    expect(server.saveOf(sidOf(dev), 'yike')).toEqual({ k:'b' });
  });

  it('两个标签页同时同步：一次只跑一个，另一个这次跳过', async () => {
    dev.install();
    const B = await freshPlatform(), n = syncs().length;
    await Promise.all([A.P.syncNow(), B.syncNow()]);
    expect(syncs().length).toBe(n + 1);
  });

  it('这次读档失败过的游戏不推，再读成功后照常推（RULE-LAUNCH-001）', async () => {
    dev.idb.knobs.failGet = k => k === 'local|yike';
    expect((await A.run(P => P.readSave('yike'))).ok).toBe(false);
    dev.idb.knobs.failGet = null;
    dev.idb.seed('local|yike', { k:'other-tab' });
    await A.run(P => P.syncNow());
    expect(server.saveOf(sidOf(dev), 'yike')).toEqual({ k:'1' });
    expect((await A.run(P => P.readSave('yike'))).ok).toBe(true);
    await A.run(P => P.syncNow());
    expect(server.saveOf(sidOf(dev), 'yike')).toEqual({ k:'other-tab' });
  });

  it('云存档已到期删除：用本机编号与恢复码重新开通并整份上传，不再提示恢复码', async () => {
    const st = dev.cloud(), created: string[] = [];
    A.P.onCloud(e => { if (e.type === 'created') created.push(e.code); });
    server.accounts.clear();
    await A.run(P => P.syncNow());
    expect(server.accounts.get(st.saveId)!.code).toBe(st.code);
    expect(server.saveOf(st.saveId, 'yike')).toEqual({ k:'1' });
    expect(server.saveOf(st.saveId, 'douluo')).toEqual({ d:'1' });
    expect(created).toEqual([]);
  });

  it('鉴权失败（401）：这个页面停止同步，快照标出', async () => {
    server.failNext = { status:401, type:'/errors/cloud-auth' };
    await A.run(P => P.syncNow());
    expect(A.P.cloudStatus().phase).toBe('unavailable');
    const n = server.sent.length;
    await A.play('yike', { k:'2' }, 90);
    await A.run(async P => { await P.syncNow(); await vi.advanceTimersByTimeAsync(60_000); });
    expect(server.sent.length).toBe(n);
  });

  it('拉回的进度写不进本机存档库：版本号不更新，下次重拉', async () => {
    const B = await open(new Device());
    const found = await B.run(P => P.recover(dev.cloud().code));
    if (!found.ok) throw new Error('recover');
    await B.run(P => P.adopt(found.saveId, found.code));
    await A.play('yike', { k:'from-A' }, 300);
    await A.sync();
    B.dev.idb.knobs.failPut = true;
    await B.sync();
    expect(B.save('yike')).toEqual({ k:'1' });
    expect(B.dev.cloud().games.yike.rev).toBe(1);
    B.dev.idb.knobs.failPut = false;
    await B.sync();
    expect(B.save('yike')).toEqual({ k:'from-A' });
    expect(B.dev.cloud().games.yike.rev).toBe(2);
  });
});

describe('单款上限按上传编码后的正文算（RULE-CLOUD-002）', () => {
  it('原文超过 1 MB 但压缩后放得下的照常上云；压缩后仍超过的只存本机，缩小后再推', async () => {
    const dev = new Device(), big = 'x'.repeat(1_500_000), dense = noise(1_300_000, 3);
    seed(dev, { yike:{ save:{ k:big } }, douluo:{ save:{ d:dense } } });
    const A = await open(dev);
    const sid = sidOf(dev), yike = pushed().find(p => p.g === 'yike')!;
    expect([yike.enc, yike.bytes]).toEqual(['gz64', 1_500_008]);
    expect(yike.body.length).toBeLessThan(1_048_576);
    expect(server.saveOf(sid, 'yike')).toEqual({ k:big });
    expect(pushed().some(p => p.g === 'douluo')).toBe(false);
    expect(A.P.cloudStatus().tooBig).toEqual(['douluo']);
    expect(A.save('douluo')).toEqual({ d:dense });
    await A.play('douluo', { d:'small' }, 70);
    await A.sync();
    expect(server.saveOf(sid, 'douluo')).toEqual({ d:'small' });
    expect(A.P.cloudStatus().tooBig).toEqual([]);
  });

  it('游戏中这款变得超过 1 MB：每分钟那次同步不发请求，也马上标出只存在本机', async () => {
    const dev = new Device(); seed(dev, { yike:{ save:{ k:'1' } } });
    const A = await open(dev, { boot:true }), seen: string[][] = [];
    A.P.onCloud(e => { if (e.type === 'status') seen.push(e.status.tooBig); });
    A.P.holdGame('yike');
    await A.play('yike', { k:noise(1_300_000, 9) }, 120);
    const n = server.sent.length;
    await A.run(() => vi.advanceTimersByTimeAsync(60_000));
    await until(() => A.P.cloudStatus().tooBig.length);
    expect(A.P.cloudStatus().tooBig).toEqual(['yike']);
    expect(seen.at(-1)).toEqual(['yike']);
    expect(server.sent.length).toBe(n);
  });

  it('浏览器不支持压缩时正文就是原文，原文超过 1 MB 的只存本机', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    const dev = new Device();
    seed(dev, { yike:{ save:{ k:'x'.repeat(1_100_000) } }, douluo:{ save:{ d:'y'.repeat(5_000) } } });
    const A = await open(dev);
    expect(pushed().map(p => [p.g, p.enc])).toEqual([['douluo', 'json']]);
    expect(A.P.cloudStatus().tooBig).toEqual(['yike']);
  });

  it('一次同步正文不超过 2 MB、最多 14 款：放不下的分批推；云端回 413 时拆小再推', async () => {
    const dev = new Device();
    seed(dev, { yike:{ save:{ a:noise(700_000, 11) } }, douluo:{ save:{ b:noise(700_000, 12) } }, f1:{ save:{ c:noise(700_000, 13) } } });
    await open(dev);
    const reqs = server.syncs();
    expect(reqs.length).toBe(2);
    for (const r of reqs) { expect(r.bytes).toBeLessThanOrEqual(2_097_152); expect((r.body as CloudSyncBody).push.length).toBeLessThanOrEqual(14); }
    for (const g of ['yike', 'douluo', 'f1']) expect(server.saveOf(sidOf(dev), g)).toBeDefined();

    const d2 = new Device();
    seed(d2, { yike:{ save:{ a:'1' } }, douluo:{ save:{ b:'1' } }, f1:{ save:{ c:'1' } }, nba:{ save:{ d:'1' } } });
    server.maxPushItems = 1;
    await open(d2);
    expect(server.syncs().slice(2).map(s => (s.body as CloudSyncBody).push.length)).toEqual([4, 2, 1, 1, 1, 1]);
    for (const g of ['yike', 'douluo', 'f1', 'nba']) expect(server.saveOf(sidOf(d2), g)).toBeDefined();
  });
});

// 设备 A 先玩出进度并开通云存档，设备 B 输入 A 的恢复码取回
async function twoDevices(a: Seed = { yike:{ save:{ v:'A1' }, s:100 } }){
  const da = new Device(); seed(da, a);
  const A = await open(da);
  const B = await open(new Device());
  const found = await B.run(P => P.recover(da.cloud().code));
  if (!found.ok) throw new Error('recover');
  expect(await B.run(P => P.adopt(found.saveId, found.code))).toEqual({ ok:true, restored:Object.keys(a).length });
  return { A, B, sid:sidOf(da) };
}

describe('冲突与撤销 FLOW-CLOUD-CONFLICT', () => {
  it('两台设备都改过：留累计时长更长的那份，输的一方把自己那份放进撤销槽并提示', async () => {
    const { A, B, sid } = await twoDevices();
    const replaced: unknown[] = [];
    B.P.onCloud(e => { if (e.type === 'replaced') replaced.push(e); });
    await A.play('yike', { v:'A2' }, 300);
    await A.sync();
    await B.play('yike', { v:'B2' }, 200);
    await B.sync();
    expect(server.saveOf(sid, 'yike')).toEqual({ v:'A2' });
    expect(B.save('yike')).toEqual({ v:'A2' });
    expect(B.P.peek('yike')!.seconds).toBe(300);
    expect(B.dev.idb.kv().get('undo:yike')).toMatchObject({ save:{ v:'B2' }, stat:{ seconds:200 }, why:'conflict' });
    expect(replaced).toEqual([{ type:'replaced', games:['yike'], why:'conflict' }]);
    expect(Object.keys(await B.run(P => P.listUndo()))).toEqual(['yike']);
  });

  it('两份时长相同：留改档时间更晚的那份', async () => {
    const { A, B, sid } = await twoDevices();
    await A.play('yike', { v:'A2' }, 300, 5_000);
    await A.sync();
    await B.play('yike', { v:'B2' }, 300, 6_000);
    await B.sync();
    expect(server.saveOf(sid, 'yike')).toEqual({ v:'B2' });
    expect(server.accounts.get(sid)!.games.get('yike')).toMatchObject({ rev:3, beat:2 });
    await A.sync();
    expect(A.save('yike')).toEqual({ v:'B2' });
    expect(A.dev.idb.kv().get('undo:yike')).toMatchObject({ save:{ v:'A2' }, why:'conflict' });
  });

  it('撤销：换回原来那份并强制推上云端；另一台设备拉回时先把自己那份放进撤销槽', async () => {
    const { A, B, sid } = await twoDevices();
    await A.play('yike', { v:'A2' }, 300);
    await A.sync();
    await B.play('yike', { v:'B2' }, 200);
    await B.sync();
    expect(await B.run(P => P.restoreUndo('yike'))).toBe(true);
    expect(B.save('yike')).toEqual({ v:'B2' });
    expect(B.P.peek('yike')!.seconds).toBe(200);
    expect(B.dev.idb.kv().has('undo:yike')).toBe(false);
    expect(await B.run(P => P.listUndo())).toEqual({});
    server.down = true;
    await B.sync(); // 强制推送没送到：本机已换回，下次同步再强制推
    server.down = false;
    await B.sync();
    const last = pushed().at(-1) as CloudGamePush;
    expect([last.g, last.force, last.s]).toEqual(['yike', true, 200]);
    expect(server.saveOf(sid, 'yike')).toEqual({ v:'B2' });
    expect(server.accounts.get(sid)!.games.get('yike')).toMatchObject({ rev:3, beat:2 });
    await A.sync();
    expect(A.save('yike')).toEqual({ v:'B2' });
    expect(A.dev.idb.kv().get('undo:yike')).toMatchObject({ save:{ v:'A2' }, why:'conflict' });
  });

  it('云端那份和本机内容相同：只记版本号，不进撤销槽，不提示', async () => {
    const same = { v:'same' };
    const da = new Device(); seed(da, { yike:{ save:same, s:100 } });
    await open(da);
    const db = new Device(); seed(db, { yike:{ save:same, s:10 } });
    const B = await open(db);
    const replaced: unknown[] = [];
    B.P.onCloud(e => { if (e.type === 'replaced') replaced.push(e); });
    const found = await B.run(P => P.recover(da.cloud().code));
    if (!found.ok) throw new Error('recover');
    await B.run(P => P.adopt(found.saveId, found.code));
    expect(db.idb.kv().has('undo:yike')).toBe(false);
    expect(db.cloud().games.yike.rev).toBe(1);
    expect(server.accounts.get(sidOf(da))!.games.get('yike')!.rev).toBe(1);
    expect(replaced).toEqual([]);
  });

  it('撤销槽保留 30 天：过期后不再显示、撤销不了，打开平台时删掉', async () => {
    const { A, B } = await twoDevices();
    await A.play('yike', { v:'A2' }, 300);
    await A.sync();
    await B.play('yike', { v:'B2' }, 200);
    await B.sync();
    expect(Object.keys(await B.run(P => P.listUndo()))).toEqual(['yike']);
    vi.setSystemTime(Date.now() + 29 * 86_400_000);
    expect(Object.keys(await B.run(P => P.listUndo()))).toEqual(['yike']);
    vi.setSystemTime(Date.now() + 2 * 86_400_000);
    expect(await B.run(P => P.listUndo())).toEqual({});
    B.dev.install();
    const B2 = new Tab(B.dev, await freshPlatform());
    await B2.run(P => P.boot());
    expect(B.dev.idb.kv().has('undo:yike')).toBe(false);
    expect(await B2.run(P => P.listUndo())).toEqual({});
    expect(await B2.run(P => P.restoreUndo('yike'))).toBe(false);
    expect(B.save('yike')).toEqual({ v:'A2' });
  });

  it('拉回的游戏正在本标签页里玩：先不写本机，退出后再写', async () => {
    const { A, B } = await twoDevices();
    await A.play('yike', { v:'A2' }, 300);
    await A.sync();
    B.P.holdGame('yike');
    await B.sync();
    expect(B.save('yike')).toEqual({ v:'A1' });
    B.P.releaseGame('yike');
    await B.sync();
    expect(B.save('yike')).toEqual({ v:'A2' });
    expect(B.P.peek('yike')!.seconds).toBe(300);
    expect(B.dev.idb.kv().has('undo:yike')).toBe(false);
  });
});

describe('恢复码 FLOW-RECOVER', () => {
  it('输入时去掉空格和连字符、转大写，I 与 L 当 1，O 当 0；规整后必须正好 16 位', async () => {
    new Device().install();
    const P = await freshPlatform();
    expect(P.normalizeCode(' 7k3q-9mzx iolp－2v8w ')).toBe('7K3Q9MZX101P2V8W');
    expect(P.normalizeCode('7K3Q 9MZX 101P 2V8')).toBeNull();
    expect(P.normalizeCode('7K3Q9MZX101P2V8WX')).toBeNull();
    expect(P.normalizeCode('UK3Q9MZX101P2V8W')).toBeNull();
    expect(P.formatCode('7K3Q9MZX101P2V8W')).toBe('7K3Q-9MZX-101P-2V8W');
    expect(P.recoverLink('7K3Q9MZX101P2V8W')).toBe('https://shoota.ai/#recover=7K3Q-9MZX-101P-2V8W');
  });

  it('不足 16 位不发请求；查恢复码只列云端的游戏，确认前本机不变', async () => {
    const da = new Device(); seed(da, { yike:{ save:{ v:'A1' }, s:100, last:4_000 } });
    await open(da);
    const B = await open(new Device()), n = server.sent.length;
    expect(await B.run(P => P.recover('7K3Q-9MZX-101P'))).toEqual({ ok:false, why:'format' });
    expect(server.sent.length).toBe(n);
    const code = da.cloud().code.toLowerCase().replace(/(.{4})/g, '$1-').replace(/1/g, 'l').replace(/0/g, 'o');
    const found = await B.run(P => P.recover(code));
    expect(found).toEqual({ ok:true, code:da.cloud().code, saveId:sidOf(da), games:[{ g:'yike', s:100, at:4_000 }] });
    expect(server.sent.length).toBe(n + 1);
    expect(B.dev.cloud()).toBeNull();
    expect(B.dev.idb.kv().size).toBe(0);
  });

  it('恢复码不存在、网络不通、输入的就是本机自己的恢复码', async () => {
    const da = new Device(); seed(da, { yike:{ save:{ v:'A1' } } });
    const A = await open(da);
    expect(await A.run(P => P.recover(da.cloud().code))).toEqual({ ok:false, why:'own' });
    expect(await A.run(P => P.recover('ZZZZZZZZZZZZZZZZ'))).toEqual({ ok:false, why:'unknown' });
    server.down = true;
    expect(await A.run(P => P.recover('ZZZZZZZZZZZZZZZZ'))).toEqual({ ok:false, why:'network' });
  });

  it('换设备取回：本机进度先推进这个云存档，再拉回全部；同一款留时长更长的，输的进撤销槽', async () => {
    const da = new Device(); seed(da, { yike:{ save:{ v:'A1' }, s:100 }, douluo:{ save:{ d:'A' }, s:500 } });
    await open(da);
    const db = new Device(); seed(db, { douluo:{ save:{ d:'B' }, s:50 }, nba:{ save:{ n:'B' }, s:20 } });
    const B = await open(db), old = db.cloud(), events: unknown[] = [];
    B.P.onCloud(e => { if (e.type === 'replaced') events.push(e); });
    const found = await B.run(P => P.recover(da.cloud().code));
    if (!found.ok) throw new Error('recover');
    expect(await B.run(P => P.adopt(found.saveId, found.code))).toEqual({ ok:true, restored:2 });
    expect(events).toEqual([{ type:'replaced', games:['douluo'], why:'recover' }]);
    expect(db.cloud().saveId).toBe(sidOf(da));
    expect(B.save('yike')).toEqual({ v:'A1' });
    expect(B.save('douluo')).toEqual({ d:'A' });
    expect(db.idb.kv().get('undo:douluo')).toMatchObject({ save:{ d:'B' }, why:'recover' });
    expect(server.saveOf(sidOf(da), 'nba')).toEqual({ n:'B' });
    // 旧的云存档不再同步
    const n = server.sent.filter(s => s.auth === 'Save ' + old.saveId).length;
    await B.play('nba', { n:'B2' }, 40);
    await B.sync();
    expect(server.sent.filter(s => s.auth === 'Save ' + old.saveId).length).toBe(n);
    expect(server.saveOf(sidOf(da), 'nba')).toEqual({ n:'B2' });
    expect(server.saveOf(old.saveId, 'nba')).toEqual({ n:'B' });
  });

  it('确认时云端已找不到这个云存档：提示恢复码已失效，本机换回原来的状态', async () => {
    const da = new Device(); seed(da, { yike:{ save:{ v:'A1' } } });
    await open(da);
    const db = new Device(); seed(db, { nba:{ save:{ n:'B' } } });
    const B = await open(db), before = db.cloud();
    const found = await B.run(P => P.recover(da.cloud().code));
    if (!found.ok) throw new Error('recover');
    server.accounts.delete(sidOf(da));
    expect(await B.run(P => P.adopt(found.saveId, found.code))).toEqual({ ok:false, why:'expired' });
    expect(db.cloud()).toEqual(before);
  });
});
