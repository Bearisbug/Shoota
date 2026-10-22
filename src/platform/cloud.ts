// 云存档客户端（docs/DESIGN.md FLOW-CLOUD-FIRST、FLOW-CLOUD-SYNC、FLOW-CLOUD-CONFLICT、FLOW-RECOVER，RULE-CLOUD-001、RULE-CLOUD-002，§15、§16）。
// 本机状态在 changju.cloud.v1；同步时机：打开平台时、平台页面开着时每分钟、退出游戏与页面隐藏时，离线时跳过、联网后立刻补一次。
// 改过没有按内容摘要判断，所以「离线排队」不用另存队列：没推上去的改动下次同步时仍是改过的。
import { CLOUD, PLAY, saveKey, type CloudGamePush, type CloudGameRow, type CloudLocalState, type CloudMetaData, type CloudMetaPush,
  type CloudRecoverResult, type CloudSyncBody, type GameSave, type UndoSlot } from '../shared';
import { CATALOG, gameById } from '../catalog';
import { canGunzip, canGzip, digest, fromBase64, gunzip, gzip, toBase64, utf8, utf8Bytes } from './codec';
import { createAccountApi, recoverApi, syncApi, type CloudFail } from './cloudApi';
import { FORCE_PUSH, onSyncRequest, readCloud, withCloudLock, writeCloud } from './cloudState';
import { anyHeld, isHeld, putMany, queueGame, readFailedThisTime, readSaves } from './idb';
import { meta, peek, persist, player, stat, wishList } from './meta';
import { newCode, newSaveId, normalizeCode } from './recovery';
import { keepUndo } from './undo';

/* ───────── 状态与通知 ───────── */
export type CloudPhase =
  | 'off' // 还没开通
  | 'idle' // 上次同步成功，或还没轮到
  | 'syncing'
  | 'offline' // 浏览器离线，联网后立刻补一次
  | 'failed' // 这一次没同步上（网络、超时、请求被拒、存档库读不出），下一分钟再来
  | 'unavailable'; // 鉴权失败，这个页面不再同步，存档页提示云存档不可用

// tooBig：按上传编码后的正文超过 1 MB、只存在本机的游戏（RULE-CLOUD-002）
export interface CloudStatus { phase: CloudPhase; code: string | null; lastSyncAt: number; tooBig: string[] }

export type CloudEvent =
  | { type: 'status'; status: CloudStatus }
  | { type: 'created'; code: string } // 第一次在云端开通成功：回商店时提示一次恢复码（FLOW-CLOUD-FIRST S4）
  | { type: 'replaced'; games: string[]; why: UndoSlot['why'] }; // 本机存档换成了云端那份，原来那份在撤销槽（FLOW-CLOUD-CONFLICT S3）

const listeners = new Set<(e: CloudEvent) => void>();
export function onCloud(fn: (e: CloudEvent) => void){ listeners.add(fn); return () => { listeners.delete(fn); }; }
const emit = (e: CloudEvent) => listeners.forEach(f => { try { f(e); } catch (x) {} });

let phase: CloudPhase = 'idle', stopped = false;
export function cloudStatus(): CloudStatus {
  const st = readCloud();
  return { phase:st ? phase : 'off', code:st?.code ?? null, lastSyncAt:st?.lastSyncAt ?? 0, tooBig:st?.tooBig ?? [] };
}
function setPhase(p: CloudPhase){ phase = p; emit({ type:'status', status:cloudStatus() }); }
function finish(fail: Fail | null){
  if (fail === 'auth') { stopped = true; setPhase('unavailable'); return; }
  setPhase(fail ? 'failed' : 'idle');
}

type Fail = CloudFail | 'store'; // store：本机存档库读不出或本地存储写不进
const ids = () => CATALOG.map(g => g.id);
const blankState = (saveId: string, code: string): CloudLocalState => ({ v:1, saveId, code, games:{}, meta:{ rev:0, hash:'' }, lastSyncAt:0, tooBig:[] });
const int = (n: unknown) => Math.max(0, Math.floor(Number(n) || 0));

