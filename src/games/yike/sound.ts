// 声音：照搬旧版的 WebAudio 合成音，音高、时长、音量逐个不变。关掉声音时不建 AudioContext。
import type { Sfx } from './engine';

type W = typeof window & { webkitAudioContext?: typeof AudioContext };

export function createSfx(enabled: () => boolean): Sfx {
  let AC: AudioContext | null = null;
  function ac() { if (!enabled()) return null; if (!AC) { try { const w = window as W; AC = new (w.AudioContext || w.webkitAudioContext!)(); } catch { return null; } } if (AC.state === 'suspended') void AC.resume(); return AC; }
  function tone(f: number, d: number, o: { type?: OscillatorType; v?: number; t?: number; to?: number | null } = {}) { const a = ac(); if (!a) return; const { type = 'sine', v = .18, t = 0, to = null } = o; const os = a.createOscillator(), g = a.createGain(), st = a.currentTime + t; os.type = type; os.frequency.setValueAtTime(f, st); if (to) os.frequency.exponentialRampToValueAtTime(to, st + d); g.gain.setValueAtTime(.0001, st); g.gain.exponentialRampToValueAtTime(v, st + .008); g.gain.exponentialRampToValueAtTime(.0001, st + d); os.connect(g); g.connect(a.destination); os.start(st); os.stop(st + d + .03); }
  return {
    tap() { tone(430, .08, { type: 'triangle', v: .24, to: 290 }); },
    sel() { tone(760, .05, { type: 'square', v: .04 }); },
    no() { tone(150, .12, { type: 'square', v: .05 }); },
    near() { tone(988, .09, { v: .07, t: .05 }); },
    ding() { tone(1046, .7, { v: .16 }); tone(1568, .55, { v: .08, t: .03 }); tone(2093, .4, { v: .05, t: .06 }); },
    thud() { tone(150, .4, { type: 'sawtooth', v: .11, to: 45 }); tone(85, .45, { v: .22, to: 40 }); },
    lose() { [392, 330, 262, 196].forEach((f, i) => tone(f, .3, { type: 'triangle', v: .14, t: i * .15 })); },
    win() { [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => tone(f, .32, { v: .13, t: i * .08 })); },
    unlock() { ac(); }, // 「开始抓药」那一下点击里建好声音，之后的音效不用再等手势
  };
}
