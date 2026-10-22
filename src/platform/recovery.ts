// 云存档编号与恢复码（docs/DESIGN.md §9、FLOW-RECOVER S1）。
// 编号：128 位随机，32 位小写十六进制，是凭证，只放请求头，不进统计。
// 恢复码：80 位随机，16 位 Crockford base32（不含 I、L、O、U），显示为 XXXX-XXXX-XXXX-XXXX。

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const hex = (b: Uint8Array) => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');

export const newSaveId = () => hex(crypto.getRandomValues(new Uint8Array(16)));

export function newCode(): string {
  const b = crypto.getRandomValues(new Uint8Array(10));
  let out = '', acc = 0, bits = 0;
  for (const x of b) { acc = (acc << 8) | x; bits += 8; while (bits >= 5) { bits -= 5; out += ALPHABET[(acc >> bits) & 31]; } acc &= (1 << bits) - 1; }
  return out;
}

// 规整玩家输入：去掉空格与连字符，转大写，I 与 L 当 1，O 当 0；之后必须正好 16 位且都是恢复码用的字符，否则返回 null，不发请求
export function normalizeCode(input: string): string | null {
  const c = input.replace(/[\s\-‐-―－]+/g, '').toUpperCase().replace(/[IL]/g, '1').replace(/O/g, '0');
  return /^[0-9A-HJKMNP-TV-Z]{16}$/.test(c) ? c : null;
}

export const formatCode = (code: string) => code.match(/.{1,4}/g)?.join('-') ?? code;

// 恢复链接：打开后只弹确认，不自动取回（§13 路由与兼容）
export const recoverLink = (code: string) => `${location.origin}/#recover=${formatCode(code)}`;
