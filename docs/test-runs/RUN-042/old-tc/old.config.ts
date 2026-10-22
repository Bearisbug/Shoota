// 旧用例（TC-001～TC-037 里没有自动化脚本的那些）的一次性执行配置，被测服务是 8812 上的重写版。
// 在项目根运行：npx playwright test -c docs/test-runs/RUN-042/old-tc/old.config.ts
export default {
  testDir: '.',
  testMatch: '*.spec.ts',
  outputDir: '../../../../test-results/old-tc',
  timeout: 300_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: '../../../../test-results/old-tc.json' }]],
  use: {
    baseURL: 'http://localhost:8812',
    channel: 'msedge',
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    launchOptions: { args: ['--disable-features=IsolateSandboxedIframes'] },
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'desktop', use: { vp: 'desktop' } }],
};
