// 走查用例共用（docs/TEST.md 里步骤表带「截图键」的用例，做法照 test-doc 的 flow-walkthrough.md）：
// - open 开一个新浏览器：浅色、减弱动态效果、关掉 Service Worker、带 sk_staff=1（上报不写统计表，INV-002）；
//   页面与游戏 iframe 里的 Math.random 与 crypto.getRandomValues 按走查名固定种子，两遍生成同样的编号、恢复码与游戏内容；
// - shot 只拍视口，缩放到入库宽度（手机 720，其余 1100）后用 cwebp -q 70 存成 webp，热点与动态区域换算到 webp 像素，
//   记进 .tour-out/<轮次>/pass-<遍数>/shots.json；比对两遍与发布到 docs/tour/ 由 gate.ts 做；
// - 页面上的时刻与日期（「已存档 10:31」「10月22日」）每次运行都不同，自动登记成动态区域。
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { test as base, expect, type Locator, type Page } from '@playwright/test';
import { BASE } from '../lib/base';
import { sidOf } from '../lib/cloud';
import { d1 } from '../lib/d1';
import { floatButton } from '../lib/ui';
import { contextOptions, type MeasureVp } from '../lib/viewports';

export { expect };

const ROOT = resolve(import.meta.dirname, '../..');
const RUN = process.env.TOUR_RUN ?? 'local';
const OUT = resolve(ROOT, '.tour-out', RUN, `pass-${process.env.TOUR_PASS ?? '1'}`);
const DATA_MODE = '本地 wrangler dev 与本地 D1；Service Worker 关闭；减弱动态效果；随机数按走查名固定种子';
// 每次运行都会变的文字：时分、「10月22日」这类日期
const CHANGING = ['\\d{1,2}:\\d{2}', '\\d{1,2}月\\d{1,2}日'];

export interface Rect { x: number; y: number; w: number; h: number }
export interface ShotEntry {
  key: string; file: string; captured_at: string; data_mode: string; device: string; viewport: string; scroll: string; source: string;
  dynamic_regions: (Rect & { what: string })[];
  hotspots: (Rect & { kind: 'tap' | 'look'; target: string })[];
  same_as?: string;
}

interface OpenOptions { at: MeasureVp; ua?: string; via?: string } // via：经本地中转打开时的中转地址，也给它带上 sk_staff

// mulberry32：页面里的随机数换成固定种子的序列
function seedRandom(seed: number) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Math.random = next;
  crypto.getRandomValues = (<T extends ArrayBufferView | null>(a: T): T => {
    if (a) new Uint8Array(a.buffer, a.byteOffset, a.byteLength).forEach((_, i, b) => { b[i] = Math.floor(next() * 256); });
    return a;
  }) as Crypto['getRandomValues'];
}

const seedOf = (name: string) => [...name].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);

const mobilePages = new WeakSet<Page>();

export const test = base.extend<{ open: (o: OpenOptions) => Promise<Page> }>({
  open: async ({ browser }, use, info) => {
    const opened: { close(): Promise<void> }[] = [];
    await use(async ({ at, ua, via }) => {
      const vp = contextOptions(at, ua);
      const ctx = await browser.newContext({
        baseURL: via ?? BASE, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', colorScheme: 'light', reducedMotion: 'reduce',
        serviceWorkers: 'block', ...vp,
      });
      opened.push(ctx);
      await ctx.addCookies([BASE, via].filter((u): u is string => !!u).map(url => ({ name: 'sk_staff', value: '1', url })));
      await ctx.addInitScript(seedRandom, seedOf(info.title));
      const page = await ctx.newPage();
      if (vp.isMobile) mobilePages.add(page);
      return page;
    });
    for (const c of opened) await c.close();
  },
});

// 视口里匹配 CHANGING 的文字所占的矩形（CSS 像素）
function changingText(sources: string[]) {
  const res = sources.map(s => new RegExp(s, 'g')), out: { x: number; y: number; w: number; h: number; text: string }[] = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const text = n.textContent ?? '';
    for (const re of res) {
      for (const m of text.matchAll(re)) {
        const r = document.createRange();
        r.setStart(n, m.index!);
        r.setEnd(n, m.index! + m[0].length);
        for (const b of r.getClientRects()) {
          if (b.width && b.bottom > 0 && b.right > 0 && b.top < innerHeight && b.left < innerWidth) out.push({ x: b.x, y: b.y, w: b.width, h: b.height, text: m[0] });
        }
      }
    }
  }
  return out;
}