/* ───────── FLOW-CLOUD-FIRST：生成编号与恢复码、云端开通 ───────── */
// 在 shoota-cloud 锁里调用：本机有进度、存档库读得出、本地存储写得进时才生成编号与恢复码；
// 两个标签页同时开通时，后拿到锁的那个先重读本机键，已有就用它的
async function ensureCloud(): Promise<CloudLocalState | null> {
  const cur = readCloud(); if (cur) return cur;
  let saves: Record<string, GameSave>;
  try { saves = await readSaves(ids()); } catch (e) { return null; }
  if (!Object.values(saves).some(s => Object.keys(s).length)) return null; // 只打开过游戏、存档为空：等真有进度
  const st = blankState(newSaveId(), newCode());
  return writeCloud(st) ? st : null;
}

// 同一编号同一恢复码已开通过也算成功；编号已被开通但恢复码不同（409）时重新生成一对再开通。
// 第一次开通成功时让商店提示一次恢复码；到期删除后用原编号重新开通的不再提示
export async function createAccount(st: CloudLocalState): Promise<{ ok: true; st: CloudLocalState } | { ok: false; fail: Fail }> {
  for (let i = 0; i < 3; i++) {
    const r = await createAccountApi(st.saveId, st.code);
    if (r.ok) { if (r.data.created && !st.lastSyncAt) emit({ type:'created', code:st.code }); return { ok:true, st }; }
    if (r.fail !== 'exists') return r;
    st = { ...st, saveId:newSaveId(), code:newCode() };
    if (!writeCloud(st)) return { ok:false, fail:'store' };
  }
  return { ok:false, fail:'exists' };
}

/* ───────── FLOW-CLOUD-SYNC S1：找出改过的游戏 ───────── */
export interface DirtyGame { g: string; hash: string; item: CloudGamePush; size: number } // size：这一项序列化后占同步正文的字节数

// 存档内容变过，或只多了游玩秒数，都算改过：云端秒数落后会让 RULE-CLOUD-001 判错。
// 没有进度的不推；这次读档失败过的不推（RULE-LAUNCH-001）；按上传编码后的正文超过 1 MB 的不推，记进 tooBig（RULE-CLOUD-002）
export async function dirtyGames(st: CloudLocalState, saves: Record<string, GameSave>): Promise<{ dirty: DirtyGame[]; tooBig: string[] }> {
  const dirty: DirtyGame[] = [], tooBig: string[] = [];
  for (const g of ids()) {
    const ls = saves[g];
    if (!ls || !Object.keys(ls).length || readFailedThisTime(g)) continue;
    const json = JSON.stringify(ls), hash = digest(json), prev = st.games[g], force = prev?.hash === FORCE_PUSH;
    if (!force && prev?.hash === hash && int(peek(g)?.seconds) <= int(prev.s)) continue;
    const item = await toPush(g, json, prev?.rev ?? 0, force);
    if (utf8Bytes(item.body) > CLOUD.gameMaxBytes) { tooBig.push(g); continue; }
    dirty.push({ g, hash, item, size:utf8Bytes(JSON.stringify(item)) });
  }
  return { dirty, tooBig };
}

// 原文超过 4 KB 时正文是 gzip 后 base64，否则是原文；浏览器不支持压缩时一律原文
async function toPush(g: string, json: string, base: number, force: boolean): Promise<CloudGamePush> {
  const s = peek(g), bytes = utf8Bytes(json), gz = bytes > CLOUD.gzipOverBytes && canGzip();
  const item: CloudGamePush = { g, base, enc:gz ? 'gz64' : 'json', body:gz ? toBase64(await gzip(utf8(json))) : json, bytes,
    s:int(s?.seconds), last:int(s?.last), status:String(s?.status ?? '').slice(0, PLAY.statusMaxChars), at:int(s?.last) || Date.now() };
  if (force) item.force = true;
  return item;
}

