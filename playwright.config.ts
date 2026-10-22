import { defineConfig } from '@playwright/test';
import { BASE, PORT } from './e2e/lib/base';
import { contextOptions, type Vp } from './e2e/lib/viewports';
import type { E2eOptions } from './e2e/lib/fixtures';

// 平台页面端到端用例，与 docs/TEST.md 的 TC 同源（对照表见 TEST.md §2）。
// 浏览器用本机 Microsoft Edge；被测服务是本地 wrangler dev（端口 8812），已经开着就直接用；
// 旧版 dd731d6 起在 8811 上时用 E2E_PORT=8811 跑，就是在旧版上跑同一批用例（TEST.md §3「本地跑旧版」）。
// 同一个 D1 本地库被所有用例共用，按顺序一个一个跑。
const project = (vp: Vp) => ({ name: vp, use: { vp, ...contextOptions(vp) } });

export default defineConfig<object, E2eOptions>({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  outputDir: './test-results/e2e',
  timeout: 180_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: './test-results/e2e.json' }]],
  use: {
    baseURL: BASE,
    channel: 'msedge',
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    // 桌面版 Edge 把沙箱 iframe 放进独立进程时，无头模式下 iframe 下沿一条收不到点击；手机浏览器没有这层隔离
    launchOptions: { args: ['--disable-features=IsolateSandboxedIframes'] },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [project('portrait'), project('landscape'), project('tablet'), project('desktop')],
  webServer: {
    command: `npm run build && npx wrangler d1 migrations apply shoota-metrics --local && npx wrangler dev --port ${PORT} --test-scheduled`,
    url: BASE + '/',
    reuseExistingServer: true,
    timeout: 240_000,
  },
});
