// 详情 PAGE-GAME：面包屑、标题、封面与概要、开始卡、介绍各节、你的记录、成就、说明，区块与文案沿用旧版 renderGame（dd731d6）。
import { gameById, type GameEntry } from '../../catalog';
import type { GameStat } from '../../shared';
import { Button, ButtonLink, Card, EmptyState, Icon, ProgressBar } from '../../ui';
import { achList, unlockedKeys } from '../browse';
import { Cover } from '../components/Cover';
import { StatusPill, TagButtons } from '../components/bits';
import { copy } from '../copy';
import { fmtPlay, fmtSize, fmtWhen } from '../format';
import * as icons from '../icons';
import { useServices, useSnapshot } from '../services';
import { useAppUi } from '../state';
import { useAppToast } from '../toast';
import './GamePage.css';

const C = copy.game;

export function GamePage({ id }: { id: string }) {
  const g = gameById(id);
  if (!g) {
    return (
      <div className="app-page">
        <EmptyState title={C.notFound} action={<ButtonLink href="#store">{C.backToStore}</ButtonLink>} />
      </div>
    );
  }
  return <Detail g={g} />;
}

function Detail({ g }: { g: GameEntry }) {
  const { stats } = useSnapshot();
  const { applyTag } = useAppUi();
  const s = stats[g.id];

  return (
    <div className="app-page app-page-tight app-game">
      <nav className="app-crumbs" aria-label={C.crumbs}>
        <a className="focus-ring" href="#store">{copy.nav.store}</a>
        <span aria-hidden="true">›</span>
        <a className="focus-ring" href="#store" onClick={e => { e.preventDefault(); applyTag(g.genre); }}>{g.genre}</a>
        <span aria-hidden="true">›</span>
        <span aria-current="page">{g.title}</span>
      </nav>

      <header className="app-game-head">
        <h1>{g.title}</h1>
        {g.sub && <p className="app-muted">{g.sub}</p>}
      </header>

      <div className="app-game-top">
        <Cover game={g} sub eager />
        <aside className="app-game-side">
          <p>{g.tagline}</p>
          <dl className="app-facts">
            <dt>{C.facts.genre}</dt><dd>{g.genre}</dd>
            <dt>{C.facts.session}</dt><dd>{g.session}</dd>
            <dt>{C.facts.saves}</dt><dd>{g.saves}</dd>
            <dt>{C.facts.size}</dt><dd className="app-num">{fmtSize(g.size || 0)}{g.version ? ' · ' + g.version : ''}</dd>
          </dl>
          <TagButtons tags={g.tags} />
          <div><StatusPill game={g} /></div>
        </aside>
      </div>

      <div className="app-game-body">
        <div className="app-game-main">
          <section className="app-start" aria-labelledby="game-start">
            <div>
              <h2 id="game-start">{C.startTitle(g.title)}</h2>
              <p>{s?.seconds ? C.startPlayed(fmtPlay(s.seconds), fmtWhen(s.last)) : C.startNew}</p>
            </div>
            <ButtonLink variant="primary" size="lg" href={'#play-' + g.id}>{s?.seconds ? C.resume : C.start}</ButtonLink>
          </section>

          <section className="app-game-sec" aria-labelledby="game-about">
            <h2 id="game-about">{C.about}</h2>
            <div className="app-prose">{g.about.map((p, i) => <p key={i}>{p}</p>)}</div>
          </section>

          {g.loop.length > 0 && (
            <section className="app-game-sec" aria-labelledby="game-loop">
              <h2 id="game-loop">{C.loop}</h2>
              <ol role="list" className="app-steps">{g.loop.map((l, i) => <li key={i}><span>{l}</span></li>)}</ol>
            </section>
          )}

          {g.identities && (
            <section className="app-game-sec" aria-labelledby="game-ids">
              <h2 id="game-ids">{C.identities}</h2>
              <div className="app-table" tabIndex={0} role="region" aria-labelledby="game-ids">
                <table>
                  <thead><tr>{C.identityCols.map(c => <th key={c} scope="col">{c}</th>)}</tr></thead>
                  <tbody>{g.identities.map(r => <tr key={r[0]}>{r.map((c, i) => <td key={i}>{c}</td>)}</tr>)}</tbody>
                </table>
              </div>
            </section>
          )}

          {g.perks && (
            <section className="app-game-sec" aria-labelledby="game-perks">
              <h2 id="game-perks">{C.perks}</h2>
              <ul role="list" className="app-perks">{g.perks.map(p => <li key={p[0]}><b>{p[0]}</b><span>{p[1]}</span></li>)}</ul>
            </section>
          )}
        </div>

        <div className="app-game-aside">
          <Record g={g} s={s} />
          <Achievements g={g} s={s} />
          {(g.notes || []).length > 0 && (
            <div className="app-note"><b>{C.notes}</b>{g.notes!.map((n, i) => <span key={i}>{n}</span>)}</div>
          )}
        </div>
      </div>
    </div>
  );
}

// 你的记录：游玩时间、上次游玩、进度文字与愿望单
function Record({ g, s }: { g: GameEntry; s: GameStat | undefined }) {
  const services = useServices();
  const { wish } = useSnapshot();
  const toast = useAppToast();
  const wished = wish.includes(g.id);
  return (
    <Card title={C.record}>
      <dl className="app-stats">
        <div><dt>{C.playTime}</dt><dd className="app-metric">{fmtPlay(s?.seconds || 0)}</dd></div>
        <div><dt>{C.lastPlayed}</dt><dd>{fmtWhen(s?.last)}</dd></div>
        {s?.status && <div><dt>{C.progress}</dt><dd>{s.status}</dd></div>}
      </dl>
      <Button
        block
        icon={wished ? <Icon src={icons.check} size="sm" /> : undefined}
        onClick={() => toast.say(services.toggleWish(g.id) ? C.wishAdded : C.wishRemoved)}
      >
        {wished ? C.wishIn : C.wishAdd}
      </Button>
    </Card>
  );
}

// 成就：已解锁几条、进度条、逐条星标；没有定义时说明怎么接入
function Achievements({ g, s }: { g: GameEntry; s: GameStat | undefined }) {
  const { achDefs } = useSnapshot();
  const achs = achList(g, achDefs);
  const got = unlockedKeys(achs, s);
  return (
    <Card title={C.achievements}>
      {achs.length ? (
        <div className="app-ach">
          <dl className="app-stats">
            <div><dt>{C.unlocked}</dt><dd className="app-metric">{got.length} / {achs.length}</dd></div>
          </dl>
          <ProgressBar value={got.length / achs.length} label={C.unlocked} valueText={`${got.length} / ${achs.length}`} />
          <ul role="list" className="app-ach-list">
            {achs.map(a => {
              const on = got.includes(a.key);
              return <li key={a.key} data-got={on || undefined}><span aria-hidden="true">{on ? '★' : '☆'}</span> {a.name}{on && <span className="sr-only">，{C.unlocked}</span>}</li>;
            })}
          </ul>
        </div>
      ) : (
        <p className="app-muted">{C.noAchievements[0]}<code>{C.noAchievements[1]}</code>{C.noAchievements[2]}</p>
      )}
    </Card>
  );
}
