import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { emptyData, sampleData } from './fixtures';
import { KanbanApp } from './KanbanApp';
import { Launch } from './Launch';
import { Games, Overview, Retention, Sources } from './Panels';
import { Trend } from './Trend';

// 渲染成 HTML，再拆出表格行与纯文本来断言
const html = (el: ReactElement) => renderToStaticMarkup(el);
const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const rows = (h: string) => [...h.matchAll(/<tr>(.*?)<\/tr>/g)].map(m => text(m[1]));

describe('原有五块（TC-011～TC-015）', () => {
  it('概览：三个时段的活跃、新增、时长与人均，表下写备份与恢复次数', () => {
    const h = html(<Overview d={sampleData()} />);
    expect(text(h)).toContain('今日活跃旅客 12');
    expect(rows(h)).toEqual([
      '今日 近 7 天 近 30 天',
      '活跃旅客 12 40 1,234',
      '新旅客 5 18 300',
      '游玩时长 1.5 小时 10.0 小时 200.0 小时',
      '人均游玩时长 8 分钟 15 分钟 10 分钟',
    ]);
    expect(text(h)).toContain('近 30 天复制存档码 7 次，恢复进度 2 次');
  });

  it('趋势：三张图各自的今天读数、峰值标注与每日数字表', () => {
    const h = html(<Trend d={sampleData()} />);
    const t = text(h);
    expect(t).toContain('活跃旅客 · 今天 30');
    expect(t).toContain('新旅客 · 今天 2');
    expect(t).toContain('游玩时长 · 今天 41.7 小时');
    expect(t).toContain('最高 41.7 小时');
    expect(t).toContain('查看每日数字');
    expect(h).toContain('aria-label="活跃旅客，近 30 天，最高 30"');
    expect(h.match(/<svg[^>]*tabindex="0"/g)).toHaveLength(3); // 键盘能进图逐天看数
    expect(rows(h)).toContain('2026-10-22 30'); // 每日数字表倒序，第一行是今天
  });

  it('留存：比例取整、未到期显示「—」，有统计首日的行时加注', () => {
    const h = html(<Retention d={sampleData()} />);
    expect(rows(h)).toEqual([
      '首访日期 新旅客 次日 7 日 30 日',
      '2026-10-22 5 — — —',
      '2026-10-12 10 30% 10% —',
      '2026-10-20 4 50% — —',
    ]);
    expect(h).toContain('aria-label="还没到期"');
    expect(h).toContain('kb-heat kb-heat-3'); // 30% 落在第 3 档
    expect(text(h)).toContain('2026-10-20 是统计首日；2026-10-20 到 2026-10-21 首访的新旅客含统计上线前就玩过的人。');
  });

  it('留存：没有统计首日附近的行时不加注', () => {
    const d = sampleData();
    d.retention = d.retention.filter(r => r.day !== '2026-10-20');
    expect(text(html(<Retention d={d} />))).not.toContain('统计首日');
  });

  it('游戏排行：中文名、人均与「x%（r/n）」，没人玩时显示「—」', () => {
    expect(rows(html(<Games d={sampleData()} />))).toEqual([
      '游戏 玩家 开局 总时长 人均时长 次日回访率',
      'F1-Team Principal 3 9 2.0 小时 40 分钟 50%（1/2）',
      '一克之差 0 0 0 秒 — —',
    ]);
  });

  it('来源与设备：三项占比与人数，地区前 10 用中文名', () => {
    const t = text(html(<Sources d={sampleData()} />));
    expect(t).toContain('微信内打开 25% 1 / 4 人');
    expect(t).toContain('手机 75% 3 / 4 人');
    expect(t).toContain('电脑 25% 1 / 4 人');
    expect(t).toContain('地区前 10 中国大陆 3 未知 1');
  });

  it('空数据：概览为 0 与「—」，留存、排行、来源显示「还没有数据」（TC-015 第 1 步）', () => {
    const d = emptyData();
    expect(rows(html(<Overview d={d} />))).toContain('人均游玩时长 — — —');
    expect(text(html(<Overview d={d} />))).toContain('今日活跃旅客 0');
    expect(rows(html(<Overview d={d} />))).toContain('游玩时长 0 秒 0 秒 0 秒');
    for (const P of [Retention, Games, Sources]) expect(text(html(<P d={d} />))).toBe('还没有数据');
    expect(text(html(<Trend d={d} />))).not.toContain('最高');
  });
});

describe('启动面板（REQ-LAUNCH-006）', () => {
  it('场景「看板查看启动成功率」：中国大陆 100 次开始、97 次就绪、2 次 net-stall', () => {
    const h = html(<Launch d={sampleData()} />);
    const r = rows(h);
    expect(r).toContain('国家或地区 开始 成功率 失败 取消 没回音 3 秒内就绪');
    expect(r).toContain('中国大陆 100 97% 2 0 1 92.8%');
    expect(r).toContain('美国 3 66.7% 1 0 0 100%');
    expect(r).toContain('网络中途卡住 网络 3 中国大陆 2、美国 1');
  });

  it('按游戏与打开环境拆分，分母为 0 显示「—」', () => {
    const r = rows(html(<Launch d={sampleData()} />));
    expect(r).toContain('一克之差 100 97% 2 0 1 92.8%');
    expect(r).toContain('微信内置浏览器 100 97% 2 0 1 92.8%');
    expect(r).toContain('主屏幕应用 0 — 0 0 0 —');
  });

  it('汇总与就绪耗时分桶', () => {
    const t = text(html(<Launch d={sampleData()} />));
    expect(t).toContain('启动次数 103 失败 3 · 取消 0');
    expect(t).toContain('启动成功率 96.1% 99 次就绪');
    expect(t).toContain('没回音 1% 1 次');
    expect(t).toContain('3 秒内就绪 92.9% 占就绪次数');
    expect(t).toContain('全屏成功率 90% 试过全屏 10 次');
    expect(t).toContain('≤ 1 秒 60 · 60.6%');
    expect(t).toContain('超过 30 秒 0 · 0%');
    expect(t).toContain('2026-10-16 至 2026-10-22');
  });

  it('没有启动时显示「还没有数据」；有启动没失败时失败原因单独说明', () => {
    expect(text(html(<Launch d={emptyData()} />))).toBe('还没有数据');
    const d = sampleData();
    d.launch.reasons = [];
    expect(text(html(<Launch d={d} />))).toContain('近 7 天没有失败');
  });
});

describe('页面', () => {
  it('第一次读数之前：标题、「正在读取…」、说明与各块骨架', () => {
    const h = html(<KanbanApp />);
    const t = text(h);
    expect(t).toContain('shoota 看板');
    expect(t).toContain('正在读取…');
    expect(t).toContain('统计不含登录过看板的浏览器。一个浏览器算一个旅客，日期按北京时间。');
    for (const title of ['概览', '每日趋势 · 近 30 天', '留存 · 近 60 天首访的旅客', '游戏排行 · 近 30 天', '来源与设备 · 近 30 天活跃旅客', '启动 · 近 7 天']) {
      expect(t).toContain(title);
    }
    expect(h).toContain('aria-busy="true"');
    expect(t).toContain('刷新数据');
  });
});
