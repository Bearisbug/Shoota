import { useId, type ReactNode } from 'react';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { circleAlert } from '../ui/icons';
import { LargeTitle } from '../ui/LargeTitle';
import { Skeleton } from '../ui/Skeleton';
import type { KanbanData } from '../shared';
import { bjStamp } from './format';
import { Launch } from './Launch';
import { Games, Overview, Retention, Sources } from './Panels';
import { Trend } from './Trend';
import { useKanbanData } from './useKanbanData';

function Section({ title, note, skeleton, d, render }: {
  title: string;
  note?: ReactNode;
  skeleton: ReactNode; // 第一次读到数据之前的占位，按这一块的真实形状摆
  d: KanbanData | null;
  render: (d: KanbanData) => ReactNode;
}) {
  const id = useId();
  return (
    <section className="kb-section" aria-labelledby={id}>
      <h2 id={id} className="kb-h2">{title}</h2>
      {note && <p className="kb-note">{note}</p>}
      {d ? render(d) : skeleton}
    </section>
  );
}

const block = (h: string) => <Skeleton height={h} className="kb-skel" />;

/** 看板页（PAGE-KANBAN）：Worker 验过会话才返回这一页，数字只从 /kanban/data 读 */
export function KanbanApp() {
  const { data: d, loading, error, load } = useKanbanData();
  return (
    <div className="kb-page">
      <LargeTitle
        title="shoota 看板"
        subtitle={<span aria-live="polite">{d ? `数据截至北京时间 ${bjStamp(d.generatedAt)}` : '正在读取…'}</span>}
        leading={<img className="kb-logo" src="/brand/assets/logo/app-icon.svg" alt="" width="32" height="32" />}
        trailing={<Button size="sm" loading={loading} onClick={load}>刷新数据</Button>}
      />
      <main className="kb-main" aria-busy={loading || undefined} data-stale={loading && d ? '' : undefined}>
        {error && (
          <div className="kb-banner" role="alert">
            <Icon src={circleAlert} className="kb-banner-icon" />
            <span className="kb-banner-text">{error}</span>
            <Button size="sm" loading={loading} onClick={load}>重试</Button>
          </div>
        )}
        <p className="kb-note">统计不含登录过看板的浏览器。一个浏览器算一个旅客，日期按北京时间。</p>

        <Section title="概览" d={d} render={d => <Overview d={d} />}
          skeleton={<div className="kb-overview">{block('9rem')}{block('13rem')}</div>} />
        <Section title="每日趋势 · 近 30 天" d={d} render={d => <Trend d={d} />}
          skeleton={<div className="kb-charts">{block('16rem')}{block('16rem')}{block('16rem')}</div>} />
        <Section title="留存 · 近 60 天首访的旅客" d={d} render={d => <Retention d={d} />}
          note="第 N 天留存 = 首访之后第 N 天又来了的比例；还没到那一天的格子显示「—」。"
          skeleton={block('20rem')} />
        <Section title="游戏排行 · 近 30 天" d={d} render={d => <Games d={d} />}
          note="次日回访率 = 第一次玩这款游戏的旅客里，第二天又玩这款的比例。"
          skeleton={block('20rem')} />
        <Section title="来源与设备 · 近 30 天活跃旅客" d={d} render={d => <Sources d={d} />}
          skeleton={block('18rem')} />
        <Section title="启动 · 近 7 天" d={d} render={d => <Launch d={d} />}
          note="成功率 = 就绪次数 ÷ 开始次数；没回音 = 开始次数减去就绪、失败与取消的次数。自动重试算同一次启动，失败页点重试算新的一次。"
          skeleton={<div className="kb-launch">{block('8rem')}{block('20rem')}</div>} />
      </main>
    </div>
  );
}
