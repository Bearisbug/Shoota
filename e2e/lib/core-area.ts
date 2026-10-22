// 核心区占比（docs/DESIGN.md §13「核心区占比目标」、docs/TEST.md §3「核心区占比」）。
// 量法沿用 2026-10-22 旧版走查脚本：每款按登记的步骤进到主界面，在游戏 iframe 里找贴边的固定栏与主滚动区，
// 核心区 = 游戏区扣掉上下左右固定栏后的矩形，占比 = 核心区面积 ÷ 视口面积；Safari 可见区另算整屏占比。
// 改写后的游戏不猜：GameShell 把核心区标成 data-shell="core"，直接取它的矩形。
import type { Frame, Page } from '@playwright/test';
import { CATALOG } from '../../src/catalog';
import type { MeasureVp } from './viewports';
import { VIEWPORTS } from './viewports';

export const GAMES = CATALOG.map(g => g.id);
export const MEASURE_VPS: MeasureVp[] = ['portrait', 'landscape', 'safari-portrait', 'safari-landscape', 'tablet', 'desktop'];

// 每款游戏从首屏进到主界面的步骤：te 文字全等、t 文字包含、s 选择器、f 选择器=值、w 等毫秒；hud 是游戏自己的常驻顶部 / 底部信息区
type Steps = string[];
interface GameSteps { steps: Steps | Partial<Record<MeasureVp, Steps>> & { landscape: Steps }; hud?: Hud }
export interface Hud { box?: string; top?: string[]; bottom?: string[] }

const SPUD_UPRIGHT = ['te:无法旋转，直接继续', 'te:继续游玩', 'te:开始', 'w:800', 'te:出发', 'w:2500'];

export const STEPS: Record<string, GameSteps> = {
  // 竖着的视口（含平板与 Safari 竖屏可见区）薯光先出自己的「横屏游玩」提示，要先点「无法旋转，直接继续」
  'spud-dawn': {
    steps: { portrait: SPUD_UPRIGHT, 'safari-portrait': SPUD_UPRIGHT, tablet: SPUD_UPRIGHT, landscape: ['te:开始', 'w:800', 'te:出发', 'w:2500'] },
  },
  'f1-driver': { steps: ['s:button.origin', 'te:创建车手，选择车队', 'te:查看替补计划', 'te:签约替补，开始试训', 'w:800'] },
  f1: { steps: ['s:button.tcard', 'w:800'] },
  'basketball-star': { steps: ['s:button.position-choice', 's:[data-act=creation-reroll]', 'w:300', 'f:#setup-name=张三', 's:[data-act=creation-next]', 's:button.creation-team', 's:[data-act=creation-next]', 's:[data-act=start]', 'w:800'] },
  'wealth-reborn': { steps: ['f:input=张三', 's:button.gold-button', 'w:1200'], hud: { top: ['header.game-hud'], bottom: ['nav.game-dock'] } },
  douluo: { steps: ['s:button.idc', 's:button.perk', 's:#go', 'w:800'] },
  yexiao: { steps: ['te:推着车出摊', 'w:800'] },
  hougong: { steps: ['s:#btnStart', 'w:800'] },
  nba: { steps: ['s:button.tcard', 'te:执掌这支球队 ▸', 'w:800'] },
  cba: { steps: ['s:button.tcard', 'te:执掌这支球队 ▸', 'w:800'] },
  lol: { steps: ['s:button.tcard', 'w:800'] },
  yike: { steps: ['te:开始抓药', 'w:800'], hud: { box: '#stage', top: ['#stage > header'], bottom: ['#props'] } },
  'entertainment-career': { steps: ['te:写下我的第一部作品', 'w:800'] },
};

// 分视口登记的只有薯光：没登记的视口一律用横屏那组
export function stepsFor(id: string, vp: MeasureVp): Steps {
  const s = STEPS[id].steps;
  return Array.isArray(s) ? s : s[vp] ?? s.landscape;
}

