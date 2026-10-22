// 单测用的假服务端：按 docs/DESIGN.md §8 API-CLOUD-001～003 与 RULE-CLOUD-001 实现云存档三个接口，另收 /api/e、/api/merge。
// 只为测平台客户端的流程，Worker 自己的实现与测试在 src/worker。
import type { CloudGamePush, CloudGameRow, CloudMetaData, CloudPushResult, CloudSyncBody, ErrorType } from '../../shared';
import { CATALOG } from '../../catalog';
import { fromBase64, gunzip, utf8Bytes } from '../codec';

interface Row extends CloudGameRow { updated: number; text: string }
interface Account { code: string; games: Map<string, Row>; meta: { rev: number; data: CloudMetaData; at: number } | null }
export interface Sent { path: string; auth: string | null; keepalive: boolean; bytes: number; body: unknown }

const GAMES = new Set(CATALOG.map(g => g.id));
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers:{ 'content-type':'application/json' } });
const problem = (status: number, type: ErrorType) =>
  new Response(JSON.stringify({ type, title:type, status, instance:'' }), { status, headers:{ 'content-type':'application/problem+json' } });
const union = <T>(a: T[], b: T[]) => [...new Set([...a, ...b])];

export class FakeCloud {
  accounts = new Map<string, Account>();
  sent: Sent[] = []; // 云存档接口收到的请求
  other: Sent[] = []; // /api/e、/api/merge 走 fetch 的请求
  down = false; // 网络不通：fetch 直接失败
  failNext: { status: number; type: ErrorType } | null = null; // 下一个云存档请求按这个出错
  maxPushItems = 14; // 超过就回 413，用来测拆小再推
  tooSoonMs = 0; // 同一款两次写入的最小间隔；默认关掉，测 too-soon 时再开
  clock = 0; // 加到 Date.now() 上，测间隔用

  fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    if (this.down) throw new TypeError('Failed to fetch');
    const path = String(input), text = typeof init.body === 'string' ? init.body : '';
    const rec: Sent = { path, auth:new Headers(init.headers).get('authorization'), keepalive:!!init.keepalive, bytes:utf8Bytes(text), body:text ? JSON.parse(text) : null };
    if (!path.startsWith('/api/cloud/')) { this.other.push(rec); return new Response(null, { status:204 }); }
    this.sent.push(rec);
    if (this.failNext) { const f = this.failNext; this.failNext = null; return problem(f.status, f.type); }
    const sid = /^Save ([0-9a-f]{32})$/.exec(rec.auth ?? '')?.[1];
    if (path === '/api/cloud/recover') return this.recover(rec.body as { code: string });
    if (!sid) return problem(401, '/errors/cloud-auth');
    if (path === '/api/cloud/account') return this.account(sid, rec.body as { code: string });
    if (path === '/api/cloud/sync') return this.sync(sid, rec);
    return new Response('not found', { status:404 });
  };

  private account(sid: string, b: { code: string }){
    if (!/^[0-9A-HJKMNP-TV-Z]{16}$/.test(b?.code)) return problem(400, '/errors/bad-cloud-request');
    const a = this.accounts.get(sid);
    if (a) return a.code === b.code ? json(200, { created:false }) : problem(409, '/errors/cloud-exists');
    this.accounts.set(sid, { code:b.code, games:new Map(), meta:null });
    return json(201, { created:true });
  }

  private recover(b: { code: string }){
    for (const [saveId, a] of this.accounts) if (a.code === b?.code) return json(200, { saveId, games:[...a.games.values()].map(r => ({ g:r.g, s:r.s, at:r.at })) });
    return problem(404, '/errors/recovery-code-unknown');
  }

  private async sync(sid: string, rec: Sent){
    const a = this.accounts.get(sid);
    if (!a) return problem(404, '/errors/cloud-not-found');
    if (rec.bytes > 2_097_152 || (rec.body as CloudSyncBody).push.length > this.maxPushItems) return problem(413, '/errors/cloud-too-large');
    const b = rec.body as CloudSyncBody, now = Date.now() + this.clock, results: CloudPushResult[] = [];
    for (const p of b.push) {
      if (!GAMES.has(p.g)) return problem(400, '/errors/bad-cloud-request');
      const text = p.enc === 'gz64' ? new TextDecoder().decode(await gunzip(fromBase64(p.body))) : p.body;
      const cur = a.games.get(p.g), rev = cur?.rev ?? 0;
      if (utf8Bytes(p.body) > 1_048_576) { results.push({ g:p.g, r:'too-big', rev }); continue; } // 按上传编码后的正文算（RULE-CLOUD-002）
      if (cur && cur.text === text) { results.push({ g:p.g, r:'ok', rev }); continue; } // 同一份内容重推：不加版本号
      const win = p.force || p.base === rev || !cur || p.s > cur.s || (p.s === cur.s && p.at > cur.at); // RULE-CLOUD-001
      if (!win) { results.push({ g:p.g, r:'kept-cloud', rev }); continue; }
      if (cur && now - cur.updated < this.tooSoonMs) { results.push({ g:p.g, r:'too-soon', rev }); continue; }
      a.games.set(p.g, this.row(p, rev + 1, cur && (p.force || p.base !== rev) ? rev : undefined, now, text));
      results.push({ g:p.g, r:'ok', rev:rev + 1 });
    }
    if (b.meta) {
      const m = a.meta;
      const data = !m || b.meta.base === m.rev ? b.meta.data : {
        wish:union(m.data.wish, b.meta.data.wish),
        ach:Object.fromEntries(union(Object.keys(m.data.ach), Object.keys(b.meta.data.ach)).map(g => [g, { ...b.meta!.data.ach[g], ...m.data.ach[g] }])),
        achDefs:{ ...m.data.achDefs, ...b.meta.data.achDefs },
      };
      if (!m || JSON.stringify(data) !== JSON.stringify(m.data)) a.meta = { rev:(m?.rev ?? 0) + 1, data, at:b.meta.at }; // 内容不变时不加版本号
    }
    // 这次写进云端的不回传，冲突时留在云端的一定回传（与 Worker 的 pullGames 相同）
    const kept = new Set(results.filter(r => r.r === 'kept-cloud').map(r => r.g)), written = new Set(results.filter(r => r.r === 'ok').map(r => r.g));
    const pull = [...a.games.values()].filter(r => kept.has(r.g) || (!written.has(r.g) && r.rev > (b.have[r.g] ?? 0))).map(({ updated: _u, text: _t, ...row }) => row);
    return json(200, { results, pull, meta:a.meta && a.meta.rev > b.haveMeta ? a.meta : undefined, now });
  }

  private row(p: CloudGamePush, rev: number, beat: number | undefined, now: number, text: string): Row {
    const r: Row = { g:p.g, rev, enc:p.enc, body:p.body, bytes:p.bytes, s:p.s, last:p.last, status:p.status, at:p.at, updated:now, text };
    if (beat !== undefined) r.beat = beat;
    return r;
  }

  // 云端某款游戏的存档原文解析后的样子
  saveOf(sid: string, g: string){ const r = this.accounts.get(sid)?.games.get(g); return r ? JSON.parse(r.text) : undefined; }
  syncs(){ return this.sent.filter(s => s.path === '/api/cloud/sync'); }
}

export function installFetch(server: FakeCloud){ Object.defineProperty(globalThis, 'fetch', { value:server.fetch, configurable:true, writable:true }); }
