import { Card } from '../ui/Card';
import type { KanbanData, PeriodStat } from '../shared';
import { dur, num, pct, regionName } from './format';
import { HBars } from './HBars';
import { Table } from './Table';

export const Empty = () => <p className="kb-empty">还没有数据</p>;

/* 概览：唯一的大号主数字是今日活跃，其余进对照表 */
export function Overview({ d }: { d: KanbanData }) {
  const o = d.overview, w: PeriodStat[] = [o.today, o.d7, o.d30];
  const per = (x: PeriodStat) => (x.active ? dur(x.seconds / x.active) : '—');
  const rows: [string, (x: PeriodStat) => string][] = [
    ['活跃旅客', x => num(x.active)],
    ['新旅客', x => num(x.new)],
    ['游玩时长', x => dur(x.seconds)],
    ['人均游玩时长', per],
  ];
  return (
    <div className="kb-overview">
      <Card className="kb-hero">
        <span className="kb-hero-label">今日活跃旅客</span>
        <span className="kb-hero-value">{num(o.today.active)}</span>
      </Card>
      <Card>
        <Table head={['', '今日', '近 7 天', '近 30 天']} label="概览">
          {rows.map(([label, f]) => (
            <tr key={label}><th scope="row">{label}</th>{w.map((x, i) => <td key={i}>{f(x)}</td>)}</tr>
          ))}
        </Table>
        <p className="kb-note kb-foot">近 30 天复制存档码 {num(o.backups30)} 次，恢复进度 {num(o.restores30)} 次</p>
      </Card>
    </div>
  );
}

/* 留存：按比例分 4 档，取 brand 顺序色阶 1–4 档 */
function Heat({ r, n }: { r: number | null; n: number }) {
  if (r == null) return <td className="kb-dim" aria-label="还没到期">—</td>;
  const p = n ? r / n : 0, level = p >= 0.5 ? 4 : p >= 0.3 ? 3 : p >= 0.15 ? 2 : p > 0 ? 1 : 0;
  return <td className={'kb-heat' + (level ? ' kb-heat-' + level : '')}>{pct(r, n)}</td>;
}

export function Retention({ d }: { d: KanbanData }) {
  if (!d.retention.length) return <Card><Empty /></Card>;
  const early = d.retention.some(r => r.day >= d.statsStart && r.day <= d.priorSince);
  return (
    <Card>
      <Table head={['首访日期', '新旅客', '次日', '7 日', '30 日']} label="留存">
        {d.retention.map(r => (
          <tr key={r.day}>
            <th scope="row">{r.day}</th>
            <td>{num(r.n)}</td>
            <Heat r={r.r1} n={r.n} />
            <Heat r={r.r7} n={r.n} />
            <Heat r={r.r30} n={r.n} />
          </tr>
        ))}
      </Table>
      {early && (
        <p className="kb-note kb-foot">{d.statsStart} 是统计首日；{d.statsStart} 到 {d.priorSince} 首访的新旅客含统计上线前就玩过的人。</p>
      )}
    </Card>
  );
}

export function Games({ d }: { d: KanbanData }) {
  if (!d.games.length) return <Card><Empty /></Card>;
  return (
    <Card>
      <Table head={['游戏', '玩家', '开局', '总时长', '人均时长', '次日回访率']} label="游戏排行">
        {d.games.map(g => (
          <tr key={g.id}>
            <th scope="row">{g.title}</th>
            <td>{num(g.players)}</td>
            <td>{num(g.starts)}</td>
            <td>{dur(g.seconds)}</td>
            <td>{g.players ? dur(g.seconds / g.players) : '—'}</td>
            <td>{g.nextDay.n ? `${pct(g.nextDay.r, g.nextDay.n)}（${g.nextDay.r}/${g.nextDay.n}）` : '—'}</td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}

export function Sources({ d }: { d: KanbanData }) {
  const s = d.sources;
  if (!s.total) return <Card><Empty /></Card>;
  const shares: [string, number][] = [['微信内打开', s.wechat], ['手机', s.mobile], ['电脑', s.desktop]];
  return (
    <Card>
      <dl className="kb-stats">
        {shares.map(([label, n]) => (
          <div key={label} className="kb-stat">
            <dt>{label}</dt>
            <dd className="kb-stat-value">{pct(n, s.total)}</dd>
            <dd className="kb-stat-sub">{num(n)} / {num(s.total)} 人</dd>
          </div>
        ))}
      </dl>
      <h3 className="kb-sub">地区前 10</h3>
      <HBars label="地区前 10" rows={s.countries.map(c => ({ key: c.code, name: regionName(c.code), v: c.n, text: num(c.n) }))} />
    </Card>
  );
}
