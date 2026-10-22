// 悬浮按钮（§13 悬浮按钮）：游戏页唯一常驻的平台控件。点一下打开游戏面板；按住拖动，松手贴到最近的左边或右边。
// 位置用 CSS translate 摆，不用 transform：按下时组件库的按压缩放用的是 transform，两者互不覆盖。
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import appIcon from '../../../brand/assets/logo/app-icon.svg';
import type { FloatSpot } from '../../shared/save';
import { IconButton } from '../../ui';
import { copy } from '../copy';
import { clampToArea, FLOAT, snap, type Area, type Pos } from './geometry';

export interface FloatingControlProps {
  area: Area;
  /** 按钮左上角，由记住的位置算出 */
  pos: Pos;
  /** 最近一次真正写入存档的时间，变了就亮小点 2 秒 */
  savedAt: number;
  panelOpen: boolean;
  onOpen(): void;
  onMoveEnd(spot: FloatSpot): void;
}

interface Press { id: number; sx: number; sy: number; ox: number; oy: number; moved: boolean }

export function FloatingControl({ area, pos, savedAt, panelOpen, onOpen, onMoveEnd }: FloatingControlProps) {
  const [drag, setDrag] = useState<Pos | null>(null);
  const press = useRef<Press | null>(null);
  const dragged = useRef(false); // 拖动后浏览器可能补发一次 click，吞掉它
  const idle = useIdle(panelOpen);
  const dot = useDot(savedAt);
  const at = drag ?? pos;

  const follow = (p: Press, e: PointerEvent) => clampToArea(area, { x: e.clientX - p.ox, y: e.clientY - p.oy });
  const finish = (e: PointerEvent<HTMLButtonElement>, commit: boolean) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    press.current = null;
    idle.wake();
    if (p.moved) {
      dragged.current = true;
      onMoveEnd(snap(area, commit ? follow(p, e) : drag ?? pos));
    }
    setDrag(null);
  };

  return (
    <IconButton
      label={copy.player.floatLabel}
      icon={<><img className="pl-float-icon" src={appIcon} alt="" draggable={false} /><span className="pl-float-dot" aria-hidden="true" /></>}
      variant="material"
      className="pl-float"
      style={{ translate: `${at.x}px ${at.y}px` }}
      aria-haspopup="dialog"
      aria-expanded={panelOpen}
      data-idle={idle.on || undefined}
      data-dragging={drag ? '' : undefined}
      data-dot={dot ? 'on' : undefined}
      onContextMenu={e => e.preventDefault()}
      onFocus={idle.wake}
      onPointerEnter={idle.wake}
      onPointerDown={e => {
        idle.wake();
        dragged.current = false;
        if (!e.isPrimary || e.button !== 0) return;
        press.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: e.clientX - pos.x, oy: e.clientY - pos.y, moved: false };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={e => {
        const p = press.current;
        if (!p || p.id !== e.pointerId) return;
        if (!p.moved && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < FLOAT.slop) return;
        p.moved = true;
        setDrag(follow(p, e));
      }}
      onPointerUp={e => finish(e, true)}
      onPointerCancel={e => finish(e, false)}
      onClick={() => {
        if (dragged.current) {
          dragged.current = false;
          return;
        }
        onOpen();
      }}
    />
  );
}

// 3 秒没碰变淡；面板开着时不计时
function useIdle(paused: boolean) {
  const [on, setOn] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => setOn(true), FLOAT.idleMs);
    return () => clearTimeout(t);
  }, [tick, paused]);
  return {
    on: on && !paused,
    wake: () => {
      setOn(false);
      setTick(n => n + 1);
    },
  };
}

// 存档写入后亮 2 秒；挂载时离上次写入不到 2 秒也亮（重开游戏时游戏马上写了一次）
function useDot(savedAt: number) {
  const [lit, setLit] = useState(false);
  useEffect(() => {
    const left = savedAt + FLOAT.dotMs - Date.now();
    if (!savedAt || left <= 0) return;
    setLit(true);
    const t = setTimeout(() => setLit(false), left);
    return () => clearTimeout(t);
  }, [savedAt]);
  return lit;
}
