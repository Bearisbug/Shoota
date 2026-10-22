// 游戏面板（§13 游戏面板）：手机竖屏从底部弹出，手机横屏从右侧滑出，平板与电脑在悬浮按钮旁弹出。
// 内容顺序：游戏名与进度文字、存档状态、云存档状态、本次时长、全屏或引导、旋转说明、恢复默认按钮位置、退出游戏。
// 点面板外、按 Esc 或点关闭都关掉；面板开着时游戏照常运行。
import { useLayoutEffect } from 'react';
import type { GameEntry } from '../../catalog';
import { Button, Icon, IconButton, List, ListRow, icons as uiIcons } from '../../ui';
import { useModal } from '../../ui/modal';
import '../../ui/Modal.css';
import { copy } from '../copy';
import type { FullscreenMode } from '../player/env';
import { extra } from '../player/copy';
import { popoverPos, type Area, type Placement, type Pos } from './geometry';

export interface PlayerPanelProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  placement: Placement;
  /** 在按钮旁弹出时据此定位 */
  anchor: { area: Area; btn: Pos } | null;
  game: GameEntry;
  statusText: string;
  saveText: string;
  /** 云存档状态；long 的放到第二行 */
  cloud: { text: string; long: boolean };
  secs: number;
  fullscreen: { mode: FullscreenMode; on: boolean };
  /** 旋转说明，手持设备且游戏有偏好方向时才有 */
  rotateNote: readonly string[];
  onFullscreen(): void;
  onInstall(): void;
  onWechat(): void;
  onResetFloat(): void;
  onExit(): void;
}

export function PlayerPanel(p: PlayerPanelProps) {
  const { open, onOpenChange, placement, anchor } = p;
  const { mounted, dialogRef, panelRef, requestClose } = useModal({ open, onOpenChange });

  // 按钮旁弹出：量出面板高度后再摆，整块留在游戏区内
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!mounted || !el) return;
    if (placement !== 'popover' || !anchor) {
      el.style.removeProperty('left');
      el.style.removeProperty('top');
      return;
    }
    const at = popoverPos(anchor.area, anchor.btn, el.offsetHeight);
    el.style.left = at.x + 'px';
    el.style.top = at.y + 'px';
  });

  if (!mounted) return null;
  const fs = p.fullscreen;
  return (
    <dialog
      ref={dialogRef}
      className="ui-modal pl-panel"
      data-placement={placement}
      aria-label={copy.player.panelTitle}
      onContextMenu={e => e.preventDefault()}
    >
      <div className="ui-modal-scrim" onClick={requestClose} />
      <div ref={panelRef} className="pl-panel-box">
        <header className="pl-panel-head">
          <div className="pl-panel-titles">
            <h2>{p.game.title}</h2>
            {p.statusText && <p>{p.statusText}</p>}
          </div>
          <IconButton label={extra.close} icon={<Icon src={uiIcons.close} />} variant="filled" onClick={requestClose} />
        </header>
        <div className="pl-panel-body">
          <List>
            <ListRow title={extra.saveTitle} value={p.saveText} />
            {p.cloud.long
              ? <ListRow title={extra.cloudTitle} subtitle={p.cloud.text} />
              : <ListRow title={extra.cloudTitle} value={p.cloud.text} />}
            <ListRow title={extra.sessionTitle} value={copy.player.elapsed(p.secs)} />
          </List>
          {(fs.mode === 'auto' || fs.mode === 'button') && (
            <Button block onClick={p.onFullscreen}>{fs.on ? extra.exitFullscreen : copy.player.fullscreen}</Button>
          )}
          {fs.mode === 'install' && <Button block onClick={p.onInstall}>{copy.player.installGuide}</Button>}
          {fs.mode === 'wechat' && <Button block onClick={p.onWechat}>{copy.player.wechatGuide}</Button>}
          {p.rotateNote.length > 0 && <div className="pl-panel-note">{p.rotateNote.map(t => <p key={t}>{t}</p>)}</div>}
          <Button block variant="text" onClick={p.onResetFloat}>{copy.player.resetFloat}</Button>
          <Button block onClick={p.onExit}>{copy.player.exit}</Button>
        </div>
      </div>
    </dialog>
  );
}
