// 媒体查询订阅。断点与 src/ui/AppShell.css 的三种排布一致（媒体查询里不能用变量，改一处要同步另外两处）
import { useSyncExternalStore } from 'react';

export const WIDE = '(min-width: 1024px) and (min-height: 501px)'; // 分组侧栏加顶栏
export const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    fn => {
      if (typeof matchMedia !== 'function') return () => {};
      const mq = matchMedia(query);
      mq.addEventListener('change', fn);
      return () => mq.removeEventListener('change', fn);
    },
    () => typeof matchMedia === 'function' && matchMedia(query).matches,
    () => false,
  );
}

const subscribeOnline = (fn: () => void) => {
  window.addEventListener('online', fn);
  window.addEventListener('offline', fn);
  return () => {
    window.removeEventListener('online', fn);
    window.removeEventListener('offline', fn);
  };
};

export const useOnline = () => useSyncExternalStore(subscribeOnline, () => navigator.onLine !== false, () => true);
