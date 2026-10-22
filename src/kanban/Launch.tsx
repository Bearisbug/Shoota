import { Card } from '../ui/Card';
import type { KanbanData, LaunchCounts } from '../shared';
import { num, pct1, regionName } from './format';
import { HBars } from './HBars';
import { BUCKETS, ENV_LABEL, FAST_SEC, fastReady, groupReasons, noAnswer } from './launchMetrics';
import { Empty } from './Panels';
import { Table } from './Table';

const FAST = `${FAST_SEC} 秒内就绪`;

// 一个维度的成功率拆分：国家或地区、游戏、打开环境共用
function Breakdown({ name, label, rows }: { name: string; label: string; rows: { key: string; name: string; c: LaunchCounts }[] }) {
  return (
    <Table head={[name, '开始', '成功率', '失败', '取消', '没回音', FAST]} label={label}>
      {rows.map(({ key, name, c }) => (
        <tr key={key}>
          <th scope="row">{name}</th>
          <td>{num(c.starts)}</td>
          <td className="kb-strong">{pct1(c.ready, c.starts)}</td>
          <td>{num(c.fail)}</td>
          <td>{num(c.cancel)}</td>
          <td>{num(noAnswer(c))}</td>
          <td>{pct1(fastReady(c), c.ready)}</td>
        </tr>
      ))}
    </Table>
  );
}

/* 启动：近 7 天的成功率、没回音、就绪耗时与失败原因（REQ-LAUNCH-006） */
export function Launch({ d }: { d: KanbanData }) {
  const l = d.launch, t = l.total;
  if (!t.starts) return <Card><Empty /></Card>;
  const miss = noAnswer(t);
  const stats: [string, string, string][] = [
    ['启动次数', num(t.starts), `失败 ${num(t.fail)} · 取消 ${num(t.cancel)}`],
    ['启动成功率', pct1(t.ready, t.starts), `${num(t.ready)} 次就绪`],
    ['没回音', pct1(miss, t.starts), `${num(miss)} 次`],
    [FAST, pct1(fastReady(t), t.ready), '占就绪次数'],
    ['全屏成功率', pct1(t.fsOk, t.fsTry), `试过全屏 ${num(t.fsTry)} 次`],
  ];
  const reasons = groupReasons(l.reasons);
  return (
    <div className="kb-launch">
      <Card>
        <dl className="kb-stats">
          {stats.map(([label, value, sub]) => (
            <div key={label} className="kb-stat">
              <dt>{label}</dt>
              <dd className="kb-stat-value">{value}</dd>
              <dd className="kb-stat-sub">{sub}</dd>
            </div>
          ))}
        </dl>
        <p className="kb-note kb-foot">{l.from} 至 {d.today}</p>
      </Card>
      <Card title="按国家或地区 · 前 10" headingLevel={3}>
        <Breakdown name="国家或地区" label="启动按国家或地区" rows={l.byCountry.map(c => ({ key: c.country, name: regionName(c.country), c }))} />
      </Card>
      <Card title="按游戏" headingLevel={3}>
        <Breakdown name="游戏" label="启动按游戏" rows={l.byGame.map(g => ({ key: g.id, name: g.title, c: g }))} />
      </Card>
      <Card title="按打开环境" headingLevel={3}>
        <Breakdown name="打开环境" label="启动按打开环境" rows={l.byEnv.map(e => ({ key: e.env, name: ENV_LABEL[e.env], c: e }))} />
      </Card>
      <div className="kb-pair">
        <Card title="就绪耗时" subtitle={`${num(t.ready)} 次就绪`} headingLevel={3}>
          <HBars
            label="就绪耗时分布"
            rows={BUCKETS.map(b => ({ key: b.key, name: b.label, v: t[b.key], text: `${num(t[b.key])} · ${pct1(t[b.key], t.ready)}` }))}
          />
        </Card>
        <Card title="失败原因" subtitle={`${num(t.fail)} 次失败`} headingLevel={3}>
          {reasons.length ? (
            <Table head={['失败原因', '类别', '次数', '国家或地区']} label="失败原因">
              {reasons.map(r => (
                <tr key={r.reason}>
                  <th scope="row">{r.label}</th>
                  <td className="kb-start">{r.kind}</td>
                  <td>{num(r.n)}</td>
                  <td className="kb-start kb-wrap">{r.places.map(p => `${regionName(p.country)} ${num(p.n)}`).join('、')}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <p className="kb-empty">近 7 天没有失败</p>
          )}
        </Card>
      </div>
    </div>
  );
}
