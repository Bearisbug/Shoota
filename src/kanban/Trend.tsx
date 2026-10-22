import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Card } from '../ui/Card';
import type { KanbanData } from '../shared';
import { dur, md, num } from './format';
import { Table } from './Table';

interface Point { day: string; v: number }

// 柱状图的几何：高 150，上留 18 给峰值标注，下留 20 给横轴文字；宽度跟着容器
const H = 150, TOP = 18, BOTTOM = 20, CH = H - TOP - BOTTOM;
const MIN_W = 240;

// 三张小柱状图各用自己的刻度，不画双纵轴；柱宽 ≤ 24、柱间至少 2 的底色缝、顶部 4 圆角，今天那根用深一档
function ColumnChart({ title, series, fmt }: { title: string; series: Point[]; fmt: (v: number) => string }) {
  const titleId = useId();
  const plotRef = useRef<HTMLDivElement>(null);
  const peakRef = useRef<SVGTextElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(320);
  const [peakHalf, setPeakHalf] = useState(0);
  const [hover, setHover] = useState(-1);
  const [tipHalf, setTipHalf] = useState(0);

  useLayoutEffect(() => {
    const plot = plotRef.current;
    if (!plot) return;
    const measure = () => setW(Math.max(plot.clientWidth, MIN_W));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(plot);
    return () => ro.disconnect();
  }, []);

  const max = Math.max(0, ...series.map(s => s.v));
  const band = w / series.length, bw = Math.min(24, band - 2);
  const maxIdx = max > 0 ? series.findIndex(s => s.v === max) : -1;
  const peakText = maxIdx >= 0 ? '最高 ' + fmt(max) : '';
  const barH = (v: number) => (max > 0 ? Math.max(v > 0 ? 2 : 0, (v / max) * CH) : 0);
  const mid = (i: number) => i * band + band / 2;

  // 峰值在头尾几天时，居中的标注会伸出图外：量出实际宽度后把它收回图内（TC-024）
  useLayoutEffect(() => {
    setPeakHalf(peakRef.current ? peakRef.current.getComputedTextLength() / 2 : 0);
  }, [peakText, w]);
  useLayoutEffect(() => {
    if (hover >= 0 && tipRef.current) setTipHalf(tipRef.current.offsetWidth / 2);
  }, [hover]);

  // 触屏点一下看数，点图外收起；鼠标移出即收起
  const active = hover >= 0;
  useEffect(() => {
    if (!active) return;
    const off = (e: globalThis.PointerEvent) => {
      if (!plotRef.current?.contains(e.target as Node)) setHover(-1);
    };
    document.addEventListener('pointerdown', off);
    return () => document.removeEventListener('pointerdown', off);
  }, [active]);

  const last = series.length - 1;
  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover(Math.min(last, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * series.length))));
  };

  // 键盘与悬停看到的一样：Tab 进图先指今天，左右键逐天移动，Home、End 跳到首尾，离开即收起
  const step = (e: KeyboardEvent<SVGSVGElement>) => {
    const at = hover < 0 ? last : hover;
    const to = e.key === 'ArrowLeft' ? at - 1 : e.key === 'ArrowRight' ? at + 1 : e.key === 'Home' ? 0 : e.key === 'End' ? last : null;
    if (to === null) return;
    e.preventDefault();
    setHover(Math.min(last, Math.max(0, to)));
  };

  const clamp = (x: number, half: number) => Math.min(w - half, Math.max(half, x));
  const tip = hover >= 0 ? series[hover] : null;

  return (
    <Card className="kb-chart" aria-labelledby={titleId}>
      <h3 id={titleId} className="kb-chart-title">{title} · 今天 <span className="kb-chart-now">{fmt(series[last].v)}</span></h3>
      <div ref={plotRef} className="kb-plot">
        <svg
          width="100%"
          height={H}
          viewBox={`0 0 ${w} ${H}`}
          role="img"
          aria-label={`${title}，近 30 天，最高 ${fmt(max)}`}
          className="focus-ring"
          tabIndex={0}
          data-hover={active || undefined}
          onPointerMove={pick}
          onPointerDown={pick}
          onPointerLeave={e => { if (e.pointerType === 'mouse') setHover(-1); }}
          onFocus={() => setHover(h => (h < 0 ? last : h))}
          onBlur={() => setHover(-1)}
          onKeyDown={step}
        >
          <line className="kb-axis" x1={0} x2={w} y1={TOP + CH + 0.5} y2={TOP + CH + 0.5} />
          {series.map((s, i) => {
            const h = barH(s.v);
            if (h <= 0) return null;
            const x = i * band + (band - bw) / 2, y = TOP + CH - h, r = Math.min(4, h, bw / 2);
            return (
              <path
                key={s.day}
                className={'kb-bar' + (i === last ? ' is-today' : '') + (i === hover ? ' is-hover' : '')}
                d={`M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${y + h}Z`}
              />
            );
          })}
          {peakText && (
            <text ref={peakRef} x={clamp(mid(maxIdx), peakHalf)} y={TOP - 5} textAnchor="middle">{peakText}</text>
          )}
          <text x={0} y={H - 4}>{md(series[0].day)}</text>
          <text x={w} y={H - 4} textAnchor="end">今天</text>
        </svg>
        {tip && (
          <div
            ref={tipRef}
            className="kb-tip"
            style={{ left: clamp(mid(hover), tipHalf), top: TOP + CH - barH(tip.v) - 6 }}
            aria-hidden="true"
          >
            <b>{fmt(tip.v)}</b>
            <span>{tip.day}</span>
          </div>
        )}
      </div>
      <details className="kb-details">
        <summary className="focus-ring">查看每日数字</summary>
        <Table head={['日期', title]} label={`${title}每日数字`}>
          {series.slice().reverse().map(s => (
            <tr key={s.day}><th scope="row">{s.day}</th><td>{fmt(s.v)}</td></tr>
          ))}
        </Table>
      </details>
    </Card>
  );
}

export function Trend({ d }: { d: KanbanData }) {
  return (
    <div className="kb-charts">
      <ColumnChart title="活跃旅客" series={d.trend.map(t => ({ day: t.day, v: t.active }))} fmt={num} />
      <ColumnChart title="新旅客" series={d.trend.map(t => ({ day: t.day, v: t.new }))} fmt={num} />
      <ColumnChart title="游玩时长" series={d.trend.map(t => ({ day: t.day, v: t.seconds }))} fmt={dur} />
    </div>
  );
}
