// 一克之差的界面：GameShell 管顶部信息区、核心区与道具栏，核心区里是按块排开的舞台。
// 界面只读 engine 的状态来画；特效与提示按 engine 发出的事件在 DOM 里直接播，做法同旧版。
import { Fragment, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import type { ShootaClient } from '../../sdk/core';
import { GameShell, useLayout, useReady, useShoota } from '../../sdk/react';
import { YikeGame, type GameState, type Modal, type Scale, type Tile } from './engine';
import { CHROME, fitStage, place, type StageFit } from './fit';
import { drawerBoxes, HANG, propStates, SC_X, scaleGeom, scaleLabel, tileLook, tileSpot, trayGeom, W, type PropState, type ScaleGeom } from './model';
import { createSfx } from './sound';

let instance: YikeGame | null = null;

// 一个页面只开一局：连上平台、拿到存档后开局。旧版脚本一载入就开局，开局即把这一关的挑战次数加 1 并存档
function gameFor(client: ShootaClient) {
  if (!instance) {
    const game: YikeGame = new YikeGame({ storage: client.storage, sfx: createSfx(() => game.save.sound) });
    game.start();
    instance = game;
  }
  return instance;
}

const cls = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ');

// 旧版「先去掉类名、强制重排、再加上」重播一次 CSS 动画
function replay(el: HTMLElement | null, name: string) {
  if (!el) return;
  el.classList.remove(name); void el.offsetWidth; el.classList.add(name);
}
function useReplay<T extends HTMLElement>(name: string, n: number) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => { if (n > 0) replay(ref.current, name); }, [name, n]);
  return ref;
}

export function App() {
  const client = useShoota();
  const [game] = useState(() => gameFor(client));
  return <GameView game={game} />;
}

export function GameView({ game }: { game: YikeGame }) {
  const version = () => game.version;
  useSyncExternalStore(game.subscribe, version, version);
  const { orientation } = useLayout();
  const blocked = game.modal !== null; // 弹窗开着时背后的游戏不可点、不可 Tab 到
  return (
    <>
      <GameShell
        header={<Header game={game} blocked={blocked} />}
        compactHeader={<Header game={game} blocked={blocked} compact />}
        aside={<Dock game={game} dir={orientation === 'landscape' ? 'col' : 'row'} blocked={blocked} />}
      >
        <Stage game={game} orientation={orientation} blocked={blocked} />
      </GameShell>
      {game.modal && <ModalView key={`${game.G!.serial}-${game.modal.kind}`} game={game} modal={game.modal} />}
    </>
  );
}

/* 顶部信息区 */
function Header({ game, blocked, compact }: { game: YikeGame; blocked: boolean; compact?: boolean }) {
  const G = game.G!;
  const chip = <span className="chip">第 {G.lv} 关</span>;
  const stats = <Stats G={G} game={game} />;
  const btns = <HeadButtons game={game} />;
  if (compact) return <div className="yk-line" style={{ blockSize: CHROME.line }} inert={blocked}>{chip}<h1>一克之差</h1><span className="yk-stats">{stats}</span>{btns}</div>;
  return (
    <div className="yk-head" style={{ blockSize: CHROME.head }} inert={blocked}>
      <div className="hrow">{chip}<h1>一克之差</h1>{btns}</div>
      <div className="srow">{stats}</div>
    </div>
  );
}
function Stats({ G, game }: { G: GameState; game: YikeGame }) {
  const save = game.save;
  return (
    <>
      <span>第 <b>{save.attempts[G.lv] || 1}</b> 次挑战</span>
      <span>已称 <b>{G.done}/{G.total}</b> 方 · 最好 <b>{save.best[G.lv] || 0}</b></span>
      <span>{G.queue.length ? <>下一方 <b>{G.queue[0]}g</b></> : '没有下一方了'}</span>
    </>
  );
}
function HeadButtons({ game }: { game: YikeGame }) {
  return (
    <div className="hbtns">
      <button className="hbtn gs-hit gs-control" type="button" aria-label="声音开关" onClick={() => game.toggleSound()}>{game.save.sound ? <IconOn /> : <IconOff />}</button>
      <button className="hbtn gs-hit gs-control" type="button" onClick={() => game.restart()}>重来</button>
    </div>
  );
}
const IconOn = () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor" /><path d="M11.5 5.5a3.5 3.5 0 0 1 0 5M13.5 3.5a6.5 6.5 0 0 1 0 9" strokeLinecap="round" /></svg>;
const IconOff = () => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor" /><path d="M11 6l4 4M15 6l-4 4" strokeLinecap="round" /></svg>;

