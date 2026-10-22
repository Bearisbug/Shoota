import { defineConfig } from '@playwright/test';
import main from '../../playwright.config';

// 走查用例（docs/TEST.md 里步骤表带「截图键」的用例）的脚本，一次运行拍一遍；跑法见 TEST.md §3「走查」。
// 被测服务、浏览器与沙箱 iframe 的启动参数与 e2e 用例相同，取自根目录的 playwright.config.ts；
// 另关掉 GPU 加速：GPU 栅格化时缩小显示的封面清晰度随图片到达的早晚变，两遍拍出的图对不上。
export default defineConfig({
  testDir: '.',
  testMatch: '*.tour.ts',
  outputDir: '../../test-results/tour',
  timeout: 180_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    ...main.use,
    launchOptions: { ...main.use?.launchOptions, args: [...main.use?.launchOptions?.args ?? [], '--disable-gpu'] },
    trace: 'retain-on-failure', screenshot: 'off',
  },
  webServer: main.webServer,
});
