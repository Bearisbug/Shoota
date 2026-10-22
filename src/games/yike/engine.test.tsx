// 玩法、数值、文案与存档和旧版逐步一致（REQ-SDK-003）：同一份存档、同一串操作分别喂给旧版脚本与改写版，
// 每一步比内部状态、存档原文、药包与秤的位置和样子、顶栏、道具、弹窗、提示条与飘字。
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient, type ShootaClient, type Transport } from '../../sdk/core';
import { ShootaProvider } from '../../sdk/react';
import type { PlayEnv } from '../../shared/protocol';
import { GameView } from './App';
import { SKEY, YikeGame, type Fx, type GameState, type Sfx } from './engine';
import { scaleGeom, scaleLabel, tileLook, tileSpot, trayGeom } from './model';
import { plain, runLegacy, type FakeEl, type LegacyGame } from './testing/legacy';

const quiet: Sfx = { tap() {}, sel() {}, no() {}, near() {}, ding() {}, thud() {}, lose() {}, win() {}, unlock() {} };
const memory = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { map: m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); } };
};
// 旧版第 5 关的存档，另带一个旧版不认识的字段，写回时要原样留着
const LEVEL5 = JSON.stringify({ level: 5, attempts: { 1: 1, 2: 2, 3: 1, 4: 3, 5: 1 }, best: { 1: 3, 2: 2, 3: 3, 4: 1 }, sound: true, intro: true, note: 'x' });

const PORTRAIT: PlayEnv = { orientation: 'portrait', fullscreen: false, width: 393, height: 852, safe: { top: 0, right: 0, bottom: 0, left: 0 }, run: 'browser', reducedMotion: false };
function connected(): ShootaClient {
  let deliver: (d: unknown) => void = () => {};
  const transport: Transport = { embedded: true, send: () => {}, listen: fn => { deliver = fn; return () => {}; } };
  const c = createClient({ game: 'yike', transport });
  deliver({ ns: 'shoota', sdk: 2, type: 'welcome', game: { id: 'yike', title: '一克之差' }, user: { id: 'u', nickname: 'n' }, storage: {}, env: PORTRAIT });
  c.destroy();
  return c;
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1_760_000_000_000); });
afterEach(() => { vi.useRealTimers(); });

function pair(init?: string) {
  const so = memory(init ? { [SKEY]: init } : {}), sn = memory(init ? { [SKEY]: init } : {});
  const old = runLegacy(so);
  const game = new YikeGame({ storage: sn, sfx: quiet });
  const fx: Fx[] = [];
  let rendered = Date.now();
  game.onFx(e => fx.push(e));
  game.subscribe(() => { rendered = Date.now(); });
  game.start();
  return { old, game, so, sn, fx, renderedAt: () => rendered };
}

// 两边内部状态里玩法用到的部分
function stateOf(G: GameState | Record<string, any>) {
  const g = G as Record<string, any>;
  return {
    lv: g.lv, sel: g.sel, busy: g.busy, over: g.over, done: g.done, total: g.total, cap: g.cap, revive: g.revive,
    hold: [...g.hold], queue: [...g.queue], props: { ...g.props }, last: g.last && { ...g.last }, prevBest: g.prevBest, peekUntil: g.peekUntil, maxL: g.maxL, dr: [...g.dr],
    scales: g.scales.map((s: any) => ({ T: s.T, items: [...s.items], retired: s.retired })),
    tiles: g.tiles.map((t: any) => ({ id: t.id, w: t.w, src: t.src, gx: t.gx, gy: t.gy, layer: t.layer, d: t.d, k: t.k, blind: t.blind, seen: t.seen, decoy: t.decoy, loc: t.loc, scale: t.scale, cov: t.cov, herb: t.herb })),
  };
}