/* 道具 */
function Dock({ game, dir, blocked }: { game: YikeGame; dir: 'row' | 'col'; blocked: boolean }) {
  const p = propStates(game.G!);
  return (
    <div className="yk-dock" data-dir={dir} style={dir === 'row' ? { blockSize: CHROME.dockRow } : { inlineSize: CHROME.dockCol }} inert={blocked}>
      <div className="yk-props" id="props">
        <Prop name="撤回" hint="收回上一包" st={p.undo} onClick={() => game.undo()} />
        <Prop name="透视" hint="看清压住的 5 秒" st={p.peek} onClick={() => game.peek()} />
        <Prop name="换方子" hint="换掉选中秤的目标" st={p.swap} onClick={() => game.swap()} />
      </div>
    </div>
  );
}
function Prop({ name, hint, st, onClick }: { name: string; hint: string; st: PropState; onClick: () => void }) {
  return <button className="prop gs-control" type="button" disabled={st.disabled} onClick={onClick}><b>{name}</b><span>{hint}</span><em hidden={st.n <= 0}>{st.n}</em></button>;
}

/* 核心区：量出可用尺寸再排舞台，排好之后的第一帧就能点，这时报就绪 */
function Stage({ game, orientation, blocked }: { game: YikeGame; orientation: 'portrait' | 'landscape'; blocked: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current!;
    const read = (b: { w: number; h: number } | null) => {
      const w = el.clientWidth, h = el.clientHeight;
      return (b && b.w === w && b.h === h) || !w || !h ? b : { w, h };
    };
    setBox(read);
    // 转屏、信息区展开收起都会改核心区尺寸：在尺寸变化的那一帧画出来之前就重排，不露出排错的一帧
    const ro = new ResizeObserver(() => flushSync(() => setBox(read)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useReady(box !== null);
  return (
    <div ref={ref} className="yk-fit" inert={blocked}>
      {box && <StageView game={game} fit={fitStage(orientation, box.w, box.h)} />}
    </div>
  );
}

export function StageView({ game, fit }: { game: YikeGame; fit: StageFit }) {
  const G = game.G!, o = fit.off;
  const stageRef = useRef<HTMLDivElement>(null);
  const fitKey = JSON.stringify(fit);
  const lastFit = useRef(fitKey);
  // 转屏或改尺寸时药包直接落到新位置，不从旧位置飞过去
  useLayoutEffect(() => {
    if (lastFit.current === fitKey) return;
    lastFit.current = fitKey;
    const el = stageRef.current!;
    el.classList.add('snap'); void el.offsetWidth; el.classList.remove('snap');
  }, [fitKey]);
  const geoms = G.scales.map((sc, i) => scaleGeom(G, sc, i));
  const peek = game.peeking;
  const tray = trayGeom(G.cap);
  const danger = G.hold.length >= G.cap - 2 && G.hold.length > 0;
  return (
    <div id="stage" ref={stageRef} style={{ width: fit.w, height: fit.h, transform: `scale(${fit.k})` }}>
      <div id="scales" style={{ left: o.S.x, top: o.S.y }}>
        {G.scales.map((sc, i) => <ScaleView key={`${G.serial}-${i}`} game={game} G={G} sc={sc} i={i} geom={geoms[i]} />)}
      </div>
      <div className="grp" style={{ left: o.B.x, top: o.B.y }}>
        <div id="board" />
        {drawerBoxes(G.dr).map(b => (
          <Fragment key={`${G.serial}-${b.d}`}>
            <div className="drawer" style={{ left: b.x0, width: b.x1 - b.x0 }} />
            <span className="drlbl" style={b.d === 0 ? { left: b.x0 + 4 } : { right: W - b.x1 + 4 }}>
              {b.d ? '右' : '左'}抽屉 · 剩 <b>{G.tiles.filter(t => t.loc === 'board' && t.src === 'd' && t.d === b.d).length}</b> 包
            </span>
          </Fragment>
        ))}
        <Toast game={game} />
      </div>
      <div className="grp" style={{ left: o.T.x, top: o.T.y }}>
        <div id="tray" className={danger ? 'danger' : undefined}>
          {Array.from({ length: G.cap }, (_, k) => (
            <div key={k} className="slot" style={{ left: tray.x0 - 10 + k * tray.step, width: tray.step }}><i style={{ width: tray.sz, height: tray.sz }} /></div>
          ))}
        </div>
        <span id="trayHint" hidden={G.hold.length > 0}>翻盘的药包落在这里，点它能再放回秤上</span>
        <span id="trayLbl" className={danger ? 'danger' : undefined}>暂存台 {G.hold.length}/{G.cap}</span>
      </div>
      <div id="layer">
        {G.tiles.map(t => <TileView key={`${G.serial}-${t.id}`} game={game} t={t} G={G} geoms={geoms} peek={peek} fit={fit} />)}
      </div>
      <FxLayer game={game} fit={fit} />
    </div>
  );
}

/* 戥秤：元素顺序同旧版，后画的压在上面 */
function ScaleView({ game, G, sc, i, geom }: { game: YikeGame; G: GameState; sc: Scale; i: number; geom: ScaleGeom }) {
  const cx = SC_X[i];
  const ring = useReplay<HTMLButtonElement>('flash', sc.flashN);
  const bob = useRef<HTMLDivElement>(null);
  const lastT = useRef<number | null>(null);
  // 砝码换了数才闪一下；开局第一次显示不闪
  useLayoutEffect(() => {
    if (sc.retired || lastT.current === sc.T) return;
    if (lastT.current !== null) replay(bob.current, 'pop');
    lastT.current = sc.T;
  }, [sc.T, sc.retired]);
  const lbl = scaleLabel(G, sc);
  return (
    <>
      <button ref={ring} type="button" className={cls('ring', G.sel === i && !sc.retired && !G.over && 'sel', sc.retired && 'retired', sc.flashN > 0 && 'flash')}
        style={{ left: cx - 63 }} aria-label={`选择第 ${i + 1} 台秤`} onClick={() => game.selectScale(i)}>
        <span className="rtag">药包放这台</span>
      </button>
      <div className="pillar" style={{ left: cx - 3 }} />
      <div className="sbase" style={{ left: cx - 28 }} />
      <div className="str" style={{ transform: `translate(${geom.xL - .75}px,${geom.yL}px)` }} />
      <div className="str" style={{ transform: `translate(${geom.xR - .75}px,${geom.yR}px)` }} />
      <div className="pan" style={{ transform: `translate(${geom.xL - 23}px,${geom.yL + HANG}px)` }} />
      <div className="pan" style={{ transform: `translate(${geom.xR - 23}px,${geom.yR + HANG}px)` }} />
      <div ref={bob} className="bob" hidden={sc.retired} style={{ transform: `translate(${geom.xL - 18}px,${geom.yL + HANG - 24}px)` }}>{sc.T}<small>g</small></div>
      <div className="beam" style={{ left: cx - 45, transform: `rotate(${geom.a}deg)` }} />
      <div className="knob" style={{ left: cx - 5 }} />
      <div className={cls('slbl', lbl.tone)} style={{ left: cx - 63 }}>{lbl.text}{lbl.small && <small className={lbl.small.last ? 'last' : undefined}>{lbl.small.text}</small>}</div>
      <div className={cls('sdone', sc.retired && 'on')} style={{ left: cx - 27 }}>齐</div>
    </>
  );
}

/* 药包 */
function TileView({ game, t, G, geoms, peek, fit }: { game: YikeGame; t: Tile; G: GameState; geoms: ScaleGeom[]; peek: boolean; fit: StageFit }) {
  const ref = useReplay<HTMLButtonElement>('shake', t.shakeN);
  const spot = tileSpot(G, t, geoms);
  if (!spot) return null;
  const look = tileLook(t, peek);
  const x = spot.x + fit.off[spot.g].x, y = spot.y + fit.off[spot.g].y;
  const style = { '--hb': t.herb[1], transform: `translate(${x}px,${y}px) scale(${spot.s})${spot.up ? ' translateY(-30px)' : ''}`, zIndex: spot.z } as CSSProperties;
  return (
    <button ref={ref} type="button" style={style} aria-label={look.label} aria-hidden={look.gone || undefined} tabIndex={look.gone ? -1 : undefined}
      className={cls('tile', look.cov && 'cov', look.peek && 'peek', look.inpan && 'inpan', look.blind && 'blind', look.gone && 'gone', t.shakeN > 0 && 'shake')}
      onClick={() => game.tapTile(t.id)}>
      <span className="band" /><span className="nm">{t.herb[0]}</span><b className="w">{look.weight === null ? '?' : <>{look.weight}<small>g</small></>}</b>
      {look.tag && <span className="tag">{look.tag}</span>}
    </button>
  );
}

/* 特效与提示：和旧版一样直接往 DOM 里加元素，播完删掉 */
function Toast({ game }: { game: YikeGame }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let tt: ReturnType<typeof setTimeout> | undefined;
    const off = game.onFx(e => {
      const el = ref.current;
      if (e.type !== 'toast' || !el) return;
      el.textContent = e.text; el.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('on'), 1400);
    });
    return () => { off(); clearTimeout(tt); };
  }, [game]);
  return <div id="toast" ref={ref} role="status" />;
}

