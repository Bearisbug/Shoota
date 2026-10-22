// 提示条沿用旧版时长：普通 3.6 秒、成就 5.2 秒；旧版的 bad 红边对应 error。游戏页同样用它
import { useMemo, type ReactNode } from 'react';
import { useToast, type ToastOptions } from '../ui';
import { copy } from './copy';

export function useAppToast() {
  const toast = useToast();
  return useMemo(() => ({
    say: (message: ReactNode, action?: ToastOptions['action']) => toast.show({ message, action, duration: copy.toastMs.normal }),
    bad: (message: ReactNode) => toast.show({ message, tone: 'error', duration: copy.toastMs.normal }),
    achievement: (message: ReactNode) => toast.show({ message, duration: copy.toastMs.achievement }),
  }), [toast]);
}