/* ───────── 元数据：愿望单、各游戏成就解锁时间、成就定义 ───────── */
function localMetaData(): CloudMetaData {
  const m = meta(), stats = m.stats[player()] || {}, ach: CloudMetaData['ach'] = {}, achDefs: CloudMetaData['achDefs'] = {};
  for (const g of ids()) {
    const a = stats[g]?.ach; if (a && Object.keys(a).length) ach[g] = a;
    if (m.achDefs[g]) achDefs[g] = m.achDefs[g];
  }
  return { wish:wishList().filter(id => gameById(id)), ach, achDefs };
}
const metaDigest = () => digest(JSON.stringify(localMetaData()));
function applyMeta(data: CloudMetaData){
  const m = meta();
  m.wish[player()] = (data.wish || []).filter(id => gameById(id));
  for (const [g, a] of Object.entries(data.ach || {})) if (gameById(g) && a) { const s = stat(g)!; s.ach = { ...a, ...s.ach }; }
  for (const [g, defs] of Object.entries(data.achDefs || {})) if (gameById(g) && Array.isArray(defs)) m.achDefs[g] = defs;
  persist();
}

/* ───────── FLOW-CLOUD-SYNC S4、FLOW-CLOUD-CONFLICT S2：把拉回的一款写进本机 ───────── */
async function decodeRow(row: CloudGameRow): Promise<{ save: GameSave; hash: string } | null> {
  try {
    if (row.enc === 'gz64' && !canGunzip()) return null;
    const text = row.enc === 'gz64' ? new TextDecoder().decode(await gunzip(fromBase64(row.body))) : row.body;
    const save = JSON.parse(text);
    if (!save || typeof save !== 'object' || Array.isArray(save)) return null;
    return { save, hash:digest(JSON.stringify(save)) };
  } catch (e) { return null; }
}

export type PullOutcome =
  | 'skipped' // 没写：正在本标签页里玩、本机改过还没推上去、读写存档库失败或正文读不出，版本号不更新，下次重拉
  | 'same' // 内容和本机相同，只记版本号，不进撤销槽，不提示
  | 'written' // 本机这款没改过，直接换成云端那份
  | 'replaced'; // 本机那份进了撤销槽

// lost：这次推的这一款冲突输了（kept-cloud）
export async function applyPull(st: CloudLocalState, row: CloudGameRow, o: { lost: boolean; why: UndoSlot['why'] }): Promise<PullOutcome> {
  if (!gameById(row.g)) return 'skipped';
  const got = await decodeRow(row);
  if (!got) return 'skipped';
  return queueGame(row.g, async (): Promise<PullOutcome> => {
    if (isHeld(row.g)) return 'skipped'; // 退出那款游戏后的下一次同步再写
    let cur: GameSave | undefined;
    try { cur = (await readSaves([row.g]))[row.g]; } catch (e) { return 'skipped'; }
    const curJson = cur && Object.keys(cur).length ? JSON.stringify(cur) : null, prev = st.games[row.g];
    const mark = () => { st.games[row.g] = { rev:row.rev, hash:got.hash, s:int(row.s), at:Date.now() }; };
    if (curJson !== null && digest(curJson) === got.hash) { mark(); return 'same'; }
    const dirty = curJson !== null && prev?.hash !== digest(curJson);
    if (dirty && !o.lost) return 'skipped'; // 本机又改过：下次推送再按规则比一次
    // 输了的一份进撤销槽；本机没改过、但本机那个版本被别的设备冲突胜出换掉时也进
    const keep = curJson !== null && (o.lost || (row.beat !== undefined && row.beat === prev?.rev));
    const ok = keep ? await keepUndo(row.g, cur!, o.why, got.save) : await putMany([[saveKey(row.g, player()), got.save]]).then(() => true, () => false);
    if (!ok) return 'skipped';
    const s = stat(row.g)!; s.seconds = int(row.s); s.last = int(row.last); s.status = String(row.status ?? ''); persist();
    mark();
    return keep ? 'replaced' : 'written';
  });
}

/* ───────── FLOW-CLOUD-SYNC S2、S3：推送并拉回 ───────── */
type Round = { ok: true; applied: number } | { ok: false; fail: Fail };

