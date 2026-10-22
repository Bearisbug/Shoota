// Worker 的绑定与密钥：D1 与静态资源见 wrangler.jsonc，两个密钥见 .env.example
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  KANBAN_PASSWORD?: string;
  KANBAN_SECRET?: string;
}

export type AppEnv = { Bindings: Env };