function compareStage(old: LegacyGame, game: YikeGame, peek: boolean) {
  const G = game.G!, O = old.G;
  const geoms = G.scales.map((sc, i) => scaleGeom(G, sc, i));
  G.scales.forEach((sc, i) => {
    const el = O.scales[i].el as Record<string, FakeEl>, g = geoms[i], lbl = scaleLabel(G, sc);
    expect(el.beam.style.transform).toBe(`rotate(${g.a}deg)`);
    expect(el.panR.style.transform).toBe(`translate(${g.xR - 23}px,${g.yR + 44}px)`);
    expect(el.lbl.className).toBe(lbl.tone ? `slbl ${lbl.tone}` : 'slbl');
    expect(el.lbl.innerHTML).toBe(lbl.text + (lbl.small ? `<small${lbl.small.last ? ' class="last"' : ''}>${lbl.small.text}</small>` : ''));
    expect(el.ring.classList.contains('sel')).toBe(G.sel === i && !sc.retired && !G.over);
    expect(el.bob.hidden).toBe(sc.retired);
    expect(el.done.classList.contains('on')).toBe(sc.retired);
    if (!sc.retired) expect(el.bob.innerHTML).toBe(`${sc.T}<small>g</small>`);
  });
  for (const t of G.tiles) {
    const el = O.tiles[t.id].el as FakeEl, spot = tileSpot(G, t, geoms)!, look = tileLook(t, peek);
    expect(el.style.transform, `药包 ${t.id} 位置`).toBe(`translate(${spot.x}px,${spot.y}px) scale(${spot.s})${spot.up ? ' translateY(-30px)' : ''}`);
    expect(String(el.style.zIndex)).toBe(String(spot.z));
    for (const c of ['cov', 'peek', 'inpan', 'blind', 'gone'] as const) expect(el.classList.contains(c), `药包 ${t.id} ${c}`).toBe(look[c]);
    expect(el.getAttribute('aria-label')).toBe(look.label);
    expect(el.querySelector('.w').innerHTML).toBe(look.weight === null ? '?' : `${look.weight}<small>g</small>`);
    if (look.tag) expect(el.querySelector('.tag').textContent).toBe(look.tag);
  }
  const { step, x0, sz } = trayGeom(G.cap);
  let slots = ''; for (let k = 0; k < G.cap; k++) slots += `<div class="slot" style="left:${x0 - 10 + k * step}px;width:${step}px"><i style="width:${sz}px;height:${sz}px"></i></div>`;
  expect(old.$('#tray').innerHTML).toBe(slots);
  const danger = G.hold.length >= G.cap - 2 && G.hold.length > 0;
  expect(old.$('#tray').classList.contains('danger')).toBe(danger);
  expect(old.$('#trayLbl').textContent).toBe(`暂存台 ${G.hold.length}/${G.cap}`);
  expect(old.$('#trayHint').hidden).toBe(G.hold.length > 0);
  (O.drl as (FakeEl | undefined)[]).forEach((lb, d) => {
    if (!lb) return;
    const n = G.tiles.filter(t => t.loc === 'board' && t.src === 'd' && t.d === d).length;
    expect(lb.innerHTML).toBe(`${d ? '右' : '左'}抽屉 · 剩 <b>${n}</b> 包`);
  });
}

// 顶栏、道具、弹窗：改写版用服务端渲染出 HTML，和旧版元素里的字比
function compareChrome(old: LegacyGame, game: YikeGame, client: ShootaClient) {
  const html = renderToStaticMarkup(<ShootaProvider client={client}><GameView game={game} /></ShootaProvider>).replace(/<!-- -->/g, '');
  const pick = (re: RegExp) => { const m = re.exec(html); if (!m) throw new Error(`没找到 ${re}`); return m[1]; };
  expect(plain(pick(/<span class="chip">(.*?)<\/span>/))).toBe(plain(old.$('#lvChip').textContent));
  const srow = pick(/<div class="srow">(.*?)<\/div>/);
  const spans = [...srow.matchAll(/<span>(.*?)<\/span>/g)].map(m => plain(m[1]));
  expect(spans).toEqual(['#sAtt', '#sDone', '#sNext'].map(s => plain(old.$(s).innerHTML)));
  expect(html.includes('M11 6l4 4')).toBe(old.$('#bSound').innerHTML.includes('M11 6l4 4')); // 静音图标
  const props = [...html.matchAll(/<button class="prop gs-control" type="button"( disabled="")?><b>.*?<\/b><span>.*?<\/span><em( hidden="")?>(\d+)<\/em><\/button>/g)];
  expect(props.map(m => ({ disabled: !!m[1], hidden: !!m[2], n: m[3] }))).toEqual(['#pUndo', '#pPeek', '#pSwap'].map(s => {
    const b = old.$(s), em = b.querySelector('em');
    return { disabled: b.disabled, hidden: em.hidden, n: String(em.textContent) };
  }));
  const card = /<div class="card" id="card">([\s\S]*)<\/div><\/div>$/.exec(html);
  expect(!!card).toBe(old.modalOpen());
  if (card) expect(plain(card[1])).toBe(plain(old.$('#card').innerHTML));
}

type Pair = ReturnType<typeof pair>;

