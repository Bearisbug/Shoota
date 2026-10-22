// Worker 测试共用：本地 D1（每个测试文件一份）、假的静态资源、发请求与查表的小工具。只碰本地模拟的 D1。
import { applyD1Migrations, createExecutionContext, env } from 'cloudflare:test';
import seedSql from '../../../scripts/seed-local.sql?raw';
import worker from '../index';
import type { Env } from '../env';

export const PASSWORD = 'local-test-pass';

// 静态资源里看板的两个页面；登录页按约定带 <!--MSG--> 占位与 aria-invalid="false"
export const LOGIN_HTML = '<!doctype html><title>shoota 看板 · 登录</title><form method="post" action="/kanban/login">'
  + '<input id="pw" name="password" type="password" aria-invalid="false"><p class="err" role="alert"><!--MSG--></p></form>';
export const DASHBOARD_HTML = '<!doctype html><title>shoota 看板</title><div id="root"></div>';

const assets = {
  async fetch(input: RequestInfo | URL) {
    const { pathname } = new URL(input instanceof Request ? input.url : input.toString());
    const html = { '/kanban/login': LOGIN_HTML, '/kanban/': DASHBOARD_HTML }[pathname];
    return html ? new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', etag: '"x"' } }) : new Response('not found', { status: 404 });
  },
} as unknown as Fetcher;

export const testEnv: Env = { DB: env.DB, ASSETS: assets, KANBAN_PASSWORD: PASSWORD, KANBAN_SECRET: 'local-test-secret' };

export function call(path: string, init: RequestInit<RequestInitCfProperties> = {}, e: Env = testEnv) {
  return worker.fetch(new Request('https://shoota.ai' + path, { cf: { country: 'CN' }, ...init }), e, createExecutionContext());
}

export function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return call(path, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } });
}

export const rows = async <T = Record<string, unknown>>(query: string, ...args: unknown[]) => (await env.DB.prepare(query).bind(...args).all<T>()).results;
export const exec = (query: string, ...args: unknown[]) => env.DB.prepare(query).bind(...args).run();

const TABLES = ['visitors', 'visitor_days', 'game_days', 'login_guards', 'cloud_accounts', 'cloud_games', 'cloud_meta', 'launch_days', 'launch_fails'];

export async function resetDb() {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  await env.DB.batch(TABLES.map(t => env.DB.prepare(`DELETE FROM ${t}`)));
}

// 灌看板口径种子 scripts/seed-local.sql（TC-011～TC-014 的预期值来源）
export async function seed() {
  const body = seedSql.split('\n').filter(l => !l.trimStart().startsWith('--')).join('\n');
  const stmts = body.split(/;\s*(?:\n|$)/).map(s => s.trim()).filter(Boolean);
  await env.DB.batch(stmts.map(s => env.DB.prepare(s)));
}

export const bjToday = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
export const daysAgo = (n: number) => new Date(Date.parse(bjToday() + 'T00:00:00Z') - n * 86400000).toISOString().slice(0, 10);

export const randomHex = (bytes = 16) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), b => b.toString(16).padStart(2, '0')).join('');
