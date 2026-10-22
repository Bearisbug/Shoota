import { useCallback, useEffect, useRef, useState } from 'react';
import type { KanbanData } from '../shared';

const TIMEOUT_MS = 15000; // API-004：前端超时 15 秒

export interface KanbanState {
  data: KanbanData | null;
  loading: boolean;
  error: string | null; // 读取失败的整句提示；失败时已有的 data 保留
}

// 读取失败的提示，文案沿用旧版
export function failText(e: unknown) {
  const why = (e as { name?: unknown } | null)?.name === 'AbortError' ? '15 秒内没有响应'
    : e instanceof TypeError ? '网络断开' // fetch 连不上服务器时各浏览器的报错文字不同，类型都是 TypeError
    : e instanceof Error ? e.message
    : String(e);
  return `读取失败：${why}。检查网络后点重试。`;
}

// 读 /kanban/data：同一时间只发一个请求；401 说明会话过期，整页刷新回到登录页
export function useKanbanData() {
  const [state, setState] = useState<KanbanState>({ data: null, loading: true, error: null });
  const busy = useRef(false);

  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setState(s => ({ ...s, loading: true }));
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch('/kanban/data', { credentials: 'same-origin', signal: ctl.signal, cache: 'no-store' });
      if (res.status === 401) {
        location.reload();
        return;
      }
      if (!res.ok) throw new Error('服务器返回 ' + res.status);
      const data = (await res.json()) as KanbanData;
      setState({ data, loading: false, error: null });
    } catch (e) {
      setState(s => ({ ...s, loading: false, error: failText(e) }));
    } finally {
      clearTimeout(timer);
      busy.current = false;
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return { ...state, load };
}
