// 改写后的游戏共用的外壳（ADR-006、FLOW-ROTATE S4）：顶部信息区、核心区、侧栏与底栏，四边避开安全区。
// 横屏且游戏区高不到 500 像素时顶部信息区收成一行，点开可展开；展开状态按方向记在平台，下次同一方向仍展开。
// 各区标 data-shell，核心区占比的测量脚本取 data-shell="core" 的矩形。

import { useId, type ReactNode } from 'react';
import { useClientValue, useLayout, useShoota } from './ShootaProvider';
import './GameShell.css';

export interface GameShellProps {
  /** 顶部信息区：标题、关卡、分数这一类，不放主要操作 */
  header?: ReactNode;
  /** 收成一行时显示的内容，不给就把 header 截成一行 */
  compactHeader?: ReactNode;
  /** 横屏放在核心区右边，竖屏放在核心区下面 */
  aside?: ReactNode;
  /** 底部操作区 */
  footer?: ReactNode;
  /** 核心区：棋盘、画布、主要操作 */
  children: ReactNode;
}

export function GameShell({ header, compactHeader, aside, footer, children }: GameShellProps) {
  const client = useShoota();
  const layout = useLayout();
  const prefs = useClientValue(client, c => c.shell);
  const headerId = useId();
  const expanded = !layout.compact || prefs[layout.orientation] === true;
  const collapsed = header !== undefined && !expanded;
  return (
    <div className="gs-root" data-shell="root" data-orientation={layout.orientation} data-compact={layout.compact ? '' : undefined}>
      {header !== undefined && (
        <header className="gs-header" data-shell="header" data-collapsed={collapsed ? '' : undefined}>
          <div id={headerId} className="gs-header-content">{collapsed && compactHeader !== undefined ? compactHeader : header}</div>
          {layout.compact && (
            <button
              type="button"
              className="gs-toggle gs-hit gs-control"
              aria-expanded={!collapsed}
              aria-controls={headerId}
              aria-label={collapsed ? '展开信息' : '收起信息'}
              onClick={() => client.setShellExpanded(layout.orientation, collapsed)}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
                <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </header>
      )}
      <div className="gs-body">
        <main className="gs-core" data-shell="core">{children}</main>
        {aside !== undefined && <aside className="gs-aside" data-shell="aside">{aside}</aside>}
      </div>
      {footer !== undefined && <footer className="gs-footer" data-shell="footer">{footer}</footer>}
    </div>
  );
}

/** 方向感知的两栏：横屏左右排，竖屏上下排；first 占剩下的空间 */
export function Split({ first, second }: { first: ReactNode; second: ReactNode }) {
  const { orientation } = useLayout();
  return (
    <div className="gs-split" data-orientation={orientation}>
      <div className="gs-split-first">{first}</div>
      <div className="gs-split-second">{second}</div>
    </div>
  );
}