// 一步操作：两边做同一件事。挑药包的办法偏向能凑平的，好让局面推进到过关、输掉与复活
function act(p: Pair, s: number, loses: { n: number }) {
  const { old, game } = p, G = game.G!, m = game.modal;
  if (m) {
    if (m.kind === 'intro') { game.go(); old.click('mGo'); }
    else if (m.kind === 'win') { game.next(); old.click('mNext'); }
    else if (m.canRevive && loses.n++ % 2 === 0) { game.revive(); old.click('mRevive'); }
    else { game.retry(); old.click('mRetry'); }
    return;
  }
  if (G.busy) return;
  const peeking = game.peeking;
  if (s % 31 === 0) { game.restart(); old.restart(); return; }
  if (s % 23 === 0) { game.toggleSound(); old.toggleSound(); return; }
  if (s % 7 === 0) { const i = (G.sel + 1) % 3; game.selectScale(i); old.selectScale(i); return; }
  if (s % 11 === 0) { game.undo(); old.doUndo(); return; }
  if (s % 13 === 0) { game.peek(); old.doPeek(); return; }
  if (s % 17 === 0) { game.swap(); old.doSwap(); return; }
  const covered = G.tiles.find(t => t.loc === 'board' && t.cov);
  if (s % 5 === 0 && covered && !peeking) { game.tapTile(covered.id); old.onTile(old.G.tiles[covered.id]); return; }
  const free = G.tiles.filter(t => (t.loc === 'board' && !t.cov) || t.loc === 'hold');
  if (!free.length) return;
  const sc = G.scales[G.sel].retired ? G.scales.find(x => !x.retired)! : G.scales[G.sel];
  const left = sc.T - sc.items.reduce((a, id) => a + G.tiles[id].w, 0);
  const pickT = free.find(t => t.w === left) ?? free.find(t => t.w < left - 1) ?? free[s % free.length];
  game.tapTile(pickT.id); old.onTile(old.G.tiles[pickT.id]);
}

// 会算的玩法：看得见的药包里能凑平哪台秤就先凑哪台，凑不平就放一包不会翻盘的，把下面的药包翻出来
function smartAct(p: Pair, s: number, loses: { n: number }) {
  const { old, game } = p, G = game.G!;
  if (game.modal || G.busy) return act(p, 1, loses);
  const free = G.tiles.filter(t => (t.loc === 'board' && !t.cov) || t.loc === 'hold');
  const sumOf = (i: number) => G.scales[i].items.reduce((a, id) => a + G.tiles[id].w, 0);
  const solve = (i: number) => {
    const sc = G.scales[i], left = sc.T - sumOf(i), room = 3 - sc.items.length;
    for (const a of free) if (a.w === left) return a.id;
    if (room >= 2) for (const a of free) for (const b of free) if (a !== b && a.w + b.w === left) return a.id;
    if (room >= 3) for (const a of free) for (const b of free) for (const c of free) if (a !== b && b !== c && a !== c && a.w + b.w + c.w === left) return a.id;
    return null;
  };
  const live = [0, 1, 2].filter(i => !G.scales[i].retired);
  const order = [G.sel, ...live.filter(i => i !== G.sel)].filter(i => live.includes(i));
  for (const i of order) {
    const id = solve(i);
    if (id === null) continue;
    if (i !== G.sel) { game.selectScale(i); old.selectScale(i); return; }
    game.tapTile(id); old.onTile(old.G.tiles[id]); return;
  }
  if (s % 3 === 0 && G.props.peek > 0 && G.tiles.some(t => t.loc === 'board' && (t.cov || !t.seen))) { game.peek(); old.doPeek(); return; }
  for (const i of order) {
    const sc = G.scales[i], left = sc.T - sumOf(i);
    if (3 - sc.items.length < 2) continue;
    const t = free.filter(x => x.loc === 'board' && x.w <= left - 2).sort((a, b) => a.w - b.w)[0];
    if (!t) continue;
    if (i !== G.sel) { game.selectScale(i); old.selectScale(i); return; }
    game.tapTile(t.id); old.onTile(old.G.tiles[t.id]); return;
  }
  if (G.props.swap > 0 && G.queue.length) { game.swap(); old.doSwap(); return; }
  if (free.length) { const t = free[s % free.length]; game.tapTile(t.id); old.onTile(old.G.tiles[t.id]); }
}

