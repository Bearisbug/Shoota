import type { ReactNode } from 'react';

// 看板表格：首列左对齐，其余数字列右对齐。窄屏时表格自己横向滚动，页面不出横向滚动；
// 滚动区可聚焦，键盘也能左右滚
export function Table({ head, label, children }: { head: string[]; label: string; children: ReactNode }) {
  return (
    <div className="kb-table focus-ring" role="region" aria-label={label} tabIndex={0}>
      <table>
        <thead>
          <tr>{head.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
