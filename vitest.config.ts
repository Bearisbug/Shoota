import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';

// 两个测试项目：
// - unit：浏览器侧与共用代码，跑在 Node 里；
// - worker：src/worker 的测试跑在 workerd 里，绑定取自 wrangler.jsonc，D1 每个测试文件各一份。
//   TEST_MIGRATIONS 是 migrations/ 的内容，测试里用 applyD1Migrations(env.DB, env.TEST_MIGRATIONS) 建表。
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [react()],
        test: {
          name: 'unit',
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: [...configDefaults.exclude, 'src/worker/**'],
          environment: 'node',
        },
      },
      {
        plugins: [
          cloudflareTest(async () => ({
            wrangler: { configPath: './wrangler.jsonc' },
            miniflare: { bindings: { TEST_MIGRATIONS: await readD1Migrations('./migrations') } },
          })),
        ],
        test: {
          name: 'worker',
          include: ['src/worker/**/*.test.ts'],
        },
      },
    ],
  },
});