function FxLayer({ game, fit }: { game: YikeGame; fit: StageFit }) {
  const ref = useRef<HTMLDivElement>(null);
  const fitRef = useRef(fit);
  useLayoutEffect(() => { fitRef.current = fit; });
  useEffect(() => game.onFx(e => {
    const fx = ref.current;
    if (!fx || e.type === 'toast') return;
    const p = place(fitRef.current, e.x, e.y);
    if (e.type === 'burst') burst(fx, p.x, p.y, e.n); else floatText(fx, p.x, p.y, e.text, e.bad);
  }), [game]);
  return <div id="fx" ref={ref} />;
}
function burst(fx: HTMLElement, x: number, y: number, n = 14) {
  const cols = ['#efd58e', '#c9a24a', '#86d6ad', '#d24c33', '#f1e6cc'];
  for (let i = 0; i < n; i++) {
    const d = document.createElement('div'); d.className = 'pt'; const a = Math.random() * Math.PI * 2, r = 30 + Math.random() * 60;
    d.style.left = x + 'px'; d.style.top = y + 'px'; d.style.background = cols[i % cols.length];
    d.style.setProperty('--dx', Math.cos(a) * r + 'px'); d.style.setProperty('--dy', Math.sin(a) * r - 20 + 'px'); d.style.setProperty('--r', (Math.random() * 540) + 'deg');
    fx.appendChild(d); setTimeout(() => d.remove(), 800);
  }
}
function floatText(fx: HTMLElement, x: number, y: number, txt: string, bad: boolean) {
  const d = document.createElement('div'); d.className = 'ft' + (bad ? ' bad' : ''); d.textContent = txt; d.style.left = x + 'px'; d.style.top = y + 'px';
  fx.appendChild(d); setTimeout(() => d.remove(), 950);
}

