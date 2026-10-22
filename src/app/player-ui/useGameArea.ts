// 量游戏区（视口扣掉四边安全区）与视口：转屏、地址栏收起、窗口缩放都会变
import { useLayoutEffect, useState, type RefObject } from 'react';
import type { Area } from './geometry';

export interface Viewport { vw: number; vh: number; area: Area }

const same = (a: Viewport, b: Viewport) =>
  a.vw === b.vw && a.vh === b.vh && a.area.x === b.area.x && a.area.y === b.area.y && a.area.w === b.area.w && a.area.h === b.area.h;

export function useGameArea(ref: RefObject<HTMLElement | null>): Viewport | null {
  const [v, setV] = useState<Viewport | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const next = { vw: innerWidth, vh: innerHeight, area: { x: r.left, y: r.top, w: r.width, h: r.height } };
      setV(prev => (prev && same(prev, next) ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // 安全区随转屏变化时游戏区可能只平移不变大小，ResizeObserver 收不到
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [ref]);
  return v;
}
