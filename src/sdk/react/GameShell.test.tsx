// GameShell 与 ShootaProvider（REQ-SDK-002，PAGE-PLAY-FRAME）：横屏矮屏收起信息区、展开状态按方向记、
// 各区标 data-shell，不在平台里打开时显示提示。
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createClient, type ShootaClient, type Transport } from '../core';
import type { PlayEnv } from '../../shared/protocol';
import { GameShell, Split } from './GameShell';
import { ShootaProvider } from './ShootaProvider';

const W = { ns: 'shoota', sdk: 2 } as const;
const PORTRAIT: PlayEnv = {
  orientation: 'portrait', fullscreen: false, width: 393, height: 852,
  safe: { top: 0, right: 0, bottom: 0, left: 0 }, run: 'browser', reducedMotion: false,
};
const LANDSCAPE: PlayEnv = { ...PORTRAIT, orientation: 'landscape', width: 852, height: 393 };

function connected(env: PlayEnv, shell?: Record<string, boolean>): ShootaClient {
  let deliver: (d: unknown) => void = () => {};
  const transport: Transport = { embedded: true, send: () => {}, listen: fn => { deliver = fn; return () => {}; } };
  const c = createClient({ game: 'yike', transport });
  deliver({ ...W, type: 'welcome', game: { id: 'yike', title: '一克之差' }, user: { id: 'u', nickname: 'n' }, storage: {}, env, shell });
  c.destroy(); // 停掉 1 秒的等待计时器，状态保留
  return c;
}

const render = (client: ShootaClient) => renderToStaticMarkup(
  <ShootaProvider client={client}>
    <GameShell header={<span>第 5 关 · 剩 3 次</span>} compactHeader={<span>第 5 关</span>} aside={<span>记录</span>} footer={<button>称一下</button>}>
      <canvas />
    </GameShell>
  </ShootaProvider>,
);

describe('GameShell', () => {
  it('竖屏：信息区完整显示，没有展开按钮，各区标 data-shell', () => {
    const html = render(connected(PORTRAIT));
    expect(html).toContain('data-orientation="portrait"');
    expect(html).not.toContain('data-compact');
    expect(html).not.toContain('aria-expanded');
    expect(html).toContain('第 5 关 · 剩 3 次');
    for (const part of ['root', 'header', 'core', 'aside', 'footer']) expect(html).toContain(`data-shell="${part}"`);
  });

  it('横屏且游戏区高不到 500：信息区收成一行，显示 compactHeader 与展开按钮', () => {
    const html = render(connected(LANDSCAPE));
    expect(html).toContain('data-compact=""');
    expect(html).toContain('data-collapsed=""');
    expect(html).toContain('<span>第 5 关</span>');
    expect(html).not.toContain('剩 3 次');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="展开信息"');
  });

  it('玩家在横屏展开过：同一方向下次仍展开', () => {
    const html = render(connected(LANDSCAPE, { landscape: true }));
    expect(html).not.toContain('data-collapsed');
    expect(html).toContain('剩 3 次');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-label="收起信息"');
  });

  it('横屏但高够 500：不收起', () => {
    const html = render(connected({ ...LANDSCAPE, width: 1180, height: 820 }));
    expect(html).toContain('data-orientation="landscape"');
    expect(html).not.toContain('data-compact');
  });

  it('Split 跟着方向排', () => {
    const html = renderToStaticMarkup(<ShootaProvider client={connected(LANDSCAPE)}><Split first="a" second="b" /></ShootaProvider>);
    expect(html).toContain('class="gs-split" data-orientation="landscape"');
  });
});

describe('ShootaProvider', () => {
  it('不在平台里打开：不渲染游戏，提示从 shoota.ai 打开并链到详情页', () => {
    const c = createClient({ game: 'yike', transport: { embedded: false, send: () => {}, listen: () => () => {} } });
    const html = render(c);
    expect(html).toContain('请从 shoota.ai 打开');
    expect(html).toContain('href="/#game-yike"');
    expect(html).not.toContain('data-shell');
  });

  it('等 welcome 时什么都不渲染', () => {
    const c = createClient({ game: 'yike', transport: { embedded: true, send: () => {}, listen: () => () => {} } });
    expect(render(c)).toBe('');
    c.destroy();
  });
});
