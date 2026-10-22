import { useId, useRef, type PointerEvent, type ReactNode, type RefObject } from 'react';
import { cx } from './cx';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { close } from './icons';
import { useModal } from './modal';
import './Modal.css';
import './Sheet.css';

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** 标题下一行说明 */
  description?: ReactNode;
  children: ReactNode;
  /** 底部固定的操作区 */
  footer?: ReactNode;
  /** 打开后先聚焦的元素，默认是关闭按钮 */
  initialFocusRef?: RefObject<HTMLElement | null>;
  className?: string;
}

const SLOP = 10;              // 位移超过它才算开始拖，px
const FLICK = 0.11;           // 松手时向下速度超过它直接关，px/ms
const DISMISS_RATIO = 0.35;   // 或者拖过面板高度的这个比例
const RUBBER = 0.55;          // 往上拖过顶端的阻尼系数

/** 从底部升起的半屏面板。按住顶部（把手与标题行）往下拖可关闭，Esc、点遮罩、关闭按钮也能关 */
export function Sheet({ open, onOpenChange, title, description, children, footer, initialFocusRef, className }: SheetProps) {
  const { mounted, dialogRef, panelRef, requestClose } = useModal({ open, onOpenChange, initialFocusRef });
  const titleId = useId();
  const descId = useId();
  const drag = useSheetDrag(dialogRef, panelRef, requestClose);
  if (!mounted) return null;
  return (
    <dialog ref={dialogRef} className={cx('ui-modal', 'ui-sheet', className)} aria-labelledby={titleId} aria-describedby={description ? descId : undefined}>
      <div className="ui-modal-scrim" onClick={requestClose} />
      <div ref={panelRef} className="ui-sheet-panel">
        <div className="ui-sheet-head" {...drag}>
          <span className="ui-sheet-grabber" aria-hidden="true" />
          <div className="ui-sheet-titles">
            <h2 id={titleId} className="ui-sheet-title">{title}</h2>
            {description && <p id={descId} className="ui-sheet-description">{description}</p>}
          </div>
          <IconButton label="关闭" icon={<Icon src={close} size="md" />} variant="filled" size="sm" onClick={requestClose} />
        </div>
        <div className="ui-sheet-body">{children}</div>
        {footer && <div className="ui-sheet-foot">{footer}</div>}
      </div>
    </dialog>
  );
}

interface DragState {
  id: number;
  startY: number;
  from: number;
  dragging: boolean;
  samples: Array<[time: number, y: number]>;
}

// 拖动全程 1:1 跟手；松手后去掉内联位移，由样式里的过渡从当前位置走到终点（回弹或关闭）
function useSheetDrag(dialogRef: RefObject<HTMLDialogElement | null>, panelRef: RefObject<HTMLDivElement | null>, dismiss: () => void) {
  const state = useRef<DragState | null>(null);

  const place = (panel: HTMLElement, y: number) => {
    const h = panel.offsetHeight;
    const shown = y < 0 ? -(-y * h * RUBBER) / (h + RUBBER * -y) : y;
    panel.style.transform = `translateY(${shown}px)`;
    dialogRef.current?.style.setProperty('--ui-sheet-progress', String(1 - Math.min(1, Math.max(0, shown) / h)));
  };

  const end = (commit: boolean) => {
    const s = state.current;
    const panel = panelRef.current;
    const dialog = dialogRef.current;
    state.current = null;
    if (!s?.dragging || !panel || !dialog) return;
    const [t0, y0] = s.samples[0];
    const [t1, y1] = s.samples[s.samples.length - 1];
    const velocity = t1 > t0 ? (y1 - y0) / (t1 - t0) : 0;
    const offset = s.from + y1 - s.startY;
    delete dialog.dataset.dragging;
    panel.style.transform = '';
    dialog.style.removeProperty('--ui-sheet-progress');
    if (commit && (velocity > FLICK || offset > panel.offsetHeight * DISMISS_RATIO)) dismiss();
  };

  return {
    onPointerDown(e: PointerEvent<HTMLDivElement>) {
      const panel = panelRef.current;
      if (state.current || !panel || !e.isPrimary || e.button !== 0) return;
      // 回弹途中被再次按住：从面板当前所在的位置接着拖
      const t = getComputedStyle(panel).transform;
      const from = t === 'none' ? 0 : new DOMMatrixReadOnly(t).m42;
      state.current = { id: e.pointerId, startY: e.clientY, from, dragging: false, samples: [[e.timeStamp, e.clientY]] };
    },
    onPointerMove(e: PointerEvent<HTMLDivElement>) {
      const s = state.current;
      const panel = panelRef.current;
      if (!s || e.pointerId !== s.id || !panel) return;
      // pointerup 可能永远不到（指针移出窗口后松开），没按键就当拖动结束
      if (e.buttons === 0) return end(false);
      if (!s.dragging) {
        if (Math.abs(e.clientY - s.startY) < SLOP) return;
        s.dragging = true;
        s.startY = e.clientY;
        s.samples = [[e.timeStamp, e.clientY]];
        e.currentTarget.setPointerCapture(e.pointerId);
        if (dialogRef.current) dialogRef.current.dataset.dragging = '';
      }
      s.samples.push([e.timeStamp, e.clientY]);
      if (s.samples.length > 5) s.samples.shift();
      place(panel, s.from + e.clientY - s.startY);
    },
    onPointerUp(e: PointerEvent<HTMLDivElement>) {
      if (state.current?.id === e.pointerId) end(true);
    },
    onPointerCancel(e: PointerEvent<HTMLDivElement>) {
      if (state.current?.id === e.pointerId) end(false);
    },
  };
}
