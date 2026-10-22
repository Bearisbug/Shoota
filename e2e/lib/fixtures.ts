// 用例共用的 test：多一个按项目区分的视口名 vp，用例按它决定在哪个视口跑；
// 另有两个按用例收尾的工厂：fresh 开一个新浏览器（独立上下文），net 起一个本地中转。
import { test as base, expect, type BrowserContextOptions, type Page } from '@playwright/test';
import { BASE } from './base';
import { startProxy, type NetProxy } from './proxy';
import { contextOptions, type MeasureVp, type Vp } from './viewports';

export interface E2eOptions { vp: Vp }

export interface FreshOptions extends BrowserContextOptions {
  at?: MeasureVp; // 视口，默认取当前项目的
  ua?: string; // 覆盖手机视口的默认 UA
}

interface E2eFixtures {
  fresh: (o?: FreshOptions) => Promise<Page>;
  net: (o?: Partial<Pick<NetProxy, 'mode' | 'latencyMs' | 'bytesPerSec'>>) => Promise<NetProxy>;
}

export const test = base.extend<E2eFixtures, E2eOptions>({
  vp: ['desktop', { option: true, scope: 'worker' }],

  fresh: async ({ browser, vp }, use) => {
    const opened: { close(): Promise<void> }[] = [];
    await use(async ({ at, ua, ...rest } = {}) => {
      const ctx = await browser.newContext({
        baseURL: BASE, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', ...contextOptions(at ?? vp, ua), ...rest,
      });
      opened.push(ctx);
      return ctx.newPage();
    });
    for (const c of opened) await c.close();
  },

  net: async ({}, use) => {
    const started: NetProxy[] = [];
    await use(async o => {
      const p = await startProxy(o);
      started.push(p);
      return p;
    });
    for (const p of started) await p.close();
  },
});

export { expect };

// 只在这些视口跑；放在文件顶部或 describe 里
export const onlyOn = (...vps: Vp[]) => test.skip(({ vp }) => !vps.includes(vp), `只在 ${vps.join('、')} 视口跑`);

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
