import type { GameEntry } from '../../catalog';
import { cx } from '../../ui/cx';
import './Cover.css';

// 有专属标题样式的封面，其余按 auto；名单与旧版 COVER_KINDS 一致
const COVER_KINDS = ['douluo', 'hougong', 'f1', 'nba', 'lol', 'yike', 'f1-driver', 'wealth-reborn', 'basketball-star', 'entertainment-career'];

export interface CoverProps {
  game: GameEntry;
  /** 标题下加副标题 */
  sub?: boolean;
  /** 不叠标题（缩略图） */
  noTitle?: boolean;
  /** 首屏可见的大图立即加载，其余懒加载且优先级低于游戏文件（§15 封面） */
  eager?: boolean;
  className?: string;
}

/** 游戏封面：目录登记的图片，标题叠在左下角 */
export function Cover({ game, sub, noTitle, eager, className }: CoverProps) {
  return (
    <div className={cx('app-cover', className)} data-c={COVER_KINDS.includes(game.id) ? game.id : 'auto'}>
      <img src={'/' + game.cover} alt="" loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'auto' : 'low'} decoding="async" />
      {!noTitle && (
        <div className="app-cover-title">
          {game.title}
          {sub && game.sub && <span className="app-cover-sub">{game.sub}</span>}
        </div>
      )}
    </div>
  );
}
