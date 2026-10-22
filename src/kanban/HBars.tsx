// 横条：一行一个类目，条长按本组最大值算，条端写数字；用于地区前 10 与就绪耗时分桶
export interface HBar { key: string; name: string; v: number; text: string }

export function HBars({ rows, label }: { rows: HBar[]; label: string }) {
  const top = Math.max(1, ...rows.map(r => r.v));
  return (
    <ul className="kb-hbars" role="list" aria-label={label}>
      {rows.map(r => (
        <li key={r.key} className="kb-hrow">
          <span className="kb-hrow-name">{r.name}</span>
          <span className="kb-hrow-track">
            {r.v > 0 && <span className="kb-hrow-fill" style={{ inlineSize: Math.max(2, (r.v / top) * 100) + '%' }} />}
          </span>
          <span className="kb-hrow-n">{r.text}</span>
        </li>
      ))}
    </ul>
  );
}