// 走查自己的云存档（编号写死在脚本里）：开跑前删掉上一次留下的行，只删这个编号名下的
export const dropAccount = (saveId: string) => {
  const sid = sidOf(saveId);
  d1(['cloud_games', 'cloud_meta', 'cloud_accounts'].map(t => `DELETE FROM ${t} WHERE sid = '${sid}';`).join(' '));
};

// 悬浮按钮落定：存档小点灭了，3 秒没碰已经变淡。两者都跟着写入与开局的时刻走，拍游戏页之前等它们落定
export async function settleFloat(page: Page) {
  await expect(floatButton(page)).not.toHaveAttribute('data-dot', 'on', { timeout: 5000 });
  await expect(floatButton(page)).toHaveAttribute('data-idle', { timeout: 5000 });
}

export interface ShotOptions {
  tap?: Locator[]; // 下一步要点的元素
  look?: Locator[]; // 这一步预期断言的元素
  dynamic?: { at: Locator; what: string }[]; // 时刻与日期以外、每次运行必然不同的区域
  scroll?: string; // 截图时的滚动停点，默认 top
  sameAs?: string; // 与前一步同一帧时写那一步的截图键
}

// 拍一个截图键：等字体、视口里的图片与布局落定，存 webp，记热点、动态区域与拍法
export async function shot(page: Page, key: string, o: ShotOptions) {
  if (!o.tap?.length && !o.look?.length) throw new Error(`${key} 至少要一个热点`);
  await page.evaluate(async () => {
    await document.fonts.ready;
    const seen = [...document.images].filter(i => { const r = i.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < innerHeight; });
    await Promise.all(seen.map(i => i.decode().catch(() => undefined)));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  const vp = page.viewportSize()!, dpr = await page.evaluate(() => devicePixelRatio);
  const width = mobilePages.has(page) ? 720 : 1100, k = width / vp.width;
  const scale = (b: { x: number; y: number; width?: number; height?: number; w?: number; h?: number }): Rect =>
    ({ x: Math.round(b.x * k), y: Math.round(b.y * k), w: Math.round((b.width ?? b.w ?? 0) * k), h: Math.round((b.height ?? b.h ?? 0) * k) });

  const hotspots: ShotEntry['hotspots'] = [];
  for (const [kind, ls] of [['tap', o.tap ?? []], ['look', o.look ?? []]] as const) {
    for (const l of ls) {
      const b = await l.boundingBox();
      if (!b) throw new Error(`${key} 的热点不在页面上：${l}`);
      hotspots.push({ kind, ...scale(b), target: String(l) });
    }
  }
  const dynamic_regions = (await page.evaluate(changingText, CHANGING))
    .map(r => ({ ...scale({ x: r.x - 2, y: r.y - 2, w: r.w + 4, h: r.h + 4 }), what: `「${r.text}」是截图时的时刻或日期，每次运行都不同` }));
  for (const d of o.dynamic ?? []) {
    const b = await d.at.boundingBox();
    if (b) dynamic_regions.push({ ...scale(b), what: d.what });
  }

  const raw = resolve(OUT, 'raw', key + '.png'), webp = resolve(OUT, key + '.webp');
  mkdirSync(dirname(raw), { recursive: true });
  mkdirSync(dirname(webp), { recursive: true });
  writeFileSync(raw, await page.screenshot({ animations: 'disabled', caret: 'hide' }));
  execFileSync('cwebp', ['-quiet', '-q', '70', '-resize', String(width), '0', raw, '-o', webp]);

  const entry: ShotEntry = {
    key, file: `shots/${key}.webp`, captured_at: new Date().toISOString(), data_mode: DATA_MODE,
    device: `Microsoft Edge ${page.context().browser()?.version()} 无头`, viewport: `${vp.width}x${vp.height}@${dpr}`,
    scroll: o.scroll ?? 'top', source: relative(ROOT, base.info().file), dynamic_regions, hotspots,
    ...(o.sameAs && { same_as: o.sameAs }),
  };
  const list = resolve(OUT, 'shots.json');
  const shots: ShotEntry[] = existsSync(list) ? JSON.parse(readFileSync(list, 'utf8')) : [];
  writeFileSync(list, JSON.stringify([...shots.filter(s => s.key !== key), entry], null, 2));
}
