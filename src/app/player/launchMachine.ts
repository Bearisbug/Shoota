// 一次启动 ENT-LaunchSession 的状态机，迁移表与守卫逐条对应 docs/DESIGN.md §11。
// 这里只算状态，不碰网络、计时器和页面；副作用在 launch.ts 里按迁移结果去做。表外的迁移一律拒绝（返回 null）。

import { LAUNCH } from '../../shared/limits';
import type { LaunchFailReason } from '../../shared/telemetry';

export type LaunchStatus = 'idle' | 'loading' | 'mounting' | 'ready' | 'failed' | 'cancelled' | 'closed'; // idle 即图里的 [*]

export interface MachineState {
  status: LaunchStatus;
  n: 1 | 2; // 第几次尝试，自动重试那次是 2
  reason?: LaunchFailReason; // failed 时的原因
}

export type MachineInput =
  | { type: 'start' } // 点开始游戏
  | { type: 'auto-retry'; reason: LaunchFailReason } // 某一路失败，平台计时器决定重做那一路
  | { type: 'loaded' } // 下载与读档都完成
  | { type: 'fail'; reason: LaunchFailReason } // 某一路失败且不再重试
  | { type: 'cancel' } // 玩家退出（载入中）
  | { type: 'ready'; fromCurrentFrame: boolean } // 收到就绪信号
  | { type: 'ready-timeout'; elapsedMs: number; bootError: boolean } // 就绪计时到期
  | { type: 'retry' } // 失败页点重试
  | { type: 'exit' }; // 失败页点退出，或游玩中退出游戏

// 可重试的原因只自动重试一次；http-404 不在这里，它先换固定地址下一次，不算重试
const RETRYABLE: ReadonlySet<LaunchFailReason> = new Set(['net-error', 'net-timeout', 'net-stall', 'http-error', 'save-timeout', 'save-error']);

export const isRetryable = (reason: LaunchFailReason) => RETRYABLE.has(reason);

// 某一路失败后走自动重试还是失败页
export const onLegFailure = (s: MachineState, reason: LaunchFailReason): MachineInput =>
  isRetryable(reason) && s.n === 1 ? { type: 'auto-retry', reason } : { type: 'fail', reason };

interface Transition {
  from: LaunchStatus;
  on: MachineInput['type'];
  to: LaunchStatus;
  name: string; // 设计文档迁移表里的事件名
  guard?: (s: MachineState, input: never) => boolean;
  apply?: (s: MachineState, input: never) => Partial<MachineState>;
}

export const TRANSITIONS: readonly Transition[] = [
  { from: 'idle', on: 'start', to: 'loading', name: '点开始游戏', apply: () => ({ n: 1, reason: undefined }) },
  {
    from: 'loading', on: 'auto-retry', to: 'loading', name: '自动重试',
    guard: (s, i: Extract<MachineInput, { type: 'auto-retry' }>) => isRetryable(i.reason) && s.n === 1,
    apply: () => ({ n: 2 }),
  },
  { from: 'loading', on: 'loaded', to: 'mounting', name: '下载与读档都完成' },
  {
    from: 'loading', on: 'fail', to: 'failed', name: '启动失败',
    guard: (s, i: Extract<MachineInput, { type: 'fail' }>) => !isRetryable(i.reason) || s.n === 2,
    apply: (_, i: Extract<MachineInput, { type: 'fail' }>) => ({ reason: i.reason }),
  },
  { from: 'loading', on: 'cancel', to: 'cancelled', name: '玩家退出' },
  {
    from: 'mounting', on: 'ready', to: 'ready', name: '收到就绪信号',
    guard: (_, i: Extract<MachineInput, { type: 'ready' }>) => i.fromCurrentFrame,
  },
  {
    from: 'mounting', on: 'ready-timeout', to: 'failed', name: '就绪超时',
    guard: (_, i: Extract<MachineInput, { type: 'ready-timeout' }>) => i.elapsedMs >= LAUNCH.readyMs,
    apply: (_, i: Extract<MachineInput, { type: 'ready-timeout' }>) => ({ reason: i.bootError ? 'boot-error' : 'boot-timeout' }),
  },
  { from: 'mounting', on: 'cancel', to: 'cancelled', name: '玩家退出' },
  { from: 'failed', on: 'retry', to: 'loading', name: '点重试', apply: () => ({ n: 1, reason: undefined }) },
  { from: 'failed', on: 'exit', to: 'closed', name: '点退出' },
  { from: 'ready', on: 'exit', to: 'closed', name: '退出游戏' },
];

export const INITIAL: MachineState = { status: 'idle', n: 1 };

// 按迁移表走一步；没有匹配的迁移或守卫不成立时返回 null，调用方不做任何副作用
export function transition(s: MachineState, input: MachineInput): MachineState | null {
  for (const t of TRANSITIONS) {
    if (t.from !== s.status || t.on !== input.type) continue;
    if (t.guard && !t.guard(s, input as never)) continue;
    return { ...s, ...t.apply?.(s, input as never), status: t.to };
  }
  return null;
}
