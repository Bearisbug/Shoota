import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Device, freshPlatform, type Platform } from './testing/env';

// 旧版 public/index.html（dd731d6）里的 gzip、encodeSaves、decodeSaves，一字未改，当作对照实现
const OLD = String.raw`
const gzip = (bytes, Stream) => new Response(new Blob([bytes]).stream().pipeThrough(new Stream('gzip'))).arrayBuffer().then(b => new Uint8Array(b));
async function encodeSaves(d){
  let bytes = new TextEncoder().encode(JSON.stringify(d)), tag = 'CJ0';
  if (window.CompressionStream) { bytes = await gzip(bytes, CompressionStream); tag = 'CJ1'; }
  let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return tag + btoa(bin);
}
async function decodeSaves(code){
  code = code.replace(/\s+/g, '');
  const tag = code.slice(0, 3);
  if (tag === 'CJ1' && !window.DecompressionStream) throw new Error('old');
  if (tag !== 'CJ0' && tag !== 'CJ1') throw new Error('bad');
  let bytes = Uint8Array.from(atob(code.slice(3)), c => c.charCodeAt(0));
  if (tag === 'CJ1') bytes = await gzip(bytes, DecompressionStream);
  const d = JSON.parse(new TextDecoder().decode(bytes));
  if (!d || d.v !== 1 || !d.saves || typeof d.saves !== 'object') throw new Error('bad');
  return d;
}`;
type Codec = { encodeSaves(d: unknown): Promise<string>; decodeSaves(c: string): Promise<unknown> };
const oldCodec = (win: object): Codec =>
  new Function('window', 'CompressionStream', 'DecompressionStream', OLD + '\nreturn { encodeSaves, decodeSaves };')(win, globalThis.CompressionStream, globalThis.DecompressionStream);

const PACK = {
  v:1 as const, at:1761100000000,
  saves:{
    yike:{ 'yikezhicha.v2':JSON.stringify({ level:5, attempts:{ 1:1, 2:2 }, best:{ 1:3 }, sound:true, intro:true }) },
    douluo:{ 'douluo-wanxiang-v2':'{"name":"苏夜","fame":12,"note":"魂环\u2028换行"}' },
  },
  stats:{
    yike:{ seconds:600, last:1761099000000, ach:{}, status:'第 5 关' },
    douluo:{ seconds:65, last:1761098000000, ach:{ first:1761097000000 }, status:'' },
  },
  wish:['f1', 'lol'],
  achDefs:{ douluo:[{ key:'first', name:'初入斗罗' }] },
};
// 2026-10-22 用上面的旧版 encodeSaves 对 PACK 生成（Node 26.5）
const OLD_CJ1 = 'CJ1H4sIAAAAAAAAE1VQTUvDQBD9K2XOqXQjaW3O/gu3hzXZmNB0V7qb1BoCIhQEv272ogdFwUPFg2f/jJCm/gsnX8TsZebNm3kz+xKIwSYGMI1hNCRkUD8DFIu5AjuBZTDlTTz3A8dne7EJNiQUQh7zkIJtGRQlNJ+daoUQGUILXQomRjPF5Jgr3VL7RUnJSLgI9DziCAOh57KGKaQGuDIKI1msrrL+gomzgImTfrNfsBnHCQq76/vs9ZECynhVjZiYC6kr/vfjMr/7/Ll4396+7J5vKOAC3KA0050/Ku5I4WJpWFgQMlX7MhiPG1+Y42NnPRxhK+SbTc/qZauv7tGtltWVOuhKgRfMW3JUkf/1y1MXgcLmI/AIoJoMYVLOH3JPtQ5hQwJTvsShStQoLUKYXT1lq7ftwzr/XkM6SdM/yEuLp/oBAAA=';
const OLD_CJ0 = 'CJ0eyJ2IjoxLCJhdCI6MTc2MTEwMDAwMDAwMCwic2F2ZXMiOnsieWlrZSI6eyJ5aWtlemhpY2hhLnYyIjoie1wibGV2ZWxcIjo1LFwiYXR0ZW1wdHNcIjp7XCIxXCI6MSxcIjJcIjoyfSxcImJlc3RcIjp7XCIxXCI6M30sXCJzb3VuZFwiOnRydWUsXCJpbnRyb1wiOnRydWV9In0sImRvdWx1byI6eyJkb3VsdW8td2FueGlhbmctdjIiOiJ7XCJuYW1lXCI6XCLoi4/lpJxcIixcImZhbWVcIjoxMixcIm5vdGVcIjpcIumtgueOr+KAqOaNouihjFwifSJ9fSwic3RhdHMiOnsieWlrZSI6eyJzZWNvbmRzIjo2MDAsImxhc3QiOjE3NjEwOTkwMDAwMDAsImFjaCI6e30sInN0YXR1cyI6IuesrCA1IOWFsyJ9LCJkb3VsdW8iOnsic2Vjb25kcyI6NjUsImxhc3QiOjE3NjEwOTgwMDAwMDAsImFjaCI6eyJmaXJzdCI6MTc2MTA5NzAwMDAwMH0sInN0YXR1cyI6IiJ9fSwid2lzaCI6WyJmMSIsImxvbCJdLCJhY2hEZWZzIjp7ImRvdWx1byI6W3sia2V5IjoiZmlyc3QiLCJuYW1lIjoi5Yid5YWl5paX572XIn1dfX0=';

