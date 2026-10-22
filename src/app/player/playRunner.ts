// 改写后的游戏的运行层（SDK v2，API-SDK-001～003）：同源 iframe 打开 /play/<游戏>/，不加沙箱。
// 握手顺序 hello → welcome → ready；只认同源、当前 iframe 发来的消息，握手前的其他消息、格式不对的消息直接丢弃。

import { PLAY } from '../../shared/limits';
import {
  isSdkMessage, LEGACY_ALLOW, SDK_NS, SDK_VERSION,
  type GameToPlatform, type Orientation, type PlatformToGame, type PlayEnv, type PlayGame, type PlayUser,
} from '../../shared/protocol';
import type { GameSave } from '../../shared/save';
import type { SdkShell, SdkWelcomeWithShell, ShellPrefs } from '../../sdk/core/protocolExt';
import { playUrl } from './gameFiles';
import type { Runner, RunnerHandlers } from './runner';

const ORIENTATIONS: readonly Orientation[] = ['portrait', 'landscape', 'any'];
const isStr = (v: unknown): v is string => typeof v === 'string';

// 逐项校验游戏发来的消息，不合格返回 null
export function parseGameMessage(m: unknown): GameToPlatform | SdkShell | null {
  if (!isSdkMessage(m)) return null;
  const o = m as unknown as Record<string, unknown>;
  switch (o.type) {
    case 'hello': return isStr(o.game) ? (m as GameToPlatform) : null;
    case 'ready': case 'exit': case 'suspended': return m as GameToPlatform;
    case 'storage':
      if (o.op === 'set') return isStr(o.key) && isStr(o.value) ? (m as GameToPlatform) : null;
      if (o.op === 'del') return isStr(o.key) ? (m as GameToPlatform) : null;
      return o.op === 'clear' ? (m as GameToPlatform) : null;
    case 'unlock': return isStr(o.key) ? (m as GameToPlatform) : null;
    case 'defs': return Array.isArray(o.list) ? (m as GameToPlatform) : null;
    case 'status': return isStr(o.text) ? (m as GameToPlatform) : null;
    case 'orientation': return ORIENTATIONS.includes(o.prefer as Orientation) ? (m as GameToPlatform) : null;
    case 'error': return isStr(o.message) ? (m as GameToPlatform) : null;
    case 'shell':
      return (o.orientation === 'portrait' || o.orientation === 'landscape') && typeof o.expanded === 'boolean' ? (o as unknown as SdkShell) : null;
    default: return null;
  }
}

export interface PlayMount {
  game: PlayGame;
  user: PlayUser;
  save: () => GameSave; // 平台手里最新的一份
  env: () => PlayEnv;
  shell: () => ShellPrefs; // 这款游戏各方向的顶部信息区展开状态
  handlers: RunnerHandlers;
  origin?: string; // 默认当前页面的 origin
}

// 平台与 iframe 之间的会话：不碰 DOM，单测直接驱动
export class PlayChannel {
  private welcomed = false;
  private readied = false;
  private lastEnv = '';
  private waiting: (() => void) | null = null;

  constructor(private m: PlayMount, private post: (msg: PlatformToGame | SdkWelcomeWithShell) => void) {}

  receive(raw: unknown) {
    const msg = parseGameMessage(raw);
    if (!msg) return;
    const h = this.m.handlers;
    if (msg.type === 'hello') {
      if (msg.game !== this.m.game.id) return;
      // 重复 hello（游戏页重载）照样回 welcome
      this.welcomed = true;
      const env = this.m.env();
      this.lastEnv = JSON.stringify(env);
      this.post({ ns: SDK_NS, sdk: SDK_VERSION, type: 'welcome', game: this.m.game, user: this.m.user, storage: { ...this.m.save() }, env, shell: this.m.shell() });
      return;
    }
    if (!this.welcomed) return;
    switch (msg.type) {
      case 'ready':
        if (this.readied) return;
        this.readied = true;
        return h.ready();
      case 'storage':
        if (msg.op === 'set') h.storage({ op: 'set', key: msg.key, value: msg.value });
        else if (msg.op === 'del') h.storage({ op: 'del', key: msg.key });
        else h.storage({ op: 'clear' });
        return;
      case 'unlock': return h.unlock(msg.key);
      case 'defs': return h.defs(msg.list);
      case 'status': return h.status(msg.text);
      case 'orientation': return h.orientation(msg.prefer);
      case 'exit': return h.exit();
      case 'shell': return h.shell(msg.orientation, msg.expanded);
      case 'error': return this.readied ? undefined : h.bootError(msg.message);
      case 'suspended':
        this.waiting?.();
        return;
    }
  }

  // 方向、全屏或游戏区尺寸变了才发
  sendEnv(env: PlayEnv) {
    if (!this.welcomed) return;
    const key = JSON.stringify(env);
    if (key === this.lastEnv) return;
    this.lastEnv = key;
    this.post({ ns: SDK_NS, sdk: SDK_VERSION, type: 'env', env });
  }

  // 请游戏收尾，收到 suspended 或等满 0.5 秒都算完
  suspend(reason: 'exit' | 'hidden'): Promise<void> {
    if (!this.welcomed) return Promise.resolve();
    return new Promise(resolve => {
      const done = () => {
        clearTimeout(timer);
        if (this.waiting === done) this.waiting = null;
        resolve();
      };
      const timer = setTimeout(done, PLAY.suspendWaitMs);
      this.waiting?.();
      this.waiting = done;
      this.post({ ns: SDK_NS, sdk: SDK_VERSION, type: 'suspend', reason });
    });
  }
}

export function mountPlay(stage: HTMLElement, mount: PlayMount): Runner {
  const origin = mount.origin ?? location.origin;
  const frame = document.createElement('iframe');
  frame.setAttribute('title', mount.game.title);
  frame.setAttribute('allow', LEGACY_ALLOW);
  frame.className = 'pl-frame pl-frame-play';
  const channel = new PlayChannel(mount, msg => frame.contentWindow?.postMessage(msg, origin));
  const onMessage = (e: MessageEvent) => {
    if (e.source !== frame.contentWindow || e.origin !== origin) return;
    channel.receive(e.data);
  };
  window.addEventListener('message', onMessage);
  frame.src = playUrl(mount.game.id);
  stage.appendChild(frame);
  return {
    frame,
    sendEnv: env => channel.sendEnv(env),
    suspend: reason => channel.suspend(reason),
    destroy() {
      window.removeEventListener('message', onMessage);
      frame.remove();
    },
  };
}
