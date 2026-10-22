// 游戏库 PAGE-LIBRARY：空态，或左侧列表加右侧详情；收录、排序与文案沿用旧版 renderLibrary（dd731d6）。
// 被同步或取回换掉存档的游戏另显示「可撤销」，详情里给换回入口（FLOW-CLOUD-CONFLICT S4）。
import { useRef, useState } from 'react';
import { CATALOG, type GameEntry } from '../../catalog';
import { Button, ButtonLink, Card, EmptyState, LargeTitle } from '../../ui';
import { achList, libraryGames, unlockedKeys } from '../browse';
import { Cover } from '../components/Cover';
import { copy } from '../copy';
import { fmtDay, fmtPlay, fmtWhen } from '../format';
import { useMedia, WIDE } from '../media';
import { useServices, useSnapshot } from '../services';
import { useAppUi } from '../state';
import { useAppToast } from '../toast';
import './LibraryPage.css';

const C = copy.library;

export function LibraryPage() {
  const { stats, wish, undo } = useSnapshot();
  const { libSel, setLibSel } = useAppUi();
  const wide = useMedia(WIDE);
  const detail = useRef<HTMLDivElement>(null);
  const games = libraryGames(CATALOG, stats, wish);

  if (!games.length) {
    return (
      <div className="app-page app-library">
        <h1 className="sr-only">{C.title}</h1>
        <EmptyState
          title={C.emptyTitle}
          description={C.emptyText}
          action={<ButtonLink variant="primary" href="#store">{C.emptyAction}</ButtonLink>}
        />
      </div>
    );
  }

  const g = games.find(x => x.id === libSel) ?? games[0];
  const total = games.reduce((n, x) => n + (stats[x.id]?.seconds || 0), 0);

  // 窄屏详情在列表下面，点了滚过去
  const pick = (id: string) => {
    setLibSel(id);
    if (!wide) requestAnimationFrame(() => detail.current?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
  };

  return (
    <div className="app-page app-page-tight app-library">
      <LargeTitle title={C.title} subtitle={C.count(games.length, total >= 60 ? fmtPlay(total) : null)} />
      <div className="app-lib">
        <ul role="list" className="app-lib-list" aria-label={C.listLabel}>
          {games.map(x => {
            const sec = stats[x.id]?.seconds;
            return (
              <li key={x.id}>
                <button type="button" className="app-lib-item state-layer focus-ring" aria-pressed={x.id === g.id} onClick={() => pick(x.id)}>
                  <Cover game={x} noTitle />
                  <span className="app-lib-text">
                    <b>{x.title}</b>
                    <span className="app-lib-sub">
                      {sec ? fmtPlay(sec) : wish.includes(x.id) ? C.wished : C.neverPlayed}
                      {undo[x.id] && <span className="app-badge" data-tone="undo">{C.undoBadge}</span>}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <div ref={detail} className="app-lib-main">
          <LibDetail key={g.id} g={g} />
        </div>
      </div>
    </div>
  );
}

function LibDetail({ g }: { g: GameEntry }) {
  const { stats, achDefs, undo, cloud } = useSnapshot();
  const s = stats[g.id];
  const achs = achList(g, achDefs);
  const got = unlockedKeys(achs, s);
  const about = cloud ? C.aboutTextCloud(g.title) : C.aboutText(g.title);
  return (
    <>
      <Cover game={g} sub className="app-lib-hero" />
      <div className="app-lib-bar">
        <ButtonLink variant="primary" size="lg" href={'#play-' + g.id}>{s?.seconds ? C.resume : C.start}</ButtonLink>
        <dl className="app-kvs">
          <div><dt>{C.playTime}</dt><dd className="app-metric">{fmtPlay(s?.seconds || 0)}</dd></div>
          <div><dt>{C.lastPlayed}</dt><dd>{fmtWhen(s?.last)}</dd></div>
          {achs.length > 0 && <div><dt>{C.achievements}</dt><dd className="app-metric">{got.length} / {achs.length}</dd></div>}
          {s?.status && <div><dt>{C.progress}</dt><dd>{s.status}</dd></div>}
        </dl>
        <ButtonLink variant="text" href={'#game-' + g.id} className="app-lib-store">{C.storePage}</ButtonLink>
      </div>
      {undo[g.id] && <UndoBlock g={g} at={undo[g.id].at} why={undo[g.id].why} />}
      <Card title={C.aboutSaves}>
        <p className="app-muted">{about[0]}<a className="app-inline-link focus-ring" href="#backup">{about[1]}</a>{about[2]}</p>
      </Card>
    </>
  );
}

// 撤销槽：说明哪天因为什么换掉的，点了换回原来那份并推上云端
function UndoBlock({ g, at, why }: { g: GameEntry; at: number; why: 'conflict' | 'recover' }) {
  const services = useServices();
  const toast = useAppToast();
  const [busy, setBusy] = useState(false);
  const restore = async () => {
    setBusy(true);
    try {
      if (await services.restoreUndo(g.id)) toast.say(C.undoDone);
      else toast.bad(C.undoFailed);
    } catch {
      toast.bad(C.undoFailed);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="app-note app-undo">
      <b><span className="app-badge" data-tone="undo">{C.undoBadge}</span></b>
      <p>{why === 'conflict' ? C.undoConflict(fmtDay(at)) : C.undoRecover(fmtDay(at))}</p>
      <div className="app-acts"><Button loading={busy} onClick={restore}>{C.undoAction}</Button></div>
    </div>
  );
}
