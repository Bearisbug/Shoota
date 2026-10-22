// API-LAUNCH-001 启动遥测：按北京日期、游戏、国家或地区、打开环境累加到 launch_days，失败原因累加到 launch_fails。
// 不带旅客编号与云存档编号（INV-CLOUD-002）；校验顺序同 API-001，先校验格式再看内部标记。
import type { Context } from 'hono';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { BatchItem } from 'drizzle-orm/batch';
import type { RunEnv, Runtime } from '../../shared/protocol';
import { LAUNCH_FAIL_REASONS, type LaunchPhase } from '../../shared/telemetry';
import { TELEMETRY } from '../../shared/limits';
import type { AppEnv } from '../env';
import { launchDays, launchFails } from '../db/schema';
import { GAME_ID, bjDay, country, isInt, isObj, isStaff, noContent, problem, readJson } from '../http';

const PHASES = new Set<unknown>(['start', 'ready', 'fail', 'cancel'] satisfies LaunchPhase[]);
const RUNTIMES = new Set<unknown>(['legacy', 'play'] satisfies Runtime[]);
const ENVS = new Set<unknown>(['browser', 'wechat', 'standalone'] satisfies RunEnv[]);
const REASONS = new Set<unknown>(LAUNCH_FAIL_REASONS);
const MAX_MS = 600000;
const [B1, B3, B10, B30] = TELEMETRY.readyBucketsMs;

const zero = () => ({ starts: 0, ready: 0, fail: 0, cancel: 0, b1: 0, b3: 0, b10: 0, b30: 0, bx: 0, fsTry: 0, fsOk: 0 });

// 整批校验，任一事件不合法就整批拒绝
function parseLaunch(b: unknown) {
  if (!isObj(b) || !Array.isArray(b.ev) || b.ev.length < 1 || b.ev.length > TELEMETRY.maxEvents) return null;
  const days = new Map<string, { game: string; env: string; n: ReturnType<typeof zero> }>(), fails = new Map<string, number>();
  for (const e of b.ev as unknown[]) {
    if (!isObj(e) || !PHASES.has(e.p) || typeof e.g !== 'string' || !GAME_ID.test(e.g) || !RUNTIMES.has(e.r) || !ENVS.has(e.e)) return null;
    if (e.p === 'start' ? e.ms !== undefined && !isInt(e.ms, 0, MAX_MS) : !isInt(e.ms, 0, MAX_MS)) return null;
    if (e.p === 'fail' ? !REASONS.has(e.why) : e.why !== undefined && !REASONS.has(e.why)) return null;
    if ((e.n !== undefined && e.n !== 1 && e.n !== 2) || (e.c !== undefined && e.c !== 0 && e.c !== 1)) return null;
    if (e.fs !== undefined && e.fs !== 0 && e.fs !== 1 && e.fs !== 2) return null;
    const k = e.g + '|' + e.e;
    if (!days.has(k)) days.set(k, { game: e.g, env: e.e as string, n: zero() });
    const n = days.get(k)!.n;
    if (e.p === 'start') n.starts++;
    else if (e.p === 'cancel') n.cancel++;
    else if (e.p === 'fail') { n.fail++; fails.set(e.why as string, (fails.get(e.why as string) || 0) + 1); }
    else {
      const ms = e.ms as number;
      n.ready++;
      if (ms <= B1) n.b1++; else if (ms <= B3) n.b3++; else if (ms <= B10) n.b10++; else if (ms <= B30) n.b30++; else n.bx++;
      if (e.fs === 1 || e.fs === 2) n.fsTry++;
      if (e.fs === 2) n.fsOk++;
    }
  }
  return { days: [...days.values()], fails };
}

const add = (col: { name: string }) => sql.raw(`${col.name} + excluded.${col.name}`);

export async function launch(c: Context<AppEnv>) {
  const req = c.req.raw;
  const p = parseLaunch(await readJson(req, TELEMETRY.maxBodyBytes));
  if (!p) return problem(req, 400, '/errors/bad-launch', '启动上报格式不对');
  if (isStaff(req)) return noContent(); // 内部浏览器不计入（INV-002）

  const db = drizzle(c.env.DB), day = bjDay(), cc = country(req), t = launchDays;
  const stmts: BatchItem<'sqlite'>[] = p.days.map(r => db.insert(t).values({ day, game: r.game, country: cc, env: r.env, ...r.n }).onConflictDoUpdate({
    target: [t.day, t.game, t.country, t.env],
    set: {
      starts: add(t.starts), ready: add(t.ready), fail: add(t.fail), cancel: add(t.cancel),
      b1: add(t.b1), b3: add(t.b3), b10: add(t.b10), b30: add(t.b30), bx: add(t.bx), fsTry: add(t.fsTry), fsOk: add(t.fsOk),
    },
  }));
  for (const [reason, n] of p.fails) {
    stmts.push(db.insert(launchFails).values({ day, country: cc, reason, n }).onConflictDoUpdate({
      target: [launchFails.day, launchFails.country, launchFails.reason], set: { n: add(launchFails.n) },
    }));
  }
  await db.batch(stmts as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
  return noContent();
}
