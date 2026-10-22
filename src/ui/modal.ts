import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

/** 退场等不到 transitionend（标签页在后台、系统关掉了过渡）时最多等这么久，ms */
const EXIT_FALLBACK_MS = 500;

/** 滚动锁：计数存在 html 的 data-scroll-lock 上（样式见 src/styles/base.css），嵌套弹层逐个关闭后才解锁 */
function lockScroll(): () => void {
  const root = document.documentElement;
  root.dataset.scrollLock = String(Number(root.dataset.scrollLock ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const n = Number(root.dataset.scrollLock ?? 1) - 1;
    if (n > 0) root.dataset.scrollLock = String(n);
    else delete root.dataset.scrollLock;
  };
}

export interface ModalOptions {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 打开后先聚焦的元素；破坏性确认指向「取消」 */
  initialFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * 原生 <dialog> 模态：showModal 负责置顶、背景 inert 和 Esc；这里补上受控开关、进退场过渡和滚动锁。
 * 过渡按 dialog 的 data-state（open / closed）写在样式里，panelRef 指向做过渡的那一层，退场以它的 transitionend 为准。
 */
export function useModal({ open, onOpenChange, initialFocusRef }: ModalOptions) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  useLayoutEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  });

  // 挂载期间：置顶、锁滚动、接管 Esc
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!mounted || !dialog) return;
    if (!dialog.open) dialog.showModal();
    const release = lockScroll();
    const onCancel = (e: Event) => {
      e.preventDefault();
      onOpenChangeRef.current(false);
    };
    // 连按 Esc 时浏览器会不经 cancel 直接关掉 dialog，这里同步回受控状态
    const onClose = () => {
      setMounted(false);
      onOpenChangeRef.current(false);
    };
    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('close', onClose);
    return () => {
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('close', onClose);
      if (dialog.open) dialog.close();
      release();
    };
  }, [mounted]);

  // 进场：先按关闭态排一次版再切到 open，过渡才会播；退场：播完再卸载
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const panel = panelRef.current;
    if (!mounted || !dialog || !panel) return;
    if (open) {
      panel.getBoundingClientRect();
      dialog.dataset.state = 'open';
      initialFocusRef?.current?.focus();
      return;
    }
    dialog.dataset.state = 'closed';
    const finish = () => setMounted(false);
    const timer = window.setTimeout(finish, EXIT_FALLBACK_MS);
    const onEnd = (e: TransitionEvent) => {
      if (e.target === panel) finish();
    };
    panel.addEventListener('transitionend', onEnd);
    return () => {
      window.clearTimeout(timer);
      panel.removeEventListener('transitionend', onEnd);
    };
  }, [open, mounted, initialFocusRef]);

  return { mounted, dialogRef, panelRef, requestClose: () => onOpenChangeRef.current(false) };
}
