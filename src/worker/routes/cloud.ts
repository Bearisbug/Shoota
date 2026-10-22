// API-CLOUD-001 开通、API-CLOUD-002 恢复、API-CLOUD-003 同步，状态码与错误码见 docs/DESIGN.md §8、§14。
// 服务端只存云存档编号的 SHA-256（sid）、恢复码的 SHA-256（code_hash）和用恢复码加密的编号（sid_box），不存两者原文（INV-CLOUD-001）。
// 内部浏览器的云存档照常读写，云存档不是统计数据（§10）。
import type { Context } from 'hono';
import { and, eq, gt, inArray, lt, lte, not, sql } from 'drizzle-orm';
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import {
  SAVE_AUTH_SCHEME,
  type CloudAccountResult, type CloudGamePush, type CloudGameRow, type CloudMetaData, type CloudPushResult,
  type CloudRecoverResult, type CloudSyncResult, type SaveEncoding,
} from '../../shared/api';
import { CLOUD, PLAY } from '../../shared/limits';
import { gameById } from '../../catalog';
import type { AppEnv } from '../env';
import { cloudAccounts, cloudGames, cloudMeta } from '../db/schema';
import { GAME_ID, bjDay, enc, hex, isInt, isObj, json, problem, readJson, sha256 } from '../http';

type Db = DrizzleD1Database;

const CODE = /^[0-9A-HJKMNP-TV-Z]{16}$/; // 恢复码：16 位 Crockford base32，前端已去掉连字符并规整成大写（§9）
const AUTH = new RegExp(`^${SAVE_AUTH_SCHEME} ([0-9a-f]{32})$`); // Authorization: Save <32 位小写十六进制的云存档编号>
const CODE_BODY_BYTES = 1024; // 开通与恢复的正文只有一个恢复码
const ENCODINGS = new Set<unknown>(['json', 'gz64'] satisfies SaveEncoding[]);
const WRITE_TRIES = 3; // 条件更新没命中时重读重比的次数；每次没命中都说明别的设备刚写过

const badRequest = (req: Request) => problem(req, 400, '/errors/bad-cloud-request', '云存档请求格式不对');
const unauthorized = (req: Request) => problem(req, 401, '/errors/cloud-auth', '云存档鉴权头缺失或编号格式不对');
const tooLarge = (req: Request) => problem(req, 413, '/errors/cloud-too-large', '请求正文超过 2 MB');

const saveIdOf = (req: Request) => AUTH.exec(req.headers.get('authorization') || '')?.[1];
const digest = async (text: string) => hex(await sha256(text));
const parseCode = (b: unknown) => isObj(b) && typeof b.code === 'string' && CODE.test(b.code) ? b.code : null;

/* ───────── 编号密文：AES-GCM，密钥由恢复码经 HKDF-SHA256 派生，存 12 字节随机数加密文的 base64（§9） ───────── */
async function boxKey(code: string) {
  const ikm = await crypto.subtle.importKey('raw', enc.encode(code), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('shoota.cloud.v1'), info: enc.encode('sid_box') },
    ikm, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function seal(code: string, saveId: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await boxKey(code), enc.encode(saveId)));
  return btoa(String.fromCharCode(...iv, ...ct));
}

async function unseal(code: string, box: string) {
  const all = Uint8Array.from(atob(box), ch => ch.charCodeAt(0));
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.subarray(0, 12) }, await boxKey(code), all.subarray(12)));
}

/* ───────── API-CLOUD-001 开通 ───────── */
// 同一编号同一恢复码重发当作成功；编号已开通但恢复码不同（或恢复码撞上别的云存档）回 409，前端重新生成一对
export async function createAccount(c: Context<AppEnv>) {
  const req = c.req.raw, saveId = saveIdOf(req);
  if (!saveId) return unauthorized(req);
  const code = parseCode(await readJson(req, CODE_BODY_BYTES));
  if (!code) return badRequest(req);
  const db = drizzle(c.env.DB), sid = await digest(saveId), codeHash = await digest(code), now = Date.now();
  const ins = await db.insert(cloudAccounts).values({ sid, codeHash, sidBox: await seal(code, saveId), createdAt: now, seenDay: bjDay(now) })
    .onConflictDoNothing().run();
  if (ins.meta.changes) return json({ created: true } satisfies CloudAccountResult, 201);
  const row = await db.select({ codeHash: cloudAccounts.codeHash }).from(cloudAccounts).where(eq(cloudAccounts.sid, sid)).get();
  if (row?.codeHash === codeHash) return json({ created: false } satisfies CloudAccountResult);
  return problem(req, 409, '/errors/cloud-exists', '这个云存档编号已开通，恢复码不同');
}

