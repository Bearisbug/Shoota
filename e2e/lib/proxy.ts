// 本地中转（docs/TEST.md §3「弱网与卡住」）：浏览器只连它，它再转给 wrangler dev。
// 弱网与卡住都在这里造，页面和 Service Worker 发出的请求同样经过它：
// - 延迟与限速：每个请求先等 latencyMs；所有响应共用一条 bytesPerSec 的链路，按到达顺序排队；
// - 压缩：上游没压缩的文本响应按浏览器接受的编码压缩后再限速，和线上边缘一样（线上返回 br）；
// - 游戏文件按 mode 处理：原样转发、不回首字节（每次或第一次）、发一半后停住（每次或第一次）、回 404 或 500。
// 经过它的游戏文件请求与 /api/* 上报都记下来，用例据此数请求、读启动上报；
// 「等页面不再有请求」按中转上没有在途请求算，Service Worker 的预缓存也算在内。
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import type { LaunchEvent } from '../../src/shared';
import { BASE } from './base';

export type GameFileMode = 'pass' | 'hang' | 'hang-once' | 'stall' | 'stall-once' | 'hashed-404' | '404' | '500';

// 带摘要的 /g/<游戏>-<摘要>、固定地址 /games/<游戏>，以及旧版 dd731d6 请求的 /games/<游戏>.html
export const GAME_FILE = /^\/(?:g|games)\/[^/?]+$/;
const HASHED = /^\/g\//;
const TEXT = /^(text\/|application\/(javascript|json|manifest\+json)|image\/svg)/;
const CHUNK = 2048;

export interface ApiPost { path: string; body: string; at: number }

export interface NetProxy {
  url: string;
  mode: GameFileMode;
  latencyMs: number;
  bytesPerSec: number; // 0 为不限速
  gameHits: { path: string; at: number }[];
  apiPosts: ApiPost[];
  inflight: number;
  idle(quietMs?: number, timeoutMs?: number): Promise<void>;
  close(): Promise<void>;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function readAll(s: AsyncIterable<unknown>) {
  const chunks: Buffer[] = [];
  for await (const c of s) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

export async function startProxy(opts: Partial<Pick<NetProxy, 'mode' | 'latencyMs' | 'bytesPerSec'>> = {}, upstream = BASE): Promise<NetProxy> {
  const up = new URL(upstream);
  const held = new Set<http.ServerResponse>();
  let nextFree = 0, firstDone = false, lastDone = Date.now();

  async function send(res: http.ServerResponse, buf: Buffer) {
    for (let i = 0; i < buf.length; i += CHUNK) {
      const part = buf.subarray(i, i + CHUNK);
      if (p.bytesPerSec > 0) {
        const now = Date.now();
        nextFree = Math.max(now, nextFree) + (part.length * 1000) / p.bytesPerSec;
        await sleep(nextFree - now);
      }
      if (res.destroyed) return;
      res.write(part);
    }
  }

  // 浏览器中途放弃请求（载入超时、关页面）时读写会抛 aborted，只断开这一条，不让它变成用例外的未处理错误
  const server = http.createServer((req, res) => { handle(req, res).catch(() => res.destroy()); });
  async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
    p.inflight++;
    res.once('close', () => { p.inflight--; held.delete(res); lastDone = Date.now(); });
    const path = req.url || '/', bare = path.split('?')[0];
    const body = await readAll(req);
    const isGame = req.method === 'GET' && GAME_FILE.test(bare);
    if (isGame) p.gameHits.push({ path: bare, at: Date.now() });
    if (req.method === 'POST' && bare.startsWith('/api/')) p.apiPosts.push({ path: bare, body: body.toString('utf8'), at: Date.now() });
    if (p.latencyMs) await sleep(p.latencyMs);

    const mode: GameFileMode = isGame ? p.mode : 'pass';
    // 「第一次」只作用在开中转后的第一个游戏文件请求上
    const first = isGame && !firstDone;
    if (isGame) firstDone = true;
    if (mode === 'hang' || (mode === 'hang-once' && first)) { held.add(res); return; }
    if (mode === '404' || mode === '500' || (mode === 'hashed-404' && HASHED.test(bare))) {
      res.writeHead(mode === '500' ? 500 : 404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      res.end('not served');
      return;
    }
    const half = mode === 'stall' || (mode === 'stall-once' && first);
    const accept = String(req.headers['accept-encoding'] || '');
    const headers = { ...req.headers, host: up.host, ...(half && { 'accept-encoding': 'identity' }) };

    const upReq = http.request({ hostname: up.hostname, port: up.port, path, method: req.method, headers }, ur => { relay(ur).catch(() => res.destroy()); });
    async function relay(ur: http.IncomingMessage) {
      if (half) {
        const full = await readAll(ur);
        res.writeHead(ur.statusCode ?? 200, { 'content-type': ur.headers['content-type'] ?? 'text/html; charset=utf-8', 'content-length': full.length, 'cache-control': 'no-store' });
        await send(res, full.subarray(0, full.length >> 1));
        held.add(res); // 停住：不结束，也不关连接
        return;
      }
      const type = String(ur.headers['content-type'] || '');
      const enc = /\bbr\b/.test(accept) ? 'br' : /\bgzip\b/.test(accept) ? 'gzip' : '';
      if (enc && !ur.headers['content-encoding'] && TEXT.test(type) && ur.statusCode !== 204 && ur.statusCode !== 304) {
        const raw = await readAll(ur);
        const packed = enc === 'br' ? brotliCompressSync(raw) : gzipSync(raw);
        const out: http.OutgoingHttpHeaders = { ...ur.headers, 'content-encoding': enc, 'content-length': packed.length, vary: 'accept-encoding' };
        delete out['transfer-encoding'];
        res.writeHead(ur.statusCode ?? 200, out);
        await send(res, packed);
        res.end();
        return;
      }
      res.writeHead(ur.statusCode ?? 502, ur.headers);
      for await (const c of ur) await send(res, c as Buffer);
      res.end();
    }
    upReq.on('error', () => res.destroy());
    upReq.end(body);
  }

  const p: NetProxy = {
    url: '', mode: 'pass', latencyMs: 0, bytesPerSec: 0, ...opts, gameHits: [], apiPosts: [], inflight: 0,
    // 停住的游戏文件请求不算在途
    async idle(quietMs = 1000, timeoutMs = 120_000) {
      const end = Date.now() + timeoutMs;
      while (p.inflight > held.size || Date.now() - lastDone < quietMs) {
        if (Date.now() > end) throw new Error(`${timeoutMs} 毫秒内中转上一直有请求`);
        await sleep(100);
      }
    },
    async close() {
      for (const r of held) r.destroy();
      server.closeAllConnections();
      await new Promise(r => server.close(r));
    },
  };
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  p.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return p;
}

// 弱网：延迟 400 毫秒、50 KB/s（§15）
export const WEAK = { latencyMs: 400, bytesPerSec: 50 * 1024 };

// 经中转发出的启动上报，按发出顺序展开
export const launchEvents = (p: NetProxy): LaunchEvent[] =>
  p.apiPosts.filter(x => x.path === '/api/launch').flatMap(x => (JSON.parse(x.body) as { ev: LaunchEvent[] }).ev);

export const syncPosts = (p: NetProxy) => p.apiPosts.filter(x => x.path === '/api/cloud/sync');

// 某款游戏的游戏文件请求
export const hitsOf = (p: NetProxy, gid: string) =>
  p.gameHits.filter(h => h.path === `/games/${gid}` || h.path === `/games/${gid}.html` || h.path.startsWith(`/g/${gid}-`));
