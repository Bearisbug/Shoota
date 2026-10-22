// 排版：核心区占比达到 §13 的目标（REQ-SDK-002、REQ-SDK-003），舞台铺满核心区，三块不出界、不互相压。
// 核心区按 GameShell 的规则算：横屏且高不到 500 时顶部信息区收成一行，侧栏横屏在右、竖屏在下；量法同 e2e 取 data-shell="core" 的矩形。
import { describe, expect, it } from 'vitest';
import { shellLayout } from '../../sdk/core';
import { CHROME, fitStage, place } from './fit';

function core(vw: number, vh: number, expanded = false) {
  const { orientation, compact } = shellLayout({ width: vw, height: vh });
  const head = compact && !expanded ? CHROME.line : CHROME.head;
  const w = orientation === 'landscape' ? vw - CHROME.dockCol : vw;
  const h = orientation === 'landscape' ? vh - head : vh - head - CHROME.dockRow;
  return { orientation, compact, w, h, pct: Math.round(w * h / (vw * vh) * 1000) / 10 };
}

// §13 核心区占比目标：一克之差单独验收的三组，加上其余视口的「目标最低」
const TARGETS: [string, number, number, number][] = [
  ['竖屏 393×852', 393, 852, 75],
  ['横屏 852×393', 852, 393, 60],
  ['Safari 横屏可见区 734×343', 734, 343, 55],
  ['Safari 竖屏可见区 393×659', 393, 659, 61],
  ['平板竖屏 820×1180', 820, 1180, 49],
  ['电脑 1440×900', 1440, 900, 28],
];

describe('核心区占比', () => {
  for (const [name, vw, vh, min] of TARGETS) {
    it(`${name} 不低于 ${min}%`, () => {
      expect(core(vw, vh).pct).toBeGreaterThanOrEqual(min);
    });
  }

  it('横屏矮屏收成一行，展开后仍不低于 60%', () => {
    expect(core(852, 393).compact).toBe(true);
    expect(core(852, 393, true).pct).toBeGreaterThanOrEqual(60);
    expect(core(393, 852).compact).toBe(false);
    expect(core(1440, 900).compact).toBe(false);
  });
});

describe('舞台', () => {
  const VIEWS: [number, number][] = [[393, 852], [852, 393], [734, 343], [393, 659], [820, 1180], [1440, 900], [320, 568], [568, 320], [1024, 1366], [2560, 1440]];

  it('舞台缩放后正好等于核心区', () => {
    for (const [vw, vh] of VIEWS) {
      const c = core(vw, vh), f = fitStage(c.orientation, c.w, c.h);
      expect(f.w * f.k).toBeCloseTo(c.w, 6);
      expect(f.h * f.k).toBeCloseTo(c.h, 6);
      expect(f.k).toBeLessThanOrEqual(1.35);
    }
  });

  it('竖屏：秤、台面、暂存台自上而下排，都在舞台里', () => {
    for (const [vw, vh] of VIEWS.filter(([w, h]) => w <= h)) {
      const c = core(vw, vh), { w, h, off } = fitStage('portrait', c.w, c.h);
      const S = [off.S.y + 48, off.S.y + 243], B = [off.B.y + 243, off.B.y + 589], T = [off.T.y + 589, off.T.y + 672];
      expect(S[0]).toBeGreaterThanOrEqual(-1e-9);
      expect(S[1]).toBeLessThanOrEqual(B[0] + 1e-9);
      expect(B[1]).toBeLessThanOrEqual(T[0] + 1e-9);
      expect(T[1]).toBeLessThanOrEqual(h + 1e-9);
      for (const g of [off.S, off.B, off.T]) { expect(g.x).toBeGreaterThanOrEqual(0); expect(g.x + 390).toBeLessThanOrEqual(w); }
    }
  });

  it('横屏：秤与暂存台在左、台面在右，左右不重叠，都在舞台里', () => {
    for (const [vw, vh] of VIEWS.filter(([w, h]) => w > h)) {
      const c = core(vw, vh), { w, h, off } = fitStage('landscape', c.w, c.h);
      expect(off.S.x).toBeGreaterThanOrEqual(0);
      expect(off.S.x + 390).toBeLessThanOrEqual(off.B.x + 6);
      expect(off.B.x + 384).toBeLessThanOrEqual(w + 1e-9);
      expect(off.S.y + 48).toBeGreaterThanOrEqual(-1e-9);
      expect(off.S.y + 243).toBeLessThanOrEqual(off.T.y + 589 + 1e-9);
      expect(off.T.y + 672).toBeLessThanOrEqual(h + 1e-9);
      expect(off.B.y + 236).toBeGreaterThanOrEqual(-1e-9);
      expect(off.B.y + 589).toBeLessThanOrEqual(h + 1e-9);
    }
  });

  it('393×852 竖屏药包不小于 44 像素见方', () => {
    const c = core(393, 852);
    expect(fitStage('portrait', c.w, c.h).k * 46).toBeGreaterThanOrEqual(44);
  });

  it('特效按纵向位置归到秤、台面或暂存台', () => {
    const f = fitStage('landscape', 740, 349);
    expect(place(f, 105, 148)).toEqual({ x: 105 + f.off.S.x, y: 148 + f.off.S.y });
    expect(place(f, 195, 300)).toEqual({ x: 195 + f.off.B.x, y: 300 + f.off.B.y });
    expect(place(f, 60, 600)).toEqual({ x: 60 + f.off.T.x, y: 600 + f.off.T.y });
  });
});