/* ───────── API-CLOUD-002 恢复 ───────── */
export async function recover(c: Context<AppEnv>) {
  const req = c.req.raw;
  const code = parseCode(await readJson(req, CODE_BODY_BYTES));
  if (!code) return badRequest(req);
  const db = drizzle(c.env.DB);
  const acc = await db.select({ sid: cloudAccounts.sid, sidBox: cloudAccounts.sidBox }).from(cloudAccounts)
    .where(eq(cloudAccounts.codeHash, await digest(code))).get();
  if (!acc) return problem(req, 404, '/errors/recovery-code-unknown', '没有这个恢复码对应的云存档');
  const saveId = await unseal(code, acc.sidBox);
  const [, games] = await db.batch([
    db.update(cloudAccounts).set({ recoverN: sql`${cloudAccounts.recoverN} + 1` }).where(eq(cloudAccounts.sid, acc.sid)),
    db.select({ g: cloudGames.game, s: cloudGames.seconds, at: cloudGames.savedAt }).from(cloudGames).where(eq(cloudGames.sid, acc.sid)).orderBy(cloudGames.game),
  ]);
  return json({ saveId, games } satisfies CloudRecoverResult);
}

/* ───────── API-CLOUD-003 同步 ───────── */
// size 是上传编码后的正文字节数，单款上限按它算（RULE-CLOUD-002）；bytes 是原文字节数，只用于统计与提示
type Push = CloudGamePush & { size: number };

function parsePush(p: unknown): Push | null {
  if (!isObj(p) || typeof p.g !== 'string' || !gameById(p.g) || !isInt(p.base, 0) || !ENCODINGS.has(p.enc) || typeof p.body !== 'string' || !p.body
    || !isInt(p.bytes, 1) || !isInt(p.s, 0) || !isInt(p.last, 0) || typeof p.status !== 'string' || p.status.length > PLAY.statusMaxChars
    || !isInt(p.at, 0) || (p.force !== undefined && p.force !== true)) return null;
  const encoding = p.enc as SaveEncoding, size = enc.encode(p.body).byteLength;
  // json 编码的正文就是原文，原文字节数以服务端量的为准；gz64 只能信推送方报的原文字节数
  const bytes = encoding === 'json' ? size : p.bytes;
  return { g: p.g, base: p.base, enc: encoding, body: p.body, bytes, size, s: p.s, last: p.last, status: p.status, at: p.at, ...(p.force && { force: true }) };
}

function parseMetaData(d: unknown): CloudMetaData | null {
  if (!isObj(d) || !Array.isArray(d.wish) || !isObj(d.ach) || !isObj(d.achDefs)) return null;
  if (!d.wish.every(g => typeof g === 'string' && GAME_ID.test(g))) return null;
  const ach: CloudMetaData['ach'] = {}, achDefs: CloudMetaData['achDefs'] = {};
  for (const [g, m] of Object.entries(d.ach)) {
    if (!GAME_ID.test(g) || !isObj(m) || !Object.values(m).every(t => isInt(t, 0))) return null;
    ach[g] = m as Record<string, number>;
  }
  for (const [g, list] of Object.entries(d.achDefs)) {
    if (!GAME_ID.test(g) || !Array.isArray(list) || !list.every(a => isObj(a) && typeof a.key === 'string' && typeof a.name === 'string')) return null;
    achDefs[g] = list.map(a => ({ key: a.key, name: a.name }));
  }
  return { wish: d.wish as string[], ach, achDefs };
}

function parseSync(b: unknown) {
  if (!isObj(b) || !isObj(b.have) || !isInt(b.haveMeta, 0) || !Array.isArray(b.push) || b.push.length > CLOUD.pushMaxItems) return null;
  if (!Object.entries(b.have).every(([g, rev]) => GAME_ID.test(g) && isInt(rev, 0))) return null;
  const push: Push[] = [];
  for (const x of b.push as unknown[]) {
    const p = parsePush(x);
    if (!p || push.some(q => q.g === p.g)) return null;
    push.push(p);
  }
  let meta: { base: number; data: CloudMetaData; at: number } | undefined;
  const m = b.meta;
  if (m !== undefined) {
    if (!isObj(m) || !isInt(m.base, 0) || !isInt(m.at, 0)) return null;
    const data = parseMetaData(m.data);
    if (!data) return null;
    meta = { base: m.base, data, at: m.at };
  }
  return { have: new Map(Object.entries(b.have as Record<string, number>)), haveMeta: b.haveMeta, push, meta };
}

