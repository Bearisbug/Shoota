import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cx } from './cx';
import './AppShell.css';

export interface NavItem {
  id: string;
  /** 用内容的具体名，如「游戏库」「存档」 */
  label: string;
  href: string;
  /** 通常是 <Icon />（装饰性） */
  icon: ReactNode;
  /** 计数之类的角标 */
  badge?: ReactNode;
}

export interface NavGroup {
  id: string;
  /** 分组名，只在 ≥ 1024px 的侧栏显示 */
  label?: string;
  items: readonly NavItem[];
}

export interface AppShellProps {
  /** ≥ 1024px 侧栏顶部的完整字标 */
  brand: ReactNode;
  /** 窄侧栏顶部的图标 */
  brandMark: ReactNode;
  nav: readonly NavGroup[];
  /** 手机竖屏底部标签栏放哪几项（导航项 id），最多 5 项；默认取全部导航项的前 5 项 */
  tabs?: readonly string[];
  /** 当前页对应的导航项 id */
  activeId?: string;
  /** ≥ 1024px 半透明顶栏右侧的全局控件；不给就没有顶栏。窄屏的页面动作放进 LargeTitle */
  toolbar?: ReactNode;
  children: ReactNode;
}

/**
 * 平台应用壳。三种排布由视口决定：
 * - 手机竖屏：底部标签栏；
 * - 手机横屏（高 ≤ 500px）与 760–1023px：左侧窄栏，图标在上文字在下；
 * - ≥ 1024px 且高 > 500px：分组侧栏，加半透明吸顶顶栏。
 * 主滚动始终在页面根上，手机浏览器滚动时能收起地址栏。
 */
export function AppShell({ brand, brandMark, nav, tabs, activeId, toolbar, children }: AppShellProps) {
  const items = nav.flatMap(g => g.items);
  const tabItems = (tabs ? tabs.flatMap(id => items.filter(i => i.id === id)) : items).slice(0, 5);
  const sentinel = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const hasToolbar = toolbar != null;

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [hasToolbar]);

  return (
    <div className="ui-shell">
      <aside className="ui-shell-side">
        <div className="ui-shell-brand">
          <span className="ui-shell-brand-full">{brand}</span>
          <span className="ui-shell-brand-mark">{brandMark}</span>
        </div>
        <nav className="ui-shell-nav" aria-label="主导航">
          {nav.map(group => <NavSection key={group.id} group={group} activeId={activeId} />)}
        </nav>
      </aside>
      <div className="ui-shell-main">
        {hasToolbar && (
          <>
            <div ref={sentinel} className="ui-shell-sentinel" aria-hidden="true" />
            <header className="ui-shell-topbar" data-scrolled={scrolled || undefined}>{toolbar}</header>
          </>
        )}
        <main className="ui-shell-content">{children}</main>
      </div>
      <nav className="ui-tabbar" aria-label="主导航">
        <ul role="list">
          {tabItems.map(item => (
            <li key={item.id}><NavLink item={item} active={item.id === activeId} className="ui-tab" /></li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function NavSection({ group, activeId }: { group: NavGroup; activeId?: string }) {
  const labelId = useId();
  return (
    <div className="ui-shell-group" role="group" aria-labelledby={group.label ? labelId : undefined}>
      {group.label && <h2 id={labelId} className="ui-shell-group-label">{group.label}</h2>}
      <ul role="list">
        {group.items.map(item => (
          <li key={item.id}><NavLink item={item} active={item.id === activeId} className="ui-navlink" /></li>
        ))}
      </ul>
    </div>
  );
}

function NavLink({ item, active, className }: { item: NavItem; active: boolean; className: string }) {
  return (
    <a href={item.href} className={cx(className, 'state-layer', 'focus-ring')} aria-current={active ? 'page' : undefined}>
      <span className="ui-navlink-icon">{item.icon}</span>
      <span className="ui-navlink-label">{item.label}</span>
      {item.badge != null && <span className="ui-navlink-badge">{item.badge}</span>}
    </a>
  );
}