let dev: Device, P: Platform;
beforeEach(async () => { dev = new Device().install(); P = await freshPlatform(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('存档码与旧版逐字节兼容', () => {
  it('CJ1：新旧 encodeSaves 对同一份进度产出同一串，新版解得开旧版样本', async () => {
    const old = oldCodec(globalThis);
    expect(await P.encodeSaves(PACK)).toBe(await old.encodeSaves(PACK));
    expect(await P.decodeSaves(OLD_CJ1)).toEqual(PACK);
    expect(await old.decodeSaves(await P.encodeSaves(PACK))).toEqual(PACK);
  });

  it('CJ0：没有 CompressionStream 时产出与旧版样本一字不差', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    expect(await P.encodeSaves(PACK)).toBe(OLD_CJ0);
    expect(await oldCodec({}).encodeSaves(PACK)).toBe(OLD_CJ0);
    expect(await P.decodeSaves(OLD_CJ0)).toEqual(PACK);
  });

  it('解码前去掉所有空白，读不出时报 bad，浏览器太旧解不了 CJ1 时报 old', async () => {
    const spaced = OLD_CJ1.replace(/(.{40})/g, '$1\n  ');
    expect(await P.decodeSaves(spaced)).toEqual(PACK);
    await expect(P.decodeSaves('hello')).rejects.toThrow('bad');
    await expect(P.decodeSaves('CJ0' + btoa(JSON.stringify({ v:2, saves:{} })))).rejects.toThrow('bad');
    await expect(P.decodeSaves('CJ0' + btoa('{"v":1}'))).rejects.toThrow('bad');
    vi.stubGlobal('DecompressionStream', undefined);
    await expect(P.decodeSaves(OLD_CJ1)).rejects.toThrow('old');
    expect(await P.decodeSaves(OLD_CJ0)).toEqual(PACK);
  });
});

describe('packSaves 与 applySaves', () => {
  const oldMeta = {
    session:{ email:'local', at:1 }, users:{ local:{ nickname:'玩家', created:1 } },
    stats:{ local:{ yike:PACK.stats.yike, douluo:PACK.stats.douluo, f1:{ seconds:30, last:5, ach:{}, status:'' }, lol:{ seconds:0, last:9, ach:{}, status:'' } } },
    wish:{ local:['f1', 'lol'] }, achDefs:PACK.achDefs, sendLog:{}, vid:'a'.repeat(32),
  };
  beforeEach(() => {
    dev.storage.setItem('changju.meta.v1', JSON.stringify(oldMeta));
    dev.idb.seed('local|yike', PACK.saves.yike);
    dev.idb.seed('local|douluo', PACK.saves.douluo);
    dev.idb.seed('local|lol', {}); // 只打开过、没存档也没时长的不收
  });

  it('打包范围、字段顺序与旧版相同：有存档或玩过的都收，只有时长的存档记 {}', async () => {
    const d = await P.packSaves();
    expect(Object.keys(d)).toEqual(['v', 'at', 'saves', 'stats', 'wish', 'achDefs']);
    expect(d.saves).toEqual({ f1:{}, douluo:PACK.saves.douluo, yike:PACK.saves.yike });
    expect(Object.keys(d.saves)).toEqual(['f1', 'douluo', 'yike']); // 目录顺序
    expect(d.stats).toEqual({ f1:oldMeta.stats.local.f1, douluo:PACK.stats.douluo, yike:PACK.stats.yike });
    expect(d.wish).toEqual(['f1', 'lol']);
    expect(d.achDefs).toEqual(PACK.achDefs);
  });

  it('存档库读不出时打包报错，不打出一份空存档', async () => {
    dev.idb.knobs.failOpen = true;
    await expect(P.packSaves()).rejects.toBeInstanceOf(P.SaveStoreError);
  });

  it('导入直接替换目录里有的游戏，不比时长；愿望单取并集并滤掉目录外的；缺统计时补一条', async () => {
    const n = await P.applySaves({ v:1, at:77, saves:{ yike:{ k:'new' }, nba:{ x:'1' }, ghost:{ y:'2' } },
      stats:{ yike:{ seconds:5, last:6, ach:{}, status:'' } }, wish:['nba', 'ghost'], achDefs:{ nba:[{ key:'a', name:'A' }] } });
    expect(n).toBe(2);
    expect(dev.idb.kv().get('local|yike')).toEqual({ k:'new' });
    expect(dev.idb.kv().get('local|nba')).toEqual({ x:'1' });
    expect(dev.idb.kv().has('local|ghost')).toBe(false);
    const m = dev.meta();
    expect(m.stats.local.yike).toEqual({ seconds:5, last:6, ach:{}, status:'' });
    expect(m.stats.local.nba).toEqual({ seconds:0, last:77, ach:{}, status:'' });
    expect(m.wish.local).toEqual(['f1', 'lol', 'nba']);
    expect(m.achDefs.nba).toEqual([{ key:'a', name:'A' }]);
    expect(m.sendLog).toEqual({});
  });

  it('写不进存档库时导入报错，元数据不动', async () => {
    dev.idb.knobs.failPut = true;
    await expect(P.applySaves({ v:1, at:1, saves:{ yike:{ k:'x' } }, stats:{}, wish:['nba'], achDefs:{} })).rejects.toBeInstanceOf(P.SaveStoreError);
    expect(dev.idb.kv().get('local|yike')).toEqual(PACK.saves.yike);
    expect(dev.meta().wish.local).toEqual(['f1', 'lol']);
  });
});