// 云存档还在就把最近同步日改成今天，每天最多改一次（§11 ENT-CloudAccount）
async function touchAccount(db: Db, sid: string, today: string) {
  const t = await db.update(cloudAccounts).set({ seenDay: today }).where(and(eq(cloudAccounts.sid, sid), lt(cloudAccounts.seenDay, today))).run();
  if (t.meta.changes) return true;
  return Boolean(await db.select({ sid: cloudAccounts.sid }).from(cloudAccounts).where(eq(cloudAccounts.sid, sid)).get());
}

// 一款游戏按 RULE-CLOUD-001 写入：先按 WHERE rev = base 条件更新，没命中再读出云端那份比较。
// 同一款 10 秒内只写一次；内容与云端相同时不加版本号；版本号只在条件更新命中时加 1，只增不减（INV-CLOUD-004）
async function pushGame(db: Db, sid: string, p: Push, now: number): Promise<CloudPushResult> {
  const key = and(eq(cloudGames.sid, sid), eq(cloudGames.game, p.g));
  const same = sql<number>`(${cloudGames.enc} = ${p.enc} AND ${cloudGames.body} = ${p.body})`;
  const fields = { enc: p.enc, body: p.body, bytes: p.bytes, seconds: p.s, lastPlayed: p.last, status: p.status, savedAt: p.at, updatedAt: now };
  const write = async (rev: number, beat: number | null) => (await db.update(cloudGames).set({ ...fields, rev: rev + 1, ...(beat !== null && { beatRev: beat }) })
    .where(and(key, eq(cloudGames.rev, rev), lte(cloudGames.updatedAt, now - CLOUD.sameGameGapMs), not(same))).run()).meta.changes > 0;

  if (p.size > CLOUD.gameMaxBytes) {
    const cur = await db.select({ rev: cloudGames.rev }).from(cloudGames).where(key).get();
    return { g: p.g, r: 'too-big', rev: cur?.rev ?? 0 };
  }
  if (!p.force && await write(p.base, null)) return { g: p.g, r: 'ok', rev: p.base + 1 };
  let rev = 0;
  for (let i = 0; i < WRITE_TRIES; i++) {
    const cur = await db.select({ rev: cloudGames.rev, seconds: cloudGames.seconds, savedAt: cloudGames.savedAt, updatedAt: cloudGames.updatedAt, same })
      .from(cloudGames).where(key).get();
    if (!cur) {
      const ins = await db.insert(cloudGames).values({ sid, game: p.g, ...fields, rev: 1 }).onConflictDoNothing().run();
      if (ins.meta.changes) return { g: p.g, r: 'ok', rev: 1 };
      continue;
    }
    rev = cur.rev;
    if (cur.same) return { g: p.g, r: 'ok', rev };
    const base = !p.force && p.base === rev;
    const wins = p.force || base || p.s > cur.seconds || (p.s === cur.seconds && p.at > cur.savedAt);
    if (!wins) return { g: p.g, r: 'kept-cloud', rev };
    if (now - cur.updatedAt < CLOUD.sameGameGapMs) return { g: p.g, r: 'too-soon', rev };
    if (await write(rev, base ? null : rev)) return { g: p.g, r: 'ok', rev: rev + 1 };
  }
  return { g: p.g, r: 'too-soon', rev };
}

