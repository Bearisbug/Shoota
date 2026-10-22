import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from './cx';
import './LargeTitle.css';

export interface LargeTitleProps {
  title: string;
  /** 大标题下一行事实，如「11 款 · 本机存档」 */
  subtitle?: ReactNode;
  /** 导航栏左侧，通常是返回按钮 */
  leading?: ReactNode;
  /** 导航栏右侧的动作 */
  trailing?: ReactNode;
  /** 标题下方的附加内容，如分段控件 */
  children?: ReactNode;
  className?: string;
}

/**
 * 页面导航栏，iOS 大标题样式。手机与平板：顶部一条吸顶栏放左右动作，大标题滚到栏下面后栏变成材质底并显示小标题。
 * ≥ 1024px：没有吸顶栏，标题与右侧动作同一行（应用壳的半透明顶栏负责吸顶）。
 */
export function LargeTitle({ title, subtitle, leading, trailing, children, className }: LargeTitleProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  // 大标题整个滑到吸顶栏下沿以上就算收起。栏的下沿 = 吸顶位置（安全区）+ 栏高，视口变了重算
  useEffect(() => {
    const bar = barRef.current;
    const heading = titleRef.current;
    if (!bar || !heading) return;
    let io: IntersectionObserver | undefined;
    let edge = -1;
    const observe = () => {
      const bottom = Math.round(bar.offsetHeight + (parseFloat(getComputedStyle(bar).top) || 0));
      if (bottom === edge) return;
      edge = bottom;
      io?.disconnect();
      io = new IntersectionObserver(
        ([entry]) => setCollapsed(!entry.isIntersecting && entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0)),
        { rootMargin: `-${bottom}px 0px 0px 0px` },
      );
      io.observe(heading);
    };
    observe();
    window.addEventListener('resize', observe);
    return () => {
      window.removeEventListener('resize', observe);
      io?.disconnect();
    };
  }, []);

  return (
    <header className={cx('ui-nav', className)} data-collapsed={collapsed || undefined}>
      <div ref={barRef} className="ui-nav-bar">
        <div className="ui-nav-leading">{leading}</div>
        <div className="ui-nav-inline-title" aria-hidden="true">{title}</div>
        <div className="ui-nav-trailing">{trailing}</div>
      </div>
      <div className="ui-nav-large">
        <h1 ref={titleRef} className="ui-nav-title">{title}</h1>
        {subtitle && <p className="ui-nav-subtitle">{subtitle}</p>}
      </div>
      {children && <div className="ui-nav-accessory">{children}</div>}
    </header>
  );
}