// keepalive：页面隐藏时只发一次，正文不超过 60 KB，放不下的游戏下次再推。quiet：没有要推的就不发请求（游戏中的每分钟同步）
async function pushPull(st: CloudLocalState, o: { keepalive: boolean; quiet: boolean; why: UndoSlot['why'] }): Promise<Round> {
  let saves: Record<string, GameSave>;
  try { saves = await readSaves(ids()); } catch (e) { return { ok:false, fail:'store' }; }
  const found = await dirtyGames(st, saves);
  st.tooBig = found.tooBig;
  writeCloud(st); // 这次不发请求时面板也要马上标出只存在本机的游戏（RULE-CLOUD-002）
  const metaData = localMetaData(), metaHash = digest(JSON.stringify(metaData)), metaClean = metaHash === st.meta.hash;
  let metaPending = !metaClean;
  if ((o.keepalive || o.quiet) && !found.dirty.length && !metaPending) return { ok:true, applied:0 };
  const queue = found.dirty;
  const limit = o.keepalive ? CLOUD.keepaliveMaxBytes : CLOUD.bodyMaxBytes, replaced: string[] = [];
  let applied = 0, maxItems: number = CLOUD.pushMaxItems;
  for (let first = true; ; first = false) {
    const have: Record<string, number> = {};
    for (const [g, v] of Object.entries(st.games)) if (gameById(g) && v.rev > 0) have[g] = v.rev;
    const body: CloudSyncBody = { have, haveMeta:st.meta.rev, push:[] };
    let size = utf8Bytes(JSON.stringify(body));
    if (metaPending) {
      const mp: CloudMetaPush = { base:st.meta.rev, data:metaData, at:Date.now() }, n = utf8Bytes(JSON.stringify(mp)) + 8;
      if (size + n <= limit) { body.meta = mp; size += n; }
    }
    const batch: typeof queue = [];
    for (let i = 0; i < queue.length && batch.length < maxItems;) {
      const n = queue[i].size + (batch.length ? 1 : 0);
      if (size + n <= limit) { size += n; batch.push(...queue.splice(i, 1)); } else i++;
    }
    if ((!first || o.keepalive) && !batch.length && !body.meta) break; // 页面隐藏时一款都放不下就不发
    body.push = batch.map(b => b.item);
    const r = await syncApi(st.saveId, JSON.stringify(body), o.keepalive);
    if (!r.ok) {
      if (r.fail !== 'too-large' || o.keepalive) return { ok:false, fail:r.fail };
      if (batch.length > 1) { queue.unshift(...batch); maxItems = Math.ceil(batch.length / 2); continue; } // 拆小再推
      if (!batch.length) metaPending = false; // 只剩元数据还过大：这次不推元数据
      continue; // 只剩一款还过大：这款这次不推
    }
    const res = r.data, now = Date.now(), lost = new Set<string>(), sent = new Map(batch.map(b => [b.g, b]));
    for (const x of res.results || []) {
      const d = sent.get(x.g); if (!d) continue;
      if (x.r === 'ok') st.games[x.g] = { rev:x.rev, hash:d.hash, s:d.item.s, at:now };
      else if (x.r === 'kept-cloud') lost.add(x.g);
      else if (x.r === 'too-big' && !st.tooBig.includes(x.g)) st.tooBig.push(x.g);
      // too-soon：同一款 10 秒内写过，下次再推
    }
    for (const row of res.pull || []) {
      const out = await applyPull(st, row, { lost:lost.has(row.g), why:o.why });
      if (out !== 'skipped') applied++;
      if (out === 'replaced') replaced.push(row.g);
    }
    // 云端元数据：这次推了，或本机没改过时才写进本机；本机在请求途中又改过就留到下次推
    if (res.meta && (body.meta || metaClean) && metaDigest() === metaHash) { applyMeta(res.meta.data); st.meta = { rev:res.meta.rev, hash:metaDigest() }; }
    if (body.meta) metaPending = false;
    st.lastSyncAt = now;
    writeCloud(st);
    if (o.keepalive || !queue.length) break;
  }
  if (replaced.length) emit({ type:'replaced', games:replaced, why:o.why });
  return { ok:true, applied };
}