function play(init: string | undefined, steps: number, step: typeof act = act) {
  const p = pair(init), client = connected(), loses = { n: 0 };
  const seen = { levels: new Set<number>(), win: 0, lose: 0, revive: 0 };
  for (let s = 1; s <= steps; s++) {
    const before = p.game.modal?.kind;
    step(p, s, loses);
    vi.advanceTimersByTime(s % 9 === 0 ? 700 : 150);
    const { old, game } = p;
    seen.levels.add(game.G!.lv);
    if (game.modal?.kind === 'win' && before !== 'win') seen.win++;
    if (game.modal?.kind === 'lose' && before !== 'lose') seen.lose++;
    if (before === 'lose' && !game.modal) seen.revive++;
    expect(stateOf(game.G!), `第 ${s} 步`).toEqual(stateOf(old.G));
    expect(JSON.stringify(game.save)).toBe(JSON.stringify(old.save));
    expect(p.sn.map.get(SKEY)).toBe(p.so.map.get(SKEY));
    const peek = p.renderedAt() < game.G!.peekUntil;
    expect(old.lastRender < old.G.peekUntil, `第 ${s} 步透视`).toBe(peek); // 两边最后一次重画时透视状态相同
    compareStage(old, game, peek);
    compareChrome(old, game, client);
  }
  vi.advanceTimersByTime(2000);
  // 提示条与飘字的先后与内容；平秤时的那一簇碎屑落点（过关庆祝的碎屑位置是随机的，不比）
  expect(p.fx.filter(e => e.type === 'toast').map(e => e.text)).toEqual(p.old.$('#toast').texts);
  const fxEls = p.old.$('#fx').appended;
  expect(p.fx.flatMap(e => e.type === 'float' ? [{ text: e.text, left: `${e.x}px`, top: `${e.y}px`, bad: e.bad }] : []))
    .toEqual(fxEls.filter(d => d.className.startsWith('ft')).map(d => ({ text: d.textContent, left: d.style.left, top: d.style.top, bad: d.classList.contains('bad') })));
  // 平秤的碎屑一簇 16 片、落在吊盘上方（y 148）；过关庆祝的落点在 150 以下，按位置分得开
  const pts = fxEls.filter(d => d.className === 'pt' && d.style.top === '148px');
  const oldBursts = pts.filter((_, i) => i % 16 === 0).map(d => `${d.style.left},${d.style.top}`);
  expect(pts.length % 16).toBe(0);
  expect(p.fx.flatMap(e => e.type === 'burst' && e.n === 16 ? [`${e.x}px,${e.y}px`] : [])).toEqual(oldBursts);
  return seen;
}

describe('和旧版逐步对照', { timeout: 30_000 }, () => {
  it('新玩家：说明 → 第 1 关 → 往后几关，过关、翻盘、复活、重来都和旧版一样', () => {
    const seen = play(undefined, 900);
    expect(seen.win).toBeGreaterThan(0);
    expect(seen.lose).toBeGreaterThan(0);
    expect(seen.revive).toBeGreaterThan(0);
    expect(Math.max(...seen.levels)).toBeGreaterThanOrEqual(2);
  });

  it('旧版玩到第 5 关的存档：从第 5 关接着玩，之后每一步都和旧版一样', () => {
    const seen = play(LEVEL5, 600);
    expect([...seen.levels][0]).toBe(5);
  });

  it('会算的玩法连过几关：第 2 关起的过关文案、最好成绩与关卡推进都和旧版一样', () => {
    const seen = play(undefined, 1500, smartAct);
    expect(seen.win).toBeGreaterThanOrEqual(5);
    expect(Math.max(...seen.levels)).toBeGreaterThanOrEqual(6);
  });

  it('关了声音的存档：开关声音、重来都和旧版一样', () => {
    play(JSON.stringify({ level: 3, attempts: { 3: 4 }, best: { 3: 2 }, sound: false, intro: true }), 300);
  });
});

describe('存档', () => {
  it('读旧版第 5 关的存档：第 5 关、第 2 次挑战，键仍是 yikezhicha.v2，旧版不认识的字段原样写回', () => {
    const s = memory({ [SKEY]: LEVEL5 });
    const game = new YikeGame({ storage: s, sfx: quiet });
    game.start();
    expect(game.G!.lv).toBe(5);
    expect(game.modal).toBeNull(); // 看过说明就不再弹
    expect([...s.map.keys()]).toEqual([SKEY]);
    expect(JSON.parse(s.map.get(SKEY)!)).toEqual({ ...JSON.parse(LEVEL5), attempts: { 1: 1, 2: 2, 3: 1, 4: 3, 5: 2 } });
  });

  it('没有存档：第 1 关，先弹说明；点「开始抓药」后记下看过', () => {
    const s = memory();
    const game = new YikeGame({ storage: s, sfx: quiet });
    game.start();
    expect(game.G!.lv).toBe(1);
    expect(game.modal).toEqual({ kind: 'intro' });
    game.go();
    expect(JSON.parse(s.map.get(SKEY)!)).toEqual({ level: 1, attempts: { 1: 1 }, best: {}, sound: true, intro: true });
  });

  it('存档读不出来：当新档开局，不报错', () => {
    const game = new YikeGame({ storage: memory({ [SKEY]: '{坏了' }), sfx: quiet });
    game.start();
    expect(game.G!.lv).toBe(1);
  });
});
