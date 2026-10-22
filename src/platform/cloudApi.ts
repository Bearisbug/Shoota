// 云存档三个接口的请求（docs/DESIGN.md §8 API-CLOUD-001～003、§14 错误码）。形状只取自 src/shared/api.ts。
import { SAVE_AUTH_SCHEME, type CloudAccountBody, type CloudAccountResult, type CloudRecoverBody, type CloudRecoverResult, type CloudSyncResult, type Problem } from '../shared';

// 前端超时：开通与恢复 15 秒，同步 20 秒（§8）
const ACCOUNT_MS = 15_000, RECOVER_MS = 15_000, SYNC_MS = 20_000;

// network 含超时、断网与 5xx 一类服务端故障：本机不变，下一分钟再来
export type CloudFail = 'network' | 'bad-request' | 'auth' | 'not-found' | 'exists' | 'too-large' | 'code-unknown';
export type CloudReply<T> = { ok: true; status: number; data: T } | { ok: false; fail: CloudFail };

function failOf(status: number, type: string | undefined): CloudFail {
  if (status === 400) return 'bad-request';
  if (status === 401) return 'auth';
  if (status === 409) return 'exists';
  if (status === 413) return 'too-large';
  if (status === 404 && type === '/errors/cloud-not-found') return 'not-found';
  if (status === 404 && type === '/errors/recovery-code-unknown') return 'code-unknown';
  return 'network'; // 其余（含没带错误信封的 404，比如 Worker 还没有这个接口）
}

async function post<T>(path: string, body: string, o: { saveId?: string; ms: number; keepalive?: boolean }): Promise<CloudReply<T>> {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), o.ms);
  try {
    const headers: Record<string, string> = { 'content-type':'application/json' };
    if (o.saveId) headers.authorization = `${SAVE_AUTH_SCHEME} ${o.saveId}`;
    const r = await fetch(path, { method:'POST', body, headers, signal:ctl.signal, keepalive:o.keepalive });
    if (r.ok) return { ok:true, status:r.status, data:await r.json() as T };
    let type: string | undefined;
    try { type = (await r.json() as Partial<Problem>).type; } catch (e) {}
    return { ok:false, fail:failOf(r.status, type) };
  } catch (e) { return { ok:false, fail:'network' }; }
  finally { clearTimeout(t); }
}

export const createAccountApi = (saveId: string, code: string) =>
  post<CloudAccountResult>('/api/cloud/account', JSON.stringify({ code } satisfies CloudAccountBody), { saveId, ms:ACCOUNT_MS });
export const recoverApi = (code: string) =>
  post<CloudRecoverResult>('/api/cloud/recover', JSON.stringify({ code } satisfies CloudRecoverBody), { ms:RECOVER_MS });
// body 是已经序列化好的 CloudSyncBody：调用方要先量正文大小
export const syncApi = (saveId: string, body: string, keepalive: boolean) =>
  post<CloudSyncResult>('/api/cloud/sync', body, { saveId, ms:SYNC_MS, keepalive });
