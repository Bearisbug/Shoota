// 内部任务 cloud.expire：每天北京时间 04:00 由定时触发跑一次，删掉最近同步日早于 365 天的云存档（REQ-CLOUD-006、§17）。
// 每次最多 200 个，三张云端表在一个批处理里删；删不完的留到第二天，重复跑只删还剩下的。
import { CLOUD } from '../shared/limits';
import type { Env } from './env';
import { addDays, bjDay } from './http';

// 三条语句选同一批：云存档行最后才删，前两条执行时这批还在
const DUE = 'SELECT sid FROM cloud_accounts WHERE seen_day < ?1 ORDER BY seen_day, sid LIMIT ?2';

export async function expireClouds(env: Env, now = Date.now()) {
  const args = [addDays(bjDay(now), -CLOUD.expireDays), CLOUD.expireBatch];
  const [, , accounts] = await env.DB.batch(['cloud_games', 'cloud_meta', 'cloud_accounts']
    .map(t => env.DB.prepare(`DELETE FROM ${t} WHERE sid IN (${DUE})`).bind(...args)));
  return accounts.meta.changes;
}
