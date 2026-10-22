// 走查复位（docs/TEST.md 各走查用例的前置与后置）：只删本轮时间窗内开通的云存档，三张云端表按它们的 sid 删；
// 统计表与启动表不用删：走查浏览器都带 sk_staff=1，上报不写库（INV-002）。
// 时间窗起点在本轮第一次复位时记进 .tour-out/<轮次>/window；输出复位前后删除范围内各表的行数。
// 用法：TOUR_RUN=RUN-039 node e2e/tour/reset.ts（只用 Node 自带模块，直接用 node 跑）
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const run = process.env.TOUR_RUN;
if (!run) throw new Error('先设本轮编号，例如 TOUR_RUN=RUN-039');
const dir = resolve(ROOT, '.tour-out', run), file = resolve(dir, 'window');
mkdirSync(dir, { recursive: true });
if (!existsSync(file)) writeFileSync(file, String(Date.now()));
const since = Number(readFileSync(file, 'utf8'));

const d1 = (sql: string) => (JSON.parse(execFileSync('npx', ['wrangler', 'd1', 'execute', 'shoota-metrics', '--local', '--json', '--command', sql],
  { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })) as { results: { n: number }[] }[]).flatMap(r => r.results);

// cloud_accounts 放最后删，前两张表的范围要靠它找 sid
const TABLES = ['cloud_games', 'cloud_meta', 'cloud_accounts'];
const scope = `sid IN (SELECT sid FROM cloud_accounts WHERE created_at >= ${since})`;
const counts = () => TABLES.map(t => `${t} ${d1(`SELECT COUNT(*) AS n FROM ${t} WHERE ${scope}`)[0].n}`).join('、');

console.log(`时间窗起点 ${new Date(since).toISOString()}；复位前 ${counts()}`);
d1(TABLES.map(t => `DELETE FROM ${t} WHERE ${scope};`).join(' '));
console.log(`复位后 ${counts()}`);
