// 网页里的 Transport：游戏页 /play/<游戏>/ 放在平台页面的同源 iframe 里，只认父窗口、同源发来的消息（API-SDK-001）。
// 直接打开游戏页时父窗口就是自己，判定为不在平台里打开。

import type { ShootaClient, Transport } from './client';

export function windowTransport(win: Window = window): Transport {
  const parent = win.parent;
  const embedded = !!parent && parent !== win;
  const origin = win.location.origin;
  return {
    embedded,
    send(msg) {
      if (embedded) parent.postMessage(msg, origin);
    },
    listen(fn) {
      const on = (e: MessageEvent) => {
        if (e.source !== parent || e.origin !== origin) return;
        fn(e.data);
      };
      win.addEventListener('message', on);
      return () => win.removeEventListener('message', on);
    },
  };
}

// 就绪前的第一个未捕获错误报给平台（平台到 15 秒时记为游戏报错）；就绪后 reportError 自己不发
export function captureBootErrors(client: ShootaClient, win: Window = window): () => void {
  const onError = (e: ErrorEvent) => client.reportError(e.message || 'error');
  const onRejection = (e: PromiseRejectionEvent) => {
    const r = e.reason as { message?: unknown } | undefined;
    client.reportError(String((r && r.message) || r || 'error'));
  };
  win.addEventListener('error', onError);
  win.addEventListener('unhandledrejection', onRejection);
  return () => {
    win.removeEventListener('error', onError);
    win.removeEventListener('unhandledrejection', onRejection);
  };
}
