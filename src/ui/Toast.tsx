import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cx } from './cx';
import { Icon } from './Icon';
import { circleAlert, circleCheck } from './icons';
import './Toast.css';

export type ToastTone = 'neutral' | 'success' | 'error';

export interface ToastOptions {
  message: ReactNode;
  /** success / error 带状态图标。默认 neutral */
  tone?: ToastTone;
  /** 一个跟这条提示相关的动作，如「撤回」 */
  action?: { label: string; onClick: () => void };
  /** 显示多久，ms；0 表示直到用户点掉或被下一条顶掉。默认 4000，页面在后台时暂停计时 */
  duration?: number;
}

export interface ToastApi {
  /** 显示一条提示；已有提示时直接替换 */
  show: (options: ToastOptions) => void;
  dismiss: () => void;
}

const DEFAULT_DURATION = 4000;
const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast 需要在 <ToastProvider> 里使用');
  return api;
}

type Current = ToastOptions & { key: number };

/** 底部居中的提示条。手机竖屏有标签栏时自动让到标签栏上方；支持 popover 的浏览器里放进顶层，Sheet 打开时也不被遮住 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const regionRef = useRef<HTMLDivElement>(null);
  const toastRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  const [current, setCurrent] = useState<Current | null>(null);
  const [state, setState] = useState<'closed' | 'open'>('closed');

  const show = useCallback((options: ToastOptions) => {
    seq.current += 1;
    setCurrent({ ...options, key: seq.current });
    setState('closed');
  }, []);
  const dismiss = useCallback(() => setState('closed'), []);
  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  // 提示区常驻顶层，读屏的实时区域一直在
  useLayoutEffect(() => {
    const region = regionRef.current;
    if (region && typeof region.showPopover === 'function' && !region.matches(':popover-open')) region.showPopover();
  }, []);

  // 每条新提示：有模态弹层开着时把提示区重新放回顶层最上面；先按关闭态排版再打开，进场过渡才会播
  useLayoutEffect(() => {
    const region = regionRef.current;
    if (!current || !region) return;
    if (typeof region.showPopover === 'function' && document.querySelector('dialog:modal')) {
      if (region.matches(':popover-open')) region.hidePopover();
      region.showPopover();
    }
    toastRef.current?.getBoundingClientRect();
    setState('open');
  }, [current]);

  // 到点自动收起；页面切到后台时暂停
  useEffect(() => {
    if (!current || state !== 'open') return;
    const duration = current.duration ?? DEFAULT_DURATION;
    if (!(duration > 0) || !Number.isFinite(duration)) return;
    let remaining = duration;
    let startedAt = 0;
    let timer: number | undefined;
    const run = () => {
      startedAt = performance.now();
      timer = window.setTimeout(() => setState('closed'), remaining);
    };
    const onVisibility = () => {
      if (document.hidden) {
        window.clearTimeout(timer);
        remaining -= performance.now() - startedAt;
      } else {
        run();
      }
    };
    run();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [current, state]);

  const tone = current?.tone ?? 'neutral';
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div ref={regionRef} popover="manual" className="ui-toast-region" role="status" aria-live="polite">
        {current && (
          <div
            key={current.key}
            ref={toastRef}
            className={cx('ui-toast', `ui-toast-${tone}`, current.action && 'ui-toast-has-action')}
            data-state={state}
            onTransitionEnd={e => {
              if (e.target === e.currentTarget && e.propertyName === 'opacity' && state === 'closed') setCurrent(null);
            }}
          >
            {tone !== 'neutral' && <Icon src={tone === 'success' ? circleCheck : circleAlert} size="md" className="ui-toast-icon" />}
            <span className="ui-toast-message">{current.message}</span>
            {current.action && (
              <button
                type="button"
                className="ui-toast-action state-layer focus-ring"
                onClick={() => {
                  current.action?.onClick();
                  dismiss();
                }}
              >
                {current.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
