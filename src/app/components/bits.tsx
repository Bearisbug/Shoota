// 几个页面共用的小件：状态标、标签按钮、类型筛选条、搜索框、恢复码四段显示。
import { useId } from 'react';
import type { GameEntry } from '../../catalog';
import { Button, Icon } from '../../ui';
import { cx } from '../../ui/cx';
import { copy } from '../copy';
import * as icons from '../icons';
import { useAppUi } from '../state';
import './bits.css';

/** 状态标：开发中为黄点，其余为绿点（旧版 statusPill） */
export function StatusPill({ game }: { game: GameEntry }) {
  const dev = game.status === 'dev';
  return <span className="app-pill" data-tone={dev ? 'dev' : 'ok'}>{dev ? copy.status.dev : copy.status.ok}</span>;
}

/** 游戏标签：点了按类型筛选或当搜索词，回到商店 */
export function TagButtons({ tags }: { tags: readonly string[] }) {
  const { applyTag } = useAppUi();
  return (
    <div className="app-tags">
      {tags.map(t => <Button key={t} className="app-tag" onClick={() => applyTag(t)}>{t}</Button>)}
    </div>
  );
}

/** 类型筛选条：「全部」加各类型，带数量，选中的 aria-pressed */
export function GenreChips({ counts, value }: { counts: readonly [string, number][]; value: string }) {
  const { applyTag } = useAppUi();
  return (
    <div className="app-chips" role="group" aria-label={copy.store.genreFilter}>
      {counts.map(([g, n]) => (
        <Button key={g} aria-pressed={g === value} onClick={() => applyTag(g)}>
          {g}<span className="app-chip-n">{n}</span>
        </Button>
      ))}
    </div>
  );
}

/** 搜索框：输入即筛选（旧版 #q） */
export function SearchField({ className }: { className?: string }) {
  const { filter, search } = useAppUi();
  const id = useId();
  return (
    <div className={cx('app-search', 'app-field', 'state-layer', 'focus-ring', 'is-field', className)} role="search">
      <label htmlFor={id} className="sr-only">{copy.search.label}</label>
      <Icon src={icons.search} size="sm" className="app-search-icon" />
      <input
        id={id}
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
        placeholder={copy.search.placeholder}
        value={filter.q}
        onChange={e => search(e.target.value)}
      />
    </div>
  );
}

/** 恢复码按四段显示，读屏念带连字符的整串 */
export function RecoveryCode({ code, className }: { code: string; className?: string }) {
  const groups = code.match(/.{1,4}/g) ?? [];
  return (
    <span className={cx('app-code', className)} role="img" aria-label={groups.join('-')}>
      {groups.map((g, i) => <span key={i} className="app-code-group" aria-hidden="true">{g}</span>)}
    </span>
  );
}
