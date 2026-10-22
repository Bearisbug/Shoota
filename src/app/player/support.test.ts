// 游戏页运行层的小件：启动遥测分批、打开环境判断、changju.ui.v1 偏好。
import { describe, expect, it, vi } from 'vitest';
import { UI_KEY } from '../../shared/save';
import type { LaunchEvent } from '../../shared/telemetry';
import { detectDevice, detectRun, fullscreenMode } from './env';
import { createReporter, LAUNCH_ENDPOINT } from './telemetry';
import { floatSpot, readPrefs, saveFloatSpot, saveShellPref, shellPrefs, updatePrefs } from './uiPrefs';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
const ANDROID_TABLET = 'Mozilla/5.0 (Linux; Android 14; Pixel Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const IPAD_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';
const WECHAT = ANDROID + ' MicroMessenger/8.0.50.2600(0x28003237) WeChat/arm64 Weixin NetType/WIFI Language/zh_CN';

describe('启动遥测', () => {
  const ev = (i: number): LaunchEvent => ({ p: 'start', g: 'g' + i, r: 'legacy', e: 'browser' });

  it('同一轮里的事件合成一次请求，一批最多 10 条；耗时取整并限在 0～600000', () => {
    const fetch = vi.fn(async () => ({}));
    let run: () => void = () => {};
    const r = createReporter({ fetch, defer: fn => { run = fn; } });
    for (let i = 0; i < 12; i++) r.send(ev(i));
    r.send({ p: 'ready', g: 'x', r: 'play', e: 'wechat', ms: 700_000.4 });
    expect(fetch).not.toHaveBeenCalled();
    run();
    expect(fetch).toHaveBeenCalledTimes(2);
    const bodies = fetch.mock.calls.map(c => JSON.parse((c as unknown as [string, RequestInit])[1].body as string).ev as LaunchEvent[]);
    expect(bodies.map(b => b.length)).toEqual([10, 3]);
    expect(bodies[1][2].ms).toBe(600_000);
    expect((fetch.mock.calls[0] as unknown as [string, RequestInit])[0]).toBe(LAUNCH_ENDPOINT);
    expect((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].keepalive).toBe(true);
  });

  it('页面隐藏时没发出的改用 sendBeacon，发不出再退回 keepalive 请求', () => {
    const fetch = vi.fn(async () => ({}));
    const beacon = vi.fn(() => false);
    const r = createReporter({ fetch, beacon, defer: () => {} });
    r.send(ev(1));
    r.flushBeacon();
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    r.flushBeacon();
    expect(beacon).toHaveBeenCalledTimes(1);
  });
});

describe('打开环境与全屏方式（ADR-008）', () => {
  it('安卓手机开局全屏，安卓平板与电脑只给按钮，iPhone 引导添加到主屏幕，微信引导在浏览器打开', () => {
    const mode = (ua: string, standalone = false, touch = 5, supported = true) =>
      fullscreenMode(detectDevice({ ua, maxTouchPoints: touch }), detectRun({ ua, standalone }), supported);
    expect(mode(ANDROID)).toBe('auto');
    expect(mode(ANDROID_TABLET)).toBe('button');
    expect(mode(IPAD_DESKTOP, false, 5)).toBe('button');
    expect(detectDevice({ ua: IPAD_DESKTOP, maxTouchPoints: 5 })).toBe('ipad');
    expect(detectDevice({ ua: IPAD_DESKTOP, maxTouchPoints: 0 })).toBe('desktop');
    expect(mode(IPHONE, false, 5, false)).toBe('install');
    expect(mode(IPHONE, true, 5, false)).toBe('none');
    expect(mode(WECHAT)).toBe('wechat');
    expect(detectRun({ ua: WECHAT, standalone: false })).toBe('wechat');
    expect(mode(ANDROID, false, 5, false)).toBe('none');
  });
});

function memStore(init?: string) {
  const m = new Map<string, string>(init ? [[UI_KEY, init]] : []);
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, raw: () => m.get(UI_KEY) };
}

describe('changju.ui.v1', () => {
  it('悬浮按钮按游戏、按方向记位置，清掉后整条删除', () => {
    const s = memStore();
    saveFloatSpot('yike', 'portrait', { side: 'left', y: 0.2 }, s);
    saveFloatSpot('yike', 'landscape', { side: 'right', y: 0.7 }, s);
    expect(floatSpot('yike', 'portrait', s)).toEqual({ side: 'left', y: 0.2 });
    saveFloatSpot('yike', 'portrait', null, s);
    saveFloatSpot('yike', 'landscape', null, s);
    expect(readPrefs(s).float).toEqual({});
  });

  it('读坏了当作没有偏好；未知字段原样保留', () => {
    expect(readPrefs(memStore('{坏的')).float).toEqual({});
    const s = memStore(JSON.stringify({ v: 1, float: { yike: { portrait: { side: 'up', y: 3 } } }, rotateHintSeen: {}, extra: 7 }));
    expect(floatSpot('yike', 'portrait', s)).toBeNull();
    updatePrefs(p => { p.rotateHintSeen.yike = 1; }, s);
    const raw = JSON.parse(s.raw()!);
    expect(raw.extra).toBe(7);
    expect(raw.rotateHintSeen).toEqual({ yike: 1 });
    expect('shell' in raw).toBe(false); // 没记过展开状态就不多写这个字段
  });

  it('顶部信息区展开状态按游戏、按方向记，只记展开的', () => {
    const s = memStore();
    expect(shellPrefs('yike', s)).toEqual({});
    saveShellPref('yike', 'landscape', true, s);
    expect(shellPrefs('yike', s)).toEqual({ landscape: true });
    saveShellPref('yike', 'landscape', false, s);
    expect(readPrefs(s).shell).toEqual({});
  });
});
