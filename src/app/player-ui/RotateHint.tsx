// 旋转提示（§13 旋转提示）：方向与游戏偏好不符时在游戏区中间显示，可关掉；同一款游戏只自动提示一次。
import { Icon, IconButton, icons as uiIcons } from '../../ui';
import { extra } from '../player/copy';

export function RotateHint({ lines, onClose }: { lines: readonly string[]; onClose(): void }) {
  return (
    <div className="pl-rotate">
      <div className="pl-rotate-card" role="status" onContextMenu={e => e.preventDefault()}>
        <div className="pl-rotate-text">{lines.map(t => <p key={t}>{t}</p>)}</div>
        <IconButton label={extra.close} icon={<Icon src={uiIcons.close} />} onClick={onClose} />
      </div>
    </div>
  );
}
