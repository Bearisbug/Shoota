// 旋转提示（§13 旋转提示）：方向与游戏偏好不符时在游戏区顶部居中显示一条，5 秒后自动收起，可提前关掉；同一款游戏只自动提示一次。
// 只有关闭按钮接收点击，提示盖住的地方照常点得到游戏。收起的过渡播完才交给 onClose 卸载。
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon, IconButton, icons as uiIcons } from '../../ui';
import { extra } from '../player/copy';

const SHOW_MS = 5000;

export function RotateHint({ lines, onClose }: { lines: readonly string[]; onClose(): void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'closed' | 'open'>('closed');

  // 先按收起态排版再打开，进场过渡才会播
  useLayoutEffect(() => {
    ref.current?.getBoundingClientRect();
    setState('open');
  }, []);
  useEffect(() => {
    if (state !== 'open') return;
    const t = setTimeout(() => setState('closed'), SHOW_MS);
    return () => clearTimeout(t);
  }, [state]);

  return (
    <div
      ref={ref}
      className="pl-rotate"
      data-state={state}
      onTransitionEnd={e => { if (state === 'closed' && e.target === e.currentTarget && e.propertyName === 'opacity') onClose(); }}
    >
      <div className="pl-rotate-card" role="status" onContextMenu={e => e.preventDefault()}>
        <div className="pl-rotate-text">{lines.map(t => <p key={t}>{t}</p>)}</div>
        <IconButton className="pl-rotate-close" label={extra.close} size="sm" icon={<Icon src={uiIcons.close} />} onClick={() => setState('closed')} />
      </div>
    </div>
  );
}
