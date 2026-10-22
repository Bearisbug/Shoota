// 单测用的假下载：按次序给每次请求指定行为，复现三种卡住（不回首字节、中途停住）与各种失败。
// 请求被 abort 时按浏览器的行为抛 AbortError：还没回响应头时 fetch 本身 reject，已经在读正文时 read() reject。

export type FetchMode =
  | 'ok' // 整份发完
  | 'hang' // 一直不回首字节
  | 'stall' // 发一半后停住
  | 'trickle' // 每 tickMs 发一小块，一直不停顿（配合假时钟测总时长超时）
  | 'offline' // 网络层直接报错
  | 404
  | 500;

export interface FakeFetch {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  calls: string[];
  aborted: number;
}

const abortError = () => new DOMException('The operation was aborted.', 'AbortError');

// body：要下载的正文；plan(第几次请求, 地址) 决定这次怎么回；trickle 模式靠 tick() 推一块
export function fakeFetch(body: string, plan: (n: number, url: string) => FetchMode, trickle?: { onPull: (push: () => void) => void }): FakeFetch {
  const bytes = new TextEncoder().encode(body);
  const out: FakeFetch = { calls: [], aborted: 0, fetch: () => Promise.reject(new Error('unreachable')) };
  out.fetch = (url, init) => {
    const n = out.calls.push(url);
    const mode = plan(n, url);
    const signal = init.signal ?? undefined;
    return new Promise<Response>((resolve, reject) => {
      if (signal?.aborted) return reject(abortError());
      const onAbort = () => {
        out.aborted++;
        reject(abortError());
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      if (mode === 'hang') return;
      if (mode === 'offline') return reject(new TypeError('Failed to fetch'));
      if (mode === 404 || mode === 500) return resolve(new Response('not served', { status: mode }));
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          signal?.addEventListener('abort', () => c.error(abortError()), { once: true });
          if (mode === 'ok') {
            c.enqueue(bytes.slice(0, bytes.length >> 1));
            c.enqueue(bytes.slice(bytes.length >> 1));
            c.close();
          } else if (mode === 'stall') {
            c.enqueue(bytes.slice(0, bytes.length >> 1));
          } else if (mode === 'trickle') {
            let at = 0;
            const push = () => {
              if (at >= bytes.length || signal?.aborted) return;
              c.enqueue(bytes.slice(at, at + 64));
              at += 64;
              if (at >= bytes.length) c.close();
            };
            trickle?.onPull(push);
          }
        },
      });
      signal?.removeEventListener('abort', onAbort);
      signal?.addEventListener('abort', () => out.aborted++, { once: true });
      resolve(new Response(stream, { status: 200 }));
    });
  };
  return out;
}
