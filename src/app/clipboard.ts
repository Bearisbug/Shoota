// 复制文字，沿用旧版：先 navigator.clipboard，失败再选中文本框 execCommand('copy')。
// 没给文本框时临时放一个不可见的，复制完移除
export async function copyText(text: string, field?: HTMLTextAreaElement | null): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* 往下退回 execCommand */ }
  const el = field ?? Object.assign(document.createElement('textarea'), { value: text, readOnly: true, className: 'sr-only' });
  if (!field) document.body.append(el);
  el.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    if (!field) el.remove();
  }
}
