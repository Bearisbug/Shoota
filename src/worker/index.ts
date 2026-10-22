// shoota Worker：匿名统计上报、启动遥测、云存档（/api/*）与密码看板（/kanban）。
// 只有 wrangler.jsonc 里 run_worker_first 列出的 /api/*、/kanban、/kanban/* 会进这里，另有每天一次的定时触发；
// 其余请求由静态资源直接返回。接口、口径与错误码见 docs/DESIGN.md §8、§9、§14。
import { Hono } from 'hono';
import type { AppEnv, Env } from './env';
import { collect, merge } from './routes/collect';
import { launch } from './routes/launch';
import { createAccount, recover, sync } from './routes/cloud';
import { kanbanAsset, kanbanData, kanbanPage, login } from './routes/kanban';
import { expireClouds } from './cron';

const app = new Hono<AppEnv>();

app.post('/api/e', collect);
app.post('/api/merge', merge);
app.post('/api/launch', launch);
app.post('/api/cloud/account', createAccount);
app.post('/api/cloud/recover', recover);
app.post('/api/cloud/sync', sync);
app.get('/kanban', kanbanPage);
app.post('/kanban/login', login);
app.get('/kanban/data', kanbanData);
app.all('/kanban/*', kanbanAsset);

// 其余路径与方法照旧交给静态资源，一般是 404
app.notFound(c => c.env.ASSETS.fetch(c.req.raw));

// 日志只记 cf-ray 与错误，不记旅客编号、云存档编号与恢复码（§21）
app.onError((err, c) => {
  console.error(c.req.header('cf-ray') || '', err);
  return new Response('Internal Server Error', { status: 500 });
});

export default {
  fetch: app.fetch,
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(expireClouds(env));
  },
} satisfies ExportedHandler<Env>;
