// 改写后的游戏读写存档的唯一入口（API-SDK-002）。语义照旧运行层的假 localStorage：
// 键和值都转成字符串；删不存在的键不发消息；读是同步的，读的是平台在 welcome 里给的那份加上本次的改动。
// 每次改动立刻发给平台，平台合并 700 毫秒写进本机，和旧运行层是同一份存档（键 local|<游戏>）。

import type { GameSave } from '../../shared/save';

export type StorageOp = { op: 'set'; key: string; value: string } | { op: 'del'; key: string } | { op: 'clear' };

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

export class GameStorage {
  private data: GameSave | null = null;

  constructor(private post: (op: StorageOp) => void) {}

  /** 平台的 welcome 到了才能读写；之前读写会抛错，免得把空存档当成新游戏 */
  get loaded() {
    return this.data !== null;
  }

  load(save: GameSave) {
    const data: GameSave = {};
    for (const k of Object.keys(save)) if (typeof save[k] === 'string') data[k] = save[k];
    this.data = data;
  }

  getItem(key: string): string | null {
    const d = this.need();
    const k = String(key);
    return own(d, k) ? d[k] : null;
  }

  setItem(key: string, value: string) {
    const d = this.need();
    const k = String(key);
    const v = String(value);
    d[k] = v;
    this.post({ op: 'set', key: k, value: v });
  }

  removeItem(key: string) {
    const d = this.need();
    const k = String(key);
    if (!own(d, k)) return;
    delete d[k];
    this.post({ op: 'del', key: k });
  }

  clear() {
    this.need();
    this.data = {};
    this.post({ op: 'clear' });
  }

  key(i: number): string | null {
    const ks = Object.keys(this.need());
    return i < ks.length ? ks[i] : null;
  }

  get length() {
    return Object.keys(this.need()).length;
  }

  keys(): string[] {
    return Object.keys(this.need());
  }

  /** 当前整份存档的副本 */
  snapshot(): GameSave {
    return { ...this.need() };
  }

  private need(): GameSave {
    if (!this.data) throw new Error('存档还没读到：等平台的 welcome 之后再读写（ShootaClient.connected）');
    return this.data;
  }
}
