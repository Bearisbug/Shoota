import { describe, expect, it } from 'vitest';
import { bjStamp, dur, md, num, pct, pct1, regionName } from './format';

describe('看板格式（沿用旧版）', () => {
  it('数字千分位，空值记 0', () => {
    expect(num(1234567)).toBe('1,234,567');
    expect(num(undefined)).toBe('0');
  });

  it('百分比取整，分母为 0 显示「—」', () => {
    expect(pct(3, 10)).toBe('30%');
    expect(pct(1, 3)).toBe('33%');
    expect(pct(0, 0)).toBe('—');
  });

  it('启动面板的比例保留一位小数，整数不带 .0', () => {
    expect(pct1(97, 100)).toBe('97%');
    expect(pct1(994, 1000)).toBe('99.4%');
    expect(pct1(4, 1000)).toBe('0.4%');
    expect(pct1(0, 0)).toBe('—');
  });

  it('时长：60 秒以内按秒，一小时以内按分钟，再长按小时', () => {
    expect(dur(0)).toBe('0 秒');
    expect(dur(59.4)).toBe('59 秒');
    expect(dur(90)).toBe('2 分钟');
    expect(dur(3599)).toBe('60 分钟');
    expect(dur(5400)).toBe('1.5 小时');
  });

  it('地区名：国内通行写法优先，其余用中文短名，认不出的原样显示', () => {
    expect(regionName('XX')).toBe('未知');
    expect(regionName('CN')).toBe('中国大陆');
    expect(regionName('TW')).toBe('中国台湾');
    expect(regionName('US')).toBe('美国');
    expect(regionName('T1')).toBe('T1');
  });

  it('日期与截至时间按北京时间', () => {
    expect(md('2026-10-05')).toBe('10/05');
    expect(bjStamp(Date.parse('2026-10-21T16:05:00Z'))).toBe('2026-10-22 00:05');
  });
});
