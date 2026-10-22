import { useId, type ReactNode, type RefObject } from 'react';
import { cx } from './cx';
import { useModal } from './modal';
import './Modal.css';
import './Dialog.css';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** 标题下的说明：发生了什么、会影响什么 */
  description?: ReactNode;
  /** 说明之外的内容（表单、恢复码等） */
  children?: ReactNode;
  /** 底部按钮，必须含一个能关掉对话框的按钮（「取消」「好」） */
  actions: ReactNode;
  /** alertdialog：需要用户明确选择，点遮罩不关。默认 dialog */
  role?: 'dialog' | 'alertdialog';
  /** 打开后先聚焦的元素；破坏性确认指向「取消」 */
  initialFocusRef?: RefObject<HTMLElement | null>;
  className?: string;
}

/** 居中对话框：确认、提示、短表单。Esc 关闭 */
export function Dialog({ open, onOpenChange, title, description, children, actions, role = 'dialog', initialFocusRef, className }: DialogProps) {
  const { mounted, dialogRef, panelRef, requestClose } = useModal({ open, onOpenChange, initialFocusRef });
  const titleId = useId();
  const descId = useId();
  if (!mounted) return null;
  return (
    <dialog ref={dialogRef} role={role} className={cx('ui-modal', 'ui-dialog', className)} aria-labelledby={titleId} aria-describedby={description ? descId : undefined}>
      <div className="ui-modal-scrim" onClick={role === 'dialog' ? requestClose : undefined} />
      <div ref={panelRef} className="ui-dialog-panel">
        <h2 id={titleId} className="ui-dialog-title">{title}</h2>
        {description && <p id={descId} className="ui-dialog-description">{description}</p>}
        {children}
        <div className="ui-dialog-actions">{actions}</div>
      </div>
    </dialog>
  );
}
