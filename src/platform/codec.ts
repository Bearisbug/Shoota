// 存档码与云同步共用的编码小工具。base64 按 0x8000 字节分块拼接，与旧版 encodeSaves（dd731d6 public/index.html）一致。

export const utf8 = (s: string) => new TextEncoder().encode(s);
export const utf8Bytes = (s: string) => utf8(s).length;

export function toBase64(bytes: Uint8Array): string {
  let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export const fromBase64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export const canGzip = () => typeof CompressionStream === 'function';
export const canGunzip = () => typeof DecompressionStream === 'function';
const pipe = (bytes: Uint8Array<ArrayBuffer>, t: CompressionStream | DecompressionStream) =>
  new Response(new Blob([bytes]).stream().pipeThrough(t)).arrayBuffer().then(b => new Uint8Array(b));
export const gzip = (bytes: Uint8Array<ArrayBuffer>) => pipe(bytes, new CompressionStream('gzip'));
export const gunzip = (bytes: Uint8Array<ArrayBuffer>) => pipe(bytes, new DecompressionStream('gzip'));

// 内容摘要：判断一款游戏的存档或元数据自上次同步后改过没有，只在本机比较。
// 用同步的 64 位散列（cyrb53 的双 32 位输出），不依赖只在 https 下可用的 crypto.subtle。
export function digest(s: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}
