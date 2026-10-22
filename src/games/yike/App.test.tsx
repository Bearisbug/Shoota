// 界面接线（REQ-SDK-001～003、PAGE-PLAY-FRAME）：不在平台里打开只显示提示；连上后从存档的关卡开局，只经 SDK 写存档；
// 横屏矮屏顶部信息区收成一行，展开过的方向下次仍展开；道具竖屏在下、横屏在右；舞台按块平移。
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createClient, type OutMessage, type ShootaClient, type Transport } from '../../sdk/core';
import { ShootaProvider } from '../../sdk/react';
import type { PlayEnv } from '../../shared/protocol';
import { App, GameView, StageView } from './App';
import { SKEY, YikeGame, type Sfx } from './engine';
import { fitStage } from './fit';
import { scaleGeom, tileSpot } from './model';

const quiet: Sfx = { tap() {}, sel() {}, no() {}, near() {}, ding() {}, thud() {}, lose() {}, win() {}, unlock() {} };
const PORTRAIT: PlayEnv = { orientation: 'portrait', fullscreen: false, width: 393, height: 852, safe: { top: 0, right: 0, bottom: 0, left: 0 }, run: 'browser', reducedMotion: false };
const LANDSCAPE: PlayEnv = { ...PORTRAIT, orientation: 'landscape', width: 852, height: 393 };
const LEVEL5 = JSON.stringify({ level: 5, attempts: { 1: 1, 2: 2, 3: 1, 4: 3, 5: 1 }, best: { 1: 3, 2: 2, 3: 3, 4: 1 }, sound: true, intro: true });

function connect(env: PlayEnv, storage: Record<string, string> = {}, shell?: Record<string, boolean>) {
  const sent: OutMessage[] = [];
  let deliver: (d: unknown) => void = () => {};
  const transport: Transport = { embedded: true, send: m => { sent.push(m); }, listen: fn => { deliver = fn; return () => {}; } };
  const client = createClient({ game: 'yike', transport });
  deliver({ ns: 'shoota', sdk: 2, type: 'welcome', game: { id: 'yike', title: '一克之差' }, user: { id: 'u', nickname: 'n' }, storage, env, shell });
  client.destroy();
  return { client, sent };
}
const view = (client: ShootaClient, game: YikeGame) => renderToStaticMarkup(<ShootaProvider client={client}><GameView game={game} /></ShootaProvider>);
const level5 = (client: ShootaClient) => { const g = new YikeGame({ storage: client.storage, sfx: quiet }); g.start(); return g; };

describe('入口', () => {
  it('不在平台里打开：只显示「请从 shoota.ai 打开」，不开局、不读写存档', () => {
    const transport: Transport = { embedded: false, send: () => { throw new Error('不该发消息'); }, listen: () => () => {} };
    const html = renderToStaticMarkup(<ShootaProvider client={createClient({ game: 'yike', transport })}><App /></ShootaProvider>);
    expect(html).toContain('请从 shoota.ai 打开');
    expect(html).not.toContain('一克之差');
  });

  it('连上平台：旧版第 5 关的存档从第 5 关开局，挑战次数经 SDK 写回同一个键', () => {
    const { client, sent } = connect(PORTRAIT, { [SKEY]: LEVEL5 });
    const html = renderToStaticMarkup(<ShootaProvider client={client}><App /></ShootaProvider>);
    expect(html).toContain('第 5 关');
    expect(html).not.toContain('开始抓药'); // 看过说明不再弹
    const writes = sent.filter(m => m.type === 'storage');
    expect(writes).toEqual([{ ns: 'shoota', sdk: 2, type: 'storage', op: 'set', key: SKEY, value: JSON.stringify({ ...JSON.parse(LEVEL5), attempts: { 1: 1, 2: 2, 3: 1, 4: 3, 5: 2 } }) }]);
  });
});

describe('GameShell 排版', () => {
  it('竖屏：顶部信息区两行不折叠，道具一排在核心区下面', () => {
    const { client } = connect(PORTRAIT, { [SKEY]: LEVEL5 });
    const html = view(client, level5(client));
    expect(html).toContain('class="yk-head"');
    expect(html).not.toContain('aria-expanded');
    expect(html).toContain('data-dir="row"');
    expect(html).toMatch(/data-shell="core".*data-shell="aside"/s);
  });

  it('横屏 852×393：顶部信息区收成一行，仍有关卡、统计和两个按钮，带展开按钮；道具一列在右', () => {
    const { client } = connect(LANDSCAPE, { [SKEY]: LEVEL5 });
    const html = view(client, level5(client));
    expect(html).toContain('data-collapsed=""');
    expect(html).toContain('class="yk-line"');
    expect(html).not.toContain('class="yk-head"');
    expect(html).toMatch(/<span class="chip">第 (<!-- -->)?5(<!-- -->)? 关<\/span>/);
    expect(html).toContain('次挑战');
    expect(html).toContain('重来');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('data-dir="col"');
  });

  it('横屏展开过：同一方向下次打开仍是两行完整信息', () => {
    const { client } = connect(LANDSCAPE, { [SKEY]: LEVEL5 }, { landscape: true });
    const html = view(client, level5(client));
    expect(html).toContain('class="yk-head"');
    expect(html).toContain('aria-expanded="true"');
  });

  it('弹窗开着时背后的信息区、道具与核心区都 inert，弹窗有标题', () => {
    const { client } = connect(PORTRAIT);
    const g = new YikeGame({ storage: client.storage, sfx: quiet });
    g.start();
    const html = view(client, g);
    expect(html.match(/inert=""/g)).toHaveLength(3);
    expect(html).toContain('role="dialog" aria-modal="true" aria-labelledby="mTitle"');
    expect(html).toContain('>开始抓药</button>');
  });
});

describe('舞台', () => {
  it('横屏：药包按所在的块平移，舞台按 k 缩放', () => {
    const { client } = connect(LANDSCAPE, { [SKEY]: LEVEL5 });
    const g = level5(client), G = g.G!, fit = fitStage('landscape', 740, 349);
    const html = renderToStaticMarkup(<StageView game={g} fit={fit} />);
    expect(html).toContain(`transform:scale(${fit.k})`);
    expect(html.match(/<button type="button"[^>]*class="tile/g)).toHaveLength(G.tiles.length);
    const t = G.tiles.find(x => x.src === 'b')!, s = tileSpot(G, t, G.scales.map((sc, i) => scaleGeom(G, sc, i)))!;
    expect(html).toContain(`translate(${s.x + fit.off.B.x}px,${s.y + fit.off.B.y}px) scale(1)`);
    expect(html).toContain(`left:${fit.off.S.x}px;top:${fit.off.S.y}px`);
  });
});
