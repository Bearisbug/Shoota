// 读写本地 D1：和 wrangler dev 共用项目根 .wrangler/state 里的同一个库（docs/TEST.md §3 种子与重置）。
// 每次调用起一次 wrangler，约 1～2 秒；写库是异步的，查结果用 expect.poll 等。
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');

export const STAT_TABLES = ['visitors', 'visitor_days', 'game_days', 'login_guards'];
export const LAUNCH_TABLES = ['launch_days', 'launch_fails'];
export const CLOUD_TABLES = ['cloud_accounts', 'cloud_games', 'cloud_meta'];

export function d1<T = Record<string, unknown>>(sql: string): T[] {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'shoota-metrics', '--local', '--json', '--command', sql],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }); // TC-CLOUD-012 读回 1 MB 的存档正文
  return (JSON.parse(out) as { results: T[] }[]).flatMap(r => r.results);
}

export const clearTables = (...tables: string[]) => { d1(tables.map(t => `DELETE FROM ${t};`).join(' ')); };

export const count = (table: string, where = '1') => d1<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`)[0].n;

// 北京日期，与 Worker 的口径一致
export const bjDay = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
