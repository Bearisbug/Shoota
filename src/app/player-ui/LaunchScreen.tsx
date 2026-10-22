// 载入页与失败页（§13 载入页与失败页，FLOW-LAUNCH 分支）：盖在游戏区上面，就绪后撤掉。
// 载入页：封面、名称、进度条（旧游戏按已收字节，改写游戏不定进度）、自动重试提示与「退出」；失败页：按原因给文案，「重试」与「退出」。
import type { GameEntry } from '../../catalog';
import { Button, ProgressBar } from '../../ui';
import { Cover } from '../components/Cover';
import { copy } from '../copy';
import { extra } from '../player/copy';
import type { PlayerView } from '../player/player';

export interface LaunchScreenProps {
  game: GameEntry;
  view: PlayerView;
  onRetry(): void;
  onExit(): void;
}

export function LaunchScreen({ game, view, onRetry, onExit }: LaunchScreenProps) {
  const failed = view.status === 'failed';
  return (
    <div className="pl-launch" data-state={failed ? 'failed' : 'loading'} onContextMenu={e => e.preventDefault()}>
      <div className="pl-launch-card">
        <Cover game={game} noTitle eager className="pl-launch-cover" />
        <div className="pl-launch-info">
          <h1 className="pl-launch-title">{game.title}</h1>
          {failed ? (
            <>
              <h2 className="pl-launch-fail">{extra.failTitle}</h2>
              <p role="alert">{copy.launch.fail[view.reason ?? 'net-error']}</p>
              <div className="pl-launch-acts">
                <Button variant="primary" onClick={onRetry}>{copy.launch.retry}</Button>
                <Button onClick={onExit}>{copy.launch.exit}</Button>
              </div>
            </>
          ) : (
            <>
              <p className="pl-launch-msg">{copy.launch.loading}</p>
              <ProgressBar value={view.progress} label={copy.launch.loading} />
              <p className="pl-launch-retry" role="status">{view.retrying ? copy.launch.retrying : ''}</p>
              <div className="pl-launch-acts">
                <Button variant="text" onClick={onExit}>{copy.launch.exit}</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
