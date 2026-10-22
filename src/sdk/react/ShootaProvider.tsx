// React 接入层：只调 core。游戏入口先 connectShoota 再渲染，ShootaProvider 等平台的 welcome 到了才渲染游戏，
// 判定为不在平台里打开时换成「请从 shoota.ai 打开」的提示（PAGE-PLAY-FRAME）。

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { captureBootErrors, createClient, shellLayout, windowTransport, type ShellLayout, type ShootaClient, type SuspendReason } from '../core';
import type { PlayEnv } from '../../shared/protocol';

let shared: ShootaClient | null = null;

// 一个页面只连一次：开发模式重复挂载、热更新都拿同一个连接，平台只收到一个 hello
export function connectShoota({ game, build }: { game: string; build?: string }): ShootaClient {
  if (shared?.gameId === game) return shared;
  shared?.destroy();
  const client = createClient({ game, build, transport: windowTransport() });
  captureBootErrors(client);
  shared = client;
  return client;
}

const ClientContext = createContext<ShootaClient | null>(null);

export function useShoota(): ShootaClient {
  const c = useContext(ClientContext);
  if (!c) throw new Error('useShoota 要放在 ShootaProvider 里面用');
  return c;
}

const useClientValue = <T,>(client: ShootaClient, read: (c: ShootaClient) => T) =>
  useSyncExternalStore(client.subscribe, () => read(client), () => read(client));

export function ShootaProvider({ client, children }: { client: ShootaClient; children: ReactNode }) {
  const state = useClientValue(client, c => c.state);
  if (state === 'orphan') return <OrphanNotice gameId={client.gameId} />;
  if (state !== 'connected') return null;
  return <ClientContext.Provider value={client}>{children}</ClientContext.Provider>;
}

function OrphanNotice({ gameId }: { gameId: string }) {
  return (
    <div className="gs-orphan" role="alert">
      <p className="gs-orphan-title">请从 shoota.ai 打开</p>
      <p className="gs-orphan-text">这款游戏要在 shoota 游戏平台里玩，进度才会保存。</p>
      <a className="gs-orphan-link gs-hit" href={`/#game-${encodeURIComponent(gameId)}`} target="_top">去 shoota.ai 打开</a>
    </div>
  );
}

/** 游戏区的实时环境：方向、全屏、尺寸、打开环境、减弱动态效果 */
export function useEnv(): PlayEnv | null {
  return useClientValue(useShoota(), c => c.env);
}

/** 方向与顶部信息区是否该收成一行，跟着平台的 env 消息变 */
export function useLayout(): ShellLayout {
  const env = useEnv();
  const w = env?.width ?? (typeof innerWidth === 'number' ? innerWidth : 0);
  const h = env?.height ?? (typeof innerHeight === 'number' ? innerHeight : 0);
  return shellLayout({ width: w, height: h });
}

/** 第一帧可操作的画面画出来后告诉平台关掉载入页；when 为 false 时先不发（如还在解码图片） */
export function useReady(when = true) {
  const client = useShoota();
  useEffect(() => {
    if (!when) return;
    const raf = requestAnimationFrame(() => client.ready());
    return () => cancelAnimationFrame(raf);
  }, [client, when]);
}

/** 平台退出或页面隐藏前回调，在这里把手里没存的进度写进 storage；平台最多等 0.5 秒 */
export function useSuspend(fn: (reason: SuspendReason) => void | Promise<void>) {
  const client = useShoota();
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  useEffect(() => client.onSuspend(reason => ref.current(reason)), [client]);
}

export { useClientValue };
