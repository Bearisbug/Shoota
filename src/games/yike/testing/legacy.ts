// 测试用：在 Node 里跑旧版 public/games/yike.html 的脚本，拿它当新旧对照的裁判。
// 旧脚本只用到很少的 DOM：按选择器取元素、建元素、改类名与样式、写 innerHTML。这里给一个够它跑的假 DOM：
// querySelector 按选择器返回同一个假元素（第一次取时建出来），innerHTML 只记字符串；
// 脚本末尾补一段 return，把 G、save 与各个处理函数交出来。
import legacyHtml from '../../../../public/games/yike.html?raw';

export class FakeEl {
  readonly tag: string;
  parent: FakeEl | null = null;
  children: FakeEl[] = [];
  style: Record<string, string> & { setProperty(k: string, v: string): void };
  attrs: Record<string, string> = {};
  hidden = false;
  disabled = false;
  onclick: (() => void) | null = null;
  offsetWidth = 0;
  clientWidth = 393;
  clientHeight = 852;
  texts: string[] = []; // 每次写 textContent 都记下，查提示条出过哪些字
  appended: FakeEl[] = []; // 放进来过的子元素，播完删掉的特效也查得到
  private cls = new Set<string>();
  private text = '';
  private html = '';
  private sub = new Map<string, FakeEl>();

  constructor(tag: string) {
    this.tag = tag;
    const style = {} as FakeEl['style'];
    Object.defineProperty(style, 'setProperty', { value: (k: string, v: string) => { style[k] = v; } });
    this.style = style;
  }
  get className() { return [...this.cls].join(' '); }
  set className(v: string) { this.cls = new Set(v.split(/\s+/).filter(Boolean)); }
  classList = {
    add: (c: string) => { this.cls.add(c); },
    remove: (c: string) => { this.cls.delete(c); },
    contains: (c: string) => this.cls.has(c),
    toggle: (c: string, on?: boolean) => { const v = on ?? !this.cls.has(c); if (v) this.cls.add(c); else this.cls.delete(c); return v; },
  };
  get textContent() { return this.text; }
  set textContent(v: string) { this.text = String(v); this.html = this.text; this.texts.push(this.text); }
  get innerHTML() { return this.html; }
  set innerHTML(v: string) { this.html = String(v); this.text = this.html.replace(/<[^>]*>/g, ''); this.children = []; this.sub.clear(); }
  appendChild(c: FakeEl) { c.parent = this; this.children.push(c); this.appended.push(c); return c; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); this.parent = null; }
  setAttribute(k: string, v: string) { this.attrs[k] = String(v); }
  getAttribute(k: string) { return this.attrs[k] ?? null; }
  querySelector(sel: string) { let e = this.sub.get(sel); if (!e) { e = new FakeEl('div'); this.sub.set(sel, e); } return e; }
  querySelectorAll(): FakeEl[] { return []; }
}

export interface LegacyGame {
  G: any; // 旧脚本的内部状态，形状见旧版源码
  save: any;
  lastRender: number; // 上一次重画的时刻
  $: (sel: string) => FakeEl;
  onTile(t: unknown): void;
  selectScale(i: number): void;
  doUndo(): void;
  doPeek(): void;
  doSwap(): void;
  restart(): void;
  toggleSound(): void;
  click(id: string): void; // 点弹窗里的按钮：mGo、mRevive、mRetry、mNext
  modalOpen(): boolean;
}

export function legacyScript(): string {
  const m = /<script>([\s\S]*?)<\/script>/.exec(legacyHtml);
  if (!m) throw new Error('public/games/yike.html 里没找到脚本');
  return m[1];
}

export function legacyGen(): { genLevel: (lv: number) => unknown; coverOf: (tiles: unknown[]) => void } {
  const src = legacyScript();
  const gen = src.slice(src.indexOf('/*GEN-START*/'), src.indexOf('/*GEN-END*/'));
  return new Function(`${gen}\nreturn { genLevel, coverOf };`)();
}

// storage 是旧版眼里的 localStorage；setTimeout、Date 用调用方的（测试里是 vitest 的假计时器）
export function runLegacy(storage: { getItem(k: string): string | null; setItem(k: string, v: string): void }): LegacyGame {
  const byId = new Map<string, FakeEl>();
  const document = {
    querySelector: (sel: string) => { let e = byId.get(sel); if (!e) { e = new FakeEl('div'); byId.set(sel, e); } return e; },
    querySelectorAll: () => [],
    createElement: (tag: string) => new FakeEl(tag),
  };
  const getComputedStyle = () => ({ paddingLeft: '0', paddingRight: '0', paddingTop: '0', paddingBottom: '0' });
  // render 是函数声明，可以改绑：包一层记下每次重画的时刻
  const tail = `\nconst __render = render; render = function () { __lastRender = Date.now(); return __render(); }; let __lastRender = 0;
return { get G(){return G}, get save(){return save}, get lastRender(){return __lastRender}, $, onTile, selectScale, doUndo, doPeek, doSwap,
    restart: () => $('#bRestart').onclick(), toggleSound: () => $('#bSound').onclick(),
    click: id => $('#' + id).onclick(), modalOpen: () => !$('#modal').hidden };`;
  const run = new Function('document', 'window', 'localStorage', 'getComputedStyle', 'addEventListener', legacyScript() + tail);
  const g = run(document, {}, storage, getComputedStyle, () => {}) as LegacyGame;
  return g;
}

// 去掉标签、合并空白，比较两边显示出来的字
export const plain = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