// 按步骤点进主界面，返回没点到的步骤
export async function runSteps(fr: Frame, page: Page, steps: Steps): Promise<string[]> {
  const misses: string[] = [];
  for (const st of steps) {
    const i = st.indexOf(':'), k = st.slice(0, i), v = st.slice(i + 1);
    if (k === 'w') { await page.waitForTimeout(+v); continue; }
    if (k === 'f') {
      const [sel, val] = v.split('=');
      await fr.locator(sel).first().fill(val).catch(e => misses.push(`${st} ${String(e).split('\n')[0]}`));
      continue;
    }
    const loc = (k === 'te' ? fr.getByText(v, { exact: true }) : k === 't' ? fr.getByText(v) : fr.locator(v)).locator('visible=true').first();
    try {
      await loc.scrollIntoViewIfNeeded({ timeout: 3000 });
      await loc.tap({ timeout: 3000 }).catch(() => loc.click({ timeout: 3000, force: true }));
    } catch (e) {
      misses.push(`${st} ${String(e).split('\n')[0]}`);
    }
    await page.waitForTimeout(500);
  }
  return misses;
}

export interface Rect { top: number; bottom: number; left: number; right: number }
export interface FrameMeasure { vw: number; vh: number; mode: 'shell' | 'manual' | 'inner-scroller' | 'document-scroll' | 'no-scroll'; core: Rect }

// 在游戏文档里运行，只量核心区（旧版脚本的 measureInFrame 去掉交互检查）
export function measureInFrame(hud: Hud | null): FrameMeasure {
  const vw = innerWidth, vh = innerHeight;
  const vis = (el: Element) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
  };
  const clip = (r: DOMRect): Rect => ({ top: Math.max(0, r.top), bottom: Math.min(vh, r.bottom), left: Math.max(0, r.left), right: Math.min(vw, r.right) });

  const shell = document.querySelector('[data-shell="core"]');
  if (shell) return { vw, vh, mode: 'shell', core: clip(shell.getBoundingClientRect()) };

  if (hud) {
    const rects = (sels: string[]) => sels.flatMap(s => [...document.querySelectorAll(s)].filter(vis)).map(el => el.getBoundingClientRect());
    const b = hud.box ? document.querySelector(hud.box)!.getBoundingClientRect() : { top: 0, bottom: vh, left: 0, right: vw };
    const tops = rects(hud.top ?? []), bots = rects(hud.bottom ?? []);
    return { vw, vh, mode: 'manual', core: {
      top: Math.max(0, b.top, ...tops.map(r => r.bottom)), bottom: Math.min(vh, b.bottom, ...bots.map(r => r.top)),
      left: Math.max(0, b.left), right: Math.min(vw, b.right),
    } };
  }

  const all = [...document.querySelectorAll('body *')];
  // 贴边的 fixed / sticky 区块，只取最外层；整屏背景层或遮罩不算
  const fixed: Rect[] = [];
  for (const el of all) {
    const pos = getComputedStyle(el).position;
    if ((pos !== 'fixed' && pos !== 'sticky') || !vis(el)) continue;
    let p = el.parentElement, inner = false;
    while (p && p !== document.body) {
      const pp = getComputedStyle(p).position;
      if (pp === 'fixed' || pp === 'sticky') { inner = true; break; }
      p = p.parentElement;
    }
    if (inner) continue;
    const r = el.getBoundingClientRect();
    if (r.width * r.height >= vw * vh * 0.9) continue;
    fixed.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
  }
  const se = document.scrollingElement || document.documentElement;
  const docScroll = se.scrollHeight > se.clientHeight + 4;
  const scrollers = all
    .filter(el => /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 4 && vis(el))
    .map(el => clip(el.getBoundingClientRect()))
    .map(r => ({ ...r, area: (r.bottom - r.top) * (r.right - r.left) }))
    .sort((a, b) => b.area - a.area);

  const E = 12;
  const h = (f: Rect) => f.bottom - f.top, w = (f: Rect) => f.right - f.left;
  const bandTop = fixed.filter(f => f.top <= E && h(f) < vh * 0.6 && w(f) >= vw * 0.5).reduce((m, f) => Math.max(m, f.bottom), 0);
  const bandBot = fixed.filter(f => f.bottom >= vh - E && h(f) < vh * 0.6 && w(f) >= vw * 0.5).reduce((m, f) => Math.max(m, vh - f.top), 0);
  const bandLeft = fixed.filter(f => f.left <= 2 * E && h(f) >= vh * 0.5 && w(f) < vw * 0.4).reduce((m, f) => Math.max(m, f.right), 0);
  const bandRight = fixed.filter(f => f.right >= vw - 2 * E && h(f) >= vh * 0.5 && w(f) < vw * 0.4).reduce((m, f) => Math.max(m, vw - f.left), 0);
  let box: Rect = { top: 0, bottom: vh, left: 0, right: vw };
  let mode: FrameMeasure['mode'] = docScroll ? 'document-scroll' : 'no-scroll';
  const main = scrollers[0];
  if (!docScroll && main && main.area >= vw * vh * 0.2) { mode = 'inner-scroller'; box = main; }
  return { vw, vh, mode, core: {
    top: Math.max(box.top, bandTop), bottom: Math.min(box.bottom, vh - bandBot),
    left: Math.max(box.left, bandLeft), right: Math.min(box.right, vw - bandRight),
  } };
}