/* 弹窗：说明、输了、过关。打开时焦点落在标题上，背后的游戏 inert */
function ModalView({ game, modal }: { game: YikeGame; modal: Modal }) {
  const title = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => { title.current?.focus({ preventScroll: true }); }, []);
  const h2 = (text: string) => <h2 id="mTitle" ref={title} tabIndex={-1}>{text}</h2>;
  return (
    <div id="modal" role="dialog" aria-modal="true" aria-labelledby="mTitle">
      <div className="card" id="card">
        {modal.kind === 'intro' && (
          <>
            {h2('一克之差')}
            <p className="sub">药铺抓药，一克都不能差</p>
            <ol>
              <li>点亮着的药包，它会放上<b>选中的那台秤</b>。点秤可以换。</li>
              <li>右盘总重正好等于左边砝码，秤就平了，药包收走，换下一张方子。</li>
              <li>每台秤<b>最多放 3 包</b>。超重，或者 3 包放满还没平，都会<b>翻盘</b>，整盘药包掉进暂存台。暂存台放不下就输。</li>
            </ol>
            <p className="note">压住的药包什么都看不见，抽屉只看得到最上面一包。标着“轻”“重”的是盲包，放上秤才知道几克。</p>
            <div className="btns"><button className="btn pri" type="button" onClick={() => game.go()}>开始抓药</button></div>
          </>
        )}
        {modal.kind === 'lose' && (
          <>
            {h2(modal.title)}
            <p className="big">{modal.line[0]}<em>{modal.line[1]}</em>{modal.line[2]}</p>
            <p className="sub">{modal.sub}</p>
            <div className="stat"><div><b>{modal.done}</b>已称方子</div><div><b>{modal.attempts}</b>挑战次数</div></div>
            <div className="btns">
              {modal.canRevive && <button className="btn pri" type="button" onClick={() => game.revive()}>暂存台加 2 格，接着称</button>}
              <button className={cls('btn', modal.canRevive ? 'sec' : 'pri')} type="button" onClick={() => game.retry()}>再来一次</button>
            </div>
          </>
        )}
        {modal.kind === 'win' && (
          <>
            <div className="stamp">齐</div>
            {h2('抓齐了')}
            <p className="sub">{modal.sub}</p>
            <div className="stat"><div><b>{modal.total}</b>方子称完</div><div><b>{modal.attempts}</b>挑战次数</div></div>
            <div className="btns"><button className="btn pri" type="button" onClick={() => game.next()}>下一关 · 第 {modal.next} 关</button></div>
          </>
        )}
      </div>
    </div>
  );
}