async function syncOnce(o: { keepalive: boolean; quiet: boolean }): Promise<void> {
  if (stopped) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { setPhase('offline'); return; }
  let st = readCloud();
  if (o.keepalive && !st?.lastSyncAt) return; // 页面隐藏时不开通，只补推
  if (!st) { st = await ensureCloud(); if (!st) return; }
  setPhase('syncing');
  if (!st.lastSyncAt && !o.keepalive) { const c = await createAccount(st); if (!c.ok) return finish(c.fail); st = c.st; }
  let r = await pushPull(st, { ...o, why:'conflict' });
  if (!r.ok && r.fail === 'not-found' && !o.keepalive) {
    // 云存档已到期删除：用本机编号与恢复码重新开通，再整份上传
    const c = await createAccount(st); if (!c.ok) return finish(c.fail);
    st = { ...c.st, games:{}, meta:{ rev:0, hash:'' }, lastSyncAt:0 };
    if (!writeCloud(st)) return finish('store');
    r = await pushPull(st, { ...o, why:'conflict' });
  }
  finish(r.ok ? null : r.fail);
}

// 同一个标签页一次只跑一个同步，途中又被请求就跑完再来一次；两个标签页靠 shoota-cloud 锁，拿不到就跳过。
// 页面隐藏时一律只用 keepalive 发（§15）：运行层切后台写完存档后请求的、联网补的、跑完再来的那一次都算
let running: Promise<void> | null = null, again = false;
export function syncNow(o: { keepalive?: boolean; quiet?: boolean } = {}): Promise<void> {
  if (running) { again = true; return running; }
  running = (async () => {
    for (let opt = { keepalive:!!o.keepalive || document.hidden, quiet:!!o.quiet }; ; opt = { keepalive:document.hidden, quiet:false }) {
      again = false;
      await withCloudLock(false, () => syncOnce(opt));
      if (!again) break;
    }
  })().catch(() => {}).finally(() => { running = null; });
  return running;
}

let started = false;
export function startCloud(){
  if (started) return;
  started = true;
  onSyncRequest(() => { void syncNow(); });
  setInterval(() => { if (!document.hidden) void syncNow({ quiet:anyHeld() }); }, CLOUD.syncEveryMs);
  window.addEventListener('online', () => { void syncNow(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) void syncNow({ keepalive:true }); });
  void syncNow();
}

/* ───────── FLOW-RECOVER：恢复码绑定 ───────── */
export type RecoverReply =
  | { ok: true; code: string; saveId: string; games: CloudRecoverResult['games'] }
  | { ok: false; why: 'format' | 'own' | 'unknown' | 'network' }; // format：规整后不是 16 位；own：就是本机在用的恢复码

// S1、S2：规整恢复码，换回云存档编号与云端的游戏清单（不含存档正文）；玩家确认后再调 adopt
export async function recover(input: string): Promise<RecoverReply> {
  const code = normalizeCode(input);
  if (!code) return { ok:false, why:'format' };
  if (readCloud()?.code === code) return { ok:false, why:'own' };
  const r = await recoverApi(code);
  if (r.ok && /^[0-9a-f]{32}$/.test(String(r.data?.saveId)) && Array.isArray(r.data.games)) return { ok:true, code, saveId:r.data.saveId, games:r.data.games };
  return { ok:false, why:!r.ok && r.fail === 'code-unknown' ? 'unknown' : 'network' };
}

export type AdoptReply =
  | { ok: true; restored: number } // 取回了几款
  | { ok: false; why: 'expired' | 'unavailable' | 'network' | 'storage' };

// S4：这台设备改用这个云存档，旧的不再同步。先把本机进度推进去（base 为 0，同一款按 RULE-CLOUD-001 比，输的进撤销槽），再拉回全部。
// 中途失败时已写进本机的保留，之后的同步补齐；云端找不到这个云存档时换回原来的状态
export async function adopt(saveId: string, code: string): Promise<AdoptReply> {
  const out = await withCloudLock(true, async (): Promise<AdoptReply> => {
    const prev = readCloud(), st = blankState(saveId, code);
    if (!writeCloud(st)) return { ok:false, why:'storage' };
    stopped = false; setPhase('syncing');
    const r = await pushPull(st, { keepalive:false, quiet:false, why:'recover' });
    if (r.ok) { finish(null); return { ok:true, restored:r.applied }; }
    if (r.fail === 'not-found') { writeCloud(prev); finish(null); return { ok:false, why:'expired' }; }
    finish(r.fail);
    return { ok:false, why:r.fail === 'auth' ? 'unavailable' : r.fail === 'store' ? 'storage' : 'network' };
  });
  return out ?? { ok:false, why:'network' };
}