export interface Reading {
  vp: MeasureVp;
  id: string;
  coreAreaPct: number; // 核心区面积 ÷ 视口面积，百分数保留一位
  screenAreaPct: number | null; // Safari 可见区：核心区面积 ÷ 整块屏幕面积
  frame: { x: number; y: number; w: number; h: number }; // 游戏 iframe 在页面上的位置
  mode: FrameMeasure['mode'];
  misses: string[];
}

const pct = (a: number, b: number) => Math.round(a / b * 1000) / 10;

// 量一款：游戏画面已经出现，按步骤进主界面，等 1.5 秒后量
export async function measureGame(page: Page, fr: Frame, vp: MeasureVp, id: string): Promise<Reading> {
  const misses = await runSteps(fr, page, stepsFor(id, vp));
  await page.waitForTimeout(1500);
  const el = await fr.frameElement();
  const fb = await el.boundingBox();
  if (!fb) throw new Error(`《${id}》的 iframe 不在页面上`);
  const m = await fr.evaluate(measureInFrame, STEPS[id].hud ?? null);
  const v = VIEWPORTS[vp];
  const area = Math.max(0, m.core.bottom - m.core.top) * Math.max(0, m.core.right - m.core.left);
  return {
    vp, id, misses, mode: m.mode, frame: { x: fb.x, y: fb.y, w: fb.width, h: fb.height },
    coreAreaPct: pct(area, v.width * v.height),
    screenAreaPct: v.screen ? pct(area, v.screen.width * v.screen.height) : null,
  };
}

/* ───────── 汇总口径：电脑 13 款都计，其余视口不计薯光（它自己全屏）。中位数按 0.1 个百分点取整，.5 进位 ───────── */

export interface Summary { n: number; median: number; min: number; minIds: string[]; screenMedian: number | null }

const tenths = (v: number) => Math.round(v * 10);
function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b), mid = s.length >> 1;
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export const counted = (vp: MeasureVp, id: string) => vp === 'desktop' || id !== 'spud-dawn';

export function summarize(readings: Reading[]): Partial<Record<MeasureVp, Summary>> {
  const out: Partial<Record<MeasureVp, Summary>> = {};
  for (const vp of MEASURE_VPS) {
    const rs = readings.filter(r => r.vp === vp && counted(vp, r.id));
    if (!rs.length) continue;
    const vals = rs.map(r => tenths(r.coreAreaPct)), min = Math.min(...vals);
    const screens = rs.map(r => r.screenAreaPct).filter((x): x is number => x !== null).map(tenths);
    out[vp] = {
      n: rs.length, median: median(vals) / 10, min: min / 10,
      minIds: rs.filter(r => tenths(r.coreAreaPct) === min).map(r => r.id).sort(),
      screenMedian: screens.length ? median(screens) / 10 : null,
    };
  }
  return out;
}

// §13 目标表。横屏两组的「最低」只对改写后的一克之差验收，单列在 TC-SDK-002、TC-SDK-003
export const TARGETS: Record<MeasureVp, { median: number; min?: number; screenMedian?: number }> = {
  portrait: { median: 77, min: 70 },
  landscape: { median: 60 },
  'safari-portrait': { median: 71, min: 61, screenMedian: 55 },
  'safari-landscape': { median: 56 },
  tablet: { median: 87, min: 49 },
  desktop: { median: 84, min: 28 },
};

// §13 的旧版数（2026-10-22 本机测量）
export const OLD: Record<MeasureVp, { median: number; min: number; minIds: string[]; screenMedian?: number }> = {
  portrait: { median: 66.1, min: 58.3, minIds: ['cba', 'nba'] },
  landscape: { median: 48.3, min: 14.0, minIds: ['yike'] },
  'safari-portrait': { median: 56.2, min: 46.1, minIds: ['cba', 'nba'], screenMedian: 43.4 },
  'safari-landscape': { median: 42.0, min: 13.5, minIds: ['yike'] },
  tablet: { median: 83.5, min: 45.6, minIds: ['yike'] },
  desktop: { median: 79.4, min: 22.9, minIds: ['yike'] },
};
