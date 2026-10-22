// 旧单文件游戏的运行层（API-SDK-004，REQ-022）：注入 BOOT 后写进不带 allow-same-origin 的沙箱 iframe 的 srcdoc。
// iframe 属性、注入内容与平台收消息的规则逐条沿用旧版（dd731d6 openPlayer 与 message 监听）。

import { isLegacyMessage, LEGACY_ALLOW, LEGACY_SANDBOX, type LegacyInit, type LegacyMessage } from '../../shared/protocol';
import { inject } from './boot';
import type { Runner, RunnerHandlers } from './runner';

// 平台侧按消息类型分发，字段处理与旧版一致（键名按属性键转成字符串，值 String()）
export function routeLegacyMessage(m: LegacyMessage, h: RunnerHandlers) {
  switch (m.type) {
    case 'ls-set': return h.storage({ op: 'set', key: String(m.k), value: String(m.v) });
    case 'ls-del': return h.storage({ op: 'del', key: String(m.k) });
    case 'ls-clear': return h.storage({ op: 'clear' });
    case 'status': return h.status(String(m.text));
    case 'defs': return Array.isArray(m.list) ? h.defs(m.list) : undefined;
    case 'unlock': return h.unlock(String(m.key));
    case 'exit': return h.exit();
    case 'boot-ready': return h.ready();
    case 'boot-error': return h.bootError(String(m.message ?? ''));
  }
}

export interface LegacyMount {
  title: string;
  html: string;
  init: LegacyInit;
  handlers: RunnerHandlers;
}

export function mountLegacy(stage: HTMLElement, { title, html, init, handlers }: LegacyMount): Runner {
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', LEGACY_SANDBOX);
  frame.setAttribute('title', title);
  frame.setAttribute('allow', LEGACY_ALLOW);
  frame.className = 'pl-frame pl-frame-legacy';
  // 只认当前 iframe 发来的、带 __cj 的消息；沙箱页的 origin 是 'null'，只能按来源窗口核对
  const onMessage = (e: MessageEvent) => {
    if (e.source !== frame.contentWindow || !isLegacyMessage(e.data)) return;
    routeLegacyMessage(e.data, handlers);
  };
  window.addEventListener('message', onMessage);
  frame.srcdoc = inject(html, init);
  stage.appendChild(frame);
  return {
    frame,
    sendEnv() {}, // 旧游戏自己响应窗口变化，不发消息
    suspend: () => Promise.resolve(),
    destroy() {
      window.removeEventListener('message', onMessage);
      frame.srcdoc = '';
      frame.remove();
    },
  };
}
