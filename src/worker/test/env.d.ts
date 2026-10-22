// 测试环境的绑定：DB 取自 wrangler.jsonc 的本地 D1，TEST_MIGRATIONS 由 vitest.config.ts 读入 migrations/
declare namespace Cloudflare {
  interface Env { DB: D1Database; TEST_MIGRATIONS: import('cloudflare:test').D1Migration[] }
}

declare module '*?raw' {
  const text: string;
  export default text;
}
