// 商店 PAGE-STORE：精选、继续游玩、全部游戏、底部说明带，区块与文案沿用旧版 renderStore（dd731d6）。
// 首次开通云存档时顶部先提示一次恢复码（FLOW-CLOUD-FIRST S4）。
import { useEffect, useRef } from 'react';
import { CATALOG, type GameEntry } from '../../catalog';
import { Button, ButtonLink, Card, LargeTitle, List, ListRow } from '../../ui';
import { filterGames, genreCounts, recentGames } from '../browse';
import { copyText } from '../clipboard';
import { Cover } from '../components/Cover';
import { GenreChips, RecoveryCode, SearchField, StatusPill, TagButtons } from '../components/bits';
import { copy } from '../copy';
import { fmtPlay, fmtWhen } from '../format';
import { REDUCED_MOTION, useMedia, WIDE } from '../media';
import { useServices, useSnapshot } from '../services';
import { useAppUi } from '../state';
import { useAppToast } from '../toast';
import './StorePage.css';

const C = copy.store;

export function StorePage() {
  const { stats, cloud } = useSnapshot();
  const { filter, clearFilter } = useAppUi();
  const q = filter.q.trim();
  const shown = filterGames(CATALOG, filter);
  const recent = q ? [] : recentGames(CATALOG, stats);
  const wide = useMedia(WIDE); // 宽屏的搜索框在顶栏里

  return (
    <div className="app-page app-store">
      <LargeTitle title={C.title}>
        {!wide && <SearchField />}
      </LargeTitle>

      {cloud?.notice && <CloudNotice code={cloud.code} />}

      {!q && <Featured games={CATALOG} />}

      {recent.length > 0 && (
        <List header={copy.store.continue} className="app-section">
          {recent.map(g => {
            const s = stats[g.id];
            return (
              <ListRow
                key={g.id}
                href={'#play-' + g.id}
                leading={<Cover game={g} noTitle className="app-thumb" />}
                title={g.title}
                subtitle={`${fmtPlay(s.seconds)} · ${fmtWhen(s.last)}${s.status ? ' · ' + s.status : ''}`}
              />
            );
          })}
        </List>
      )}

      <section className="app-section" aria-labelledby="store-all">
        <div className="app-sec-h">
          <h2 id="store-all">{q ? C.searching(q) : C.all}</h2>
          <span className="app-aside">{C.count(shown.length)}</span>
        </div>
        <GenreChips counts={genreCounts(CATALOG)} value={filter.genre} />
        {shown.length ? (
          <ul role="list" className="app-grid">
            {shown.map(g => <li key={g.id}><Capsule game={g} played={stats[g.id]?.seconds} /></li>)}
          </ul>
        ) : (
          <div className="app-empty-inline">
            <p>{C.empty}</p>
            <Button onClick={clearFilter}>{C.clear}</Button>
          </div>
        )}
      </section>

      <section className="app-band" aria-labelledby="store-band">
        <div>
          <h3 id="store-band">{cloud ? C.bandTitleCloud : C.bandTitle}</h3>
          <p>{cloud ? C.bandTextCloud : C.bandText}</p>
        </div>
        <ButtonLink href="#backup">{C.bandAction}</ButtonLink>
      </section>
    </div>
  );
}

// 精选：全部游戏按目录顺序横向排开，手机上滑动切换并露出下一张的边；宽屏下方的圆点按钮切换（旧版 hero-nav），不自动轮播
function Featured({ games }: { games: readonly GameEntry[] }) {
  const { hero, setHero } = useAppUi();
  const track = useRef<HTMLUListElement>(null);
  const current = Math.min(hero, games.length - 1);
  const reduce = useMedia(REDUCED_MOTION);

  const scrollTo = (i: number, smooth: boolean) => {
    const el = track.current;
    const slide = el?.children[i] as HTMLElement | undefined;
    const first = el?.children[0] as HTMLElement | undefined;
    if (!el || !slide || !first) return;
    el.scrollTo({ left: slide.offsetLeft - first.offsetLeft, behavior: smooth && !reduce ? 'smooth' : 'auto' });
  };

  // 回到商店时停在上次看的那张
  useEffect(() => { scrollTo(current, false); }, []);

  // 滑到哪张就记哪张：大半张进入视野即算当前
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) setHero(Number((e.target as HTMLElement).dataset.i));
    }, { root: el, threshold: 0.6 });
    for (const s of el.children) io.observe(s);
    return () => io.disconnect();
  }, [setHero]);

  return (
    <section className="app-section app-hero" aria-label={C.featuredLabel}>
      <div className="app-sec-h">
        <h2>{C.featured}</h2>
        <span className="app-aside">{C.featuredCount(games.length)}</span>
      </div>
      <ul role="list" ref={track} className="app-hero-track">
        {games.map((g, i) => (
          <li key={g.id} data-i={i} className="app-hero-slide">
            <a className="app-hero-art focus-ring" href={'#game-' + g.id} tabIndex={-1} aria-hidden="true">
              <Cover game={g} sub eager={i === current} />
            </a>
            <div className="app-hero-info">
              <h3>{g.title}</h3>
              <div><StatusPill game={g} /></div>
              <p>{g.tagline}</p>
              <TagButtons tags={g.tags} />
              <div className="app-acts">
                <ButtonLink variant="primary" href={'#play-' + g.id}>{C.play}</ButtonLink>
                <ButtonLink href={'#game-' + g.id}>{C.details}</ButtonLink>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="app-hero-dots">
        {games.map((g, i) => (
          <button
            key={g.id}
            type="button"
            className="app-hero-dot focus-ring"
            aria-label={g.title}
            aria-pressed={i === current}
            onClick={() => { setHero(i); scrollTo(i, true); }}
          />
        ))}
      </div>
    </section>
  );
}

// 全部游戏里的一张卡：封面、名称与状态、两行简介、类型与已玩时长（旧版 capsule）
function Capsule({ game: g, played }: { game: GameEntry; played?: number }) {
  return (
    <a className="app-cap state-layer focus-ring" href={'#game-' + g.id}>
      <Cover game={g} />
      <span className="app-cap-row"><b>{g.title}</b><StatusPill game={g} /></span>
      <span className="app-cap-tagline">{g.tagline}</span>
      <span className="app-cap-meta">{g.genre}{played ? C.played(fmtPlay(played)) : ''}</span>
    </a>
  );
}

// 首次开通云存档的提示：给恢复码与复制按钮，点「知道了」后不再出现
function CloudNotice({ code }: { code: string }) {
  const services = useServices();
  const toast = useAppToast();
  const copyCode = async () => {
    if (await copyText(code.match(/.{1,4}/g)?.join('-') ?? code)) toast.say(copy.cloud.codeCopied);
    else toast.bad(copy.cloud.copyFailed);
  };
  return (
    <Card className="app-section app-notice" title={copy.cloud.noticeTitle} subtitle={copy.cloud.noticeText}>
      <div className="app-notice-body">
        <RecoveryCode code={code} />
        <div className="app-acts">
          <Button variant="primary" onClick={copyCode}>{copy.cloud.copyCode}</Button>
          <Button variant="text" onClick={() => services.dismissCloudNotice()}>{copy.cloud.noticeDismiss}</Button>
        </div>
      </div>
    </Card>
  );
}
