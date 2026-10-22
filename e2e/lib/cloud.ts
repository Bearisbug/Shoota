// 云存档用例共用（docs/TEST.md §3「用 curl 调云存档接口」「云存档的编号摘要」）：直接调接口开通与推送、按编号摘要查表、
// 拼浏览器里的 changju.cloud.v1。编号与恢复码的格式取自 src/shared，内容摘要与平台用同一个函数。
import { createHash, randomBytes } from 'node:crypto';
import type { APIRequestContext, Page, Response } from '@playwright/test';
import { SAVE_AUTH_SCHEME, type CloudGamePush, type CloudLocalState, type CloudSyncBody, type CloudSyncResult, type GameSave } from '../../src/shared';
import { digest } from '../../src/platform/codec';
import { d1 } from './d1';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const newSaveId = () => randomBytes(16).toString('hex');
export const newCode = () => Array.from(randomBytes(16), b => ALPHABET[b & 31]).join('');
export const sidOf = (saveId: string) => createHash('sha256').update(saveId).digest('hex');
export const auth = (saveId: string) => ({ authorization: `${SAVE_AUTH_SCHEME} ${saveId}` });
export const saveHash = (save: GameSave) => digest(JSON.stringify(save));
export const dashed = (code: string) => code.match(/.{4}/g)!.join('-');
export const CODE_DASHED = /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/;

export function openCloud(request: APIRequestContext, saveId: string, code: string) {
  return request.post('/api/cloud/account', { headers: auth(saveId), data: { code } });
}

// 一款游戏的推送项：正文是存档 JSON 原文
export function pushItem(g: string, save: GameSave, o: Partial<CloudGamePush> = {}): CloudGamePush {
  const body = JSON.stringify(save);
  return { g, base: 0, enc: 'json', body, bytes: Buffer.byteLength(body), s: 300, last: Date.now(), status: '', at: Date.now(), ...o };
}

export async function sync(request: APIRequestContext, saveId: string, body: Partial<CloudSyncBody>) {
  const res = await request.post('/api/cloud/sync', { headers: auth(saveId), data: { have: {}, haveMeta: 0, push: [], ...body } });
  return { status: res.status(), json: await res.json() as CloudSyncResult };
}

// 跳过同一款 10 秒的写入间隔（docs/TEST.md §3），代替真等
export const skipGap = (saveId: string) => { d1(`UPDATE cloud_games SET updated_at = updated_at - 11000 WHERE sid = '${sidOf(saveId)}'`); };

export interface CloudGameDb { game: string; rev: number; body: string; bytes: number; seconds: number; saved_at: number; updated_at: number; beat_rev: number | null }
export const cloudGame = (saveId: string, g: string) =>
  d1<CloudGameDb>(`SELECT game, rev, body, bytes, seconds, saved_at, updated_at, beat_rev FROM cloud_games WHERE sid = '${sidOf(saveId)}' AND game = '${g}'`)[0];
export const cloudAccount = (saveId: string) =>
  d1<{ sid: string; seen_day: string; recover_n: number }>(`SELECT sid, seen_day, recover_n FROM cloud_accounts WHERE sid = '${sidOf(saveId)}'`)[0];

// 浏览器里 changju.cloud.v1 的内容；games 写成「上次在这个版本上对齐、存档内容是 save」
export function localCloud(saveId: string, code: string, games: Record<string, { rev: number; save?: GameSave; hash?: string }> = {}): CloudLocalState {
  return {
    v: 1, saveId, code, meta: { rev: 0, hash: '' }, lastSyncAt: 0, tooBig: [],
    games: Object.fromEntries(Object.entries(games).map(([g, x]) => [g, { rev: x.rev, hash: x.hash ?? (x.save ? saveHash(x.save) : ''), s: 0, at: Date.now() }])),
  };
}

// 一克之差的存档：第 n 关，另带一个键让每份内容都不同
export const yikeSave = (level: number, tag = ''): GameSave => ({
  'yikezhicha.v2': JSON.stringify({ level, attempts: { 1: 1 }, best: {}, sound: true, intro: true }),
  ...(tag && { 'e2e.tag': tag }),
});

// 页面发出的云存档请求与响应，按发出顺序
export interface CloudCall { path: string; status: number; auth: string | undefined; req: unknown; res: unknown; at: number }
export function recordCloud(page: Page) {
  const calls: CloudCall[] = [];
  page.on('response', async (r: Response) => {
    const u = new URL(r.url());
    if (!u.pathname.startsWith('/api/cloud/')) return;
    const req = r.request();
    let res: unknown = null;
    try { res = await r.json(); } catch { /* 无正文 */ }
    calls.push({ path: u.pathname, status: r.status(), auth: (await req.allHeaders()).authorization, req: req.postDataJSON(), res, at: Date.now() });
  });
  return calls;
}

export const syncCalls = (calls: CloudCall[], since = 0) => calls.filter(c => c.path === '/api/cloud/sync' && c.at >= since);
export const pushedGames = (c: CloudCall) => ((c.req as CloudSyncBody | null)?.push ?? []).map(p => p.g);
export const resultOf = (c: CloudCall, g: string) => (c.res as CloudSyncResult | null)?.results?.find(r => r.g === g);