// 回传云端比 have 新的游戏；这次写进云端的不回传，留在云端的（kept-cloud）一定回传
async function pullGames(db: Db, sid: string, have: Map<string, number>, results: CloudPushResult[]): Promise<CloudGameRow[]> {
  const kept = new Set(results.filter(r => r.r === 'kept-cloud').map(r => r.g)), written = new Set(results.filter(r => r.r === 'ok').map(r => r.g));
  const revs = await db.select({ g: cloudGames.game, rev: cloudGames.rev }).from(cloudGames).where(eq(cloudGames.sid, sid));
  const want = revs.filter(r => kept.has(r.g) || (!written.has(r.g) && r.rev > (have.get(r.g) ?? 0))).map(r => r.g);
  if (!want.length) return [];
  const rows = await db.select().from(cloudGames).where(and(eq(cloudGames.sid, sid), inArray(cloudGames.game, want))).orderBy(cloudGames.game);
  return rows.map(r => ({
    g: r.game, rev: r.rev, enc: r.enc as SaveEncoding, body: r.body, bytes: r.bytes, s: r.seconds, last: r.lastPlayed, status: r.status, at: r.savedAt,
    ...(r.beatRev !== null && { beat: r.beatRev }),
  }));
}

// 两边版本号不一致时：愿望单与成就取并集，同一成就两边都解锁过取更早的时间，成就定义按键补齐
function mergeMeta(a: CloudMetaData, b: CloudMetaData): CloudMetaData {
  const ach: CloudMetaData['ach'] = {}, achDefs: CloudMetaData['achDefs'] = { ...b.achDefs, ...a.achDefs };
  for (const g of new Set([...Object.keys(a.ach), ...Object.keys(b.ach)])) {
    const m = { ...b.ach[g], ...a.ach[g] };
    for (const [k, t] of Object.entries(b.ach[g] || {})) if (m[k] > t) m[k] = t;
    ach[g] = m;
  }
  for (const g of Object.keys(b.achDefs)) {
    const keys = new Set(achDefs[g].map(d => d.key));
    achDefs[g] = [...achDefs[g], ...b.achDefs[g].filter(d => !keys.has(d.key))];
  }
  return { wish: [...new Set([...a.wish, ...b.wish])], ach, achDefs };
}

// 元数据：版本号一致时整体替换，不一致时合并；内容不变时不加版本号。返回云端比 haveMeta 新的那份
async function syncMeta(db: Db, sid: string, m: { base: number; data: CloudMetaData; at: number } | undefined, haveMeta: number, now: number) {
  for (let i = 0; m && i < WRITE_TRIES; i++) {
    const cur = await db.select().from(cloudMeta).where(eq(cloudMeta.sid, sid)).get();
    if (!cur) {
      const ins = await db.insert(cloudMeta).values({ sid, rev: 1, data: JSON.stringify(m.data), savedAt: m.at, updatedAt: now }).onConflictDoNothing().run();
      if (ins.meta.changes) break;
      continue;
    }
    const data = JSON.stringify(m.base === cur.rev ? m.data : mergeMeta(JSON.parse(cur.data), m.data));
    if (data === cur.data) break;
    const upd = await db.update(cloudMeta).set({ rev: cur.rev + 1, data, savedAt: Math.max(cur.savedAt, m.at), updatedAt: now })
      .where(and(eq(cloudMeta.sid, sid), eq(cloudMeta.rev, cur.rev))).run();
    if (upd.meta.changes) break;
  }
  const row = await db.select().from(cloudMeta).where(and(eq(cloudMeta.sid, sid), gt(cloudMeta.rev, haveMeta))).get();
  return row && { rev: row.rev, data: JSON.parse(row.data) as CloudMetaData, at: row.savedAt };
}

export async function sync(c: Context<AppEnv>) {
  const req = c.req.raw, saveId = saveIdOf(req);
  if (!saveId) return unauthorized(req);
  if (Number(req.headers.get('content-length') || 0) > CLOUD.bodyMaxBytes) return tooLarge(req);
  const raw = await req.arrayBuffer();
  if (raw.byteLength > CLOUD.bodyMaxBytes) return tooLarge(req);
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder().decode(raw)); } catch { return badRequest(req); }
  const body = parseSync(parsed);
  if (!body) return badRequest(req);

  const db = drizzle(c.env.DB), sid = await digest(saveId), now = Date.now();
  if (!(await touchAccount(db, sid, bjDay(now)))) return problem(req, 404, '/errors/cloud-not-found', '云端没有这个云存档');
  const results: CloudPushResult[] = [];
  for (const p of body.push) results.push(await pushGame(db, sid, p, now));
  const meta = await syncMeta(db, sid, body.meta, body.haveMeta, now);
  const pull = await pullGames(db, sid, body.have, results);
  return json({ results, pull, ...(meta && { meta }), now } satisfies CloudSyncResult);
}
