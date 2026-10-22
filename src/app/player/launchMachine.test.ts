// ENT-LaunchSession 迁移表（docs/DESIGN.md §11）：11 条迁移各一例，表外的迁移一律拒绝
import { describe, expect, it } from 'vitest';
import { LAUNCH_FAIL_REASONS, type LaunchFailReason } from '../../shared/telemetry';
import { INITIAL, isRetryable, onLegFailure, transition, TRANSITIONS, type LaunchStatus, type MachineInput, type MachineState } from './launchMachine';

const at = (status: LaunchStatus, n: 1 | 2 = 1, reason?: LaunchFailReason): MachineState => ({ status, n, reason });

describe('迁移表', () => {
  it('正好 11 条，与设计文档一致', () => {
    expect(TRANSITIONS.map(t => `${t.from}→${t.to} ${t.name}`)).toEqual([
      'idle→loading 点开始游戏',
      'loading→loading 自动重试',
      'loading→mounting 下载与读档都完成',
      'loading→failed 启动失败',
      'loading→cancelled 玩家退出',
      'mounting→ready 收到就绪信号',
      'mounting→failed 就绪超时',
      'mounting→cancelled 玩家退出',
      'failed→loading 点重试',
      'failed→closed 点退出',
      'ready→closed 退出游戏',
    ]);
  });

  it('[*] → loading：点开始游戏，从第 1 次尝试开始', () => {
    expect(transition(INITIAL, { type: 'start' })).toEqual({ status: 'loading', n: 1, reason: undefined });
  });

  it('loading → loading：可重试的原因且 n = 1 时自动重试，n 改为 2', () => {
    expect(transition(at('loading'), { type: 'auto-retry', reason: 'net-stall' })).toEqual({ status: 'loading', n: 2 });
  });

  it('loading → mounting：下载与读档都完成', () => {
    expect(transition(at('loading', 2), { type: 'loaded' })).toEqual({ status: 'mounting', n: 2 });
  });

  it('loading → failed：不可重试的原因在第 1 次就失败，可重试的原因在第 2 次失败', () => {
    expect(transition(at('loading'), { type: 'fail', reason: 'offline' })).toEqual({ status: 'failed', n: 1, reason: 'offline' });
    expect(transition(at('loading', 2), { type: 'fail', reason: 'net-timeout' })).toEqual({ status: 'failed', n: 2, reason: 'net-timeout' });
  });

  it('loading → cancelled：载入中玩家退出', () => {
    expect(transition(at('loading'), { type: 'cancel' })?.status).toBe('cancelled');
  });

  it('mounting → ready：收到当前 iframe 的就绪信号', () => {
    expect(transition(at('mounting'), { type: 'ready', fromCurrentFrame: true })?.status).toBe('ready');
  });

  it('mounting → failed：就绪超时，报过错记 boot-error，否则 boot-timeout', () => {
    expect(transition(at('mounting'), { type: 'ready-timeout', elapsedMs: 15_000, bootError: false })).toEqual({ status: 'failed', n: 1, reason: 'boot-timeout' });
    expect(transition(at('mounting'), { type: 'ready-timeout', elapsedMs: 15_000, bootError: true })?.reason).toBe('boot-error');
  });

  it('mounting → cancelled：装进页面后、就绪前玩家退出', () => {
    expect(transition(at('mounting'), { type: 'cancel' })?.status).toBe('cancelled');
  });

  it('failed → loading：点重试，n 回到 1，原因清空', () => {
    expect(transition(at('failed', 2, 'net-stall'), { type: 'retry' })).toEqual({ status: 'loading', n: 1, reason: undefined });
  });

  it('failed → closed：失败页点退出', () => {
    expect(transition(at('failed', 1, 'offline'), { type: 'exit' })?.status).toBe('closed');
  });

  it('ready → closed：退出游戏', () => {
    expect(transition(at('ready'), { type: 'exit' })?.status).toBe('closed');
  });
});

describe('表外的迁移被拒绝', () => {
  const inputs: MachineInput[] = [
    { type: 'start' }, { type: 'auto-retry', reason: 'net-error' }, { type: 'loaded' }, { type: 'fail', reason: 'offline' },
    { type: 'cancel' }, { type: 'ready', fromCurrentFrame: true }, { type: 'ready-timeout', elapsedMs: 15_000, bootError: false },
    { type: 'retry' }, { type: 'exit' },
  ];
  const statuses: LaunchStatus[] = ['idle', 'loading', 'mounting', 'ready', 'failed', 'cancelled', 'closed'];

  it('源状态不对的事件一律返回 null', () => {
    const allowed = new Set(TRANSITIONS.map(t => `${t.from}:${t.on}`));
    for (const s of statuses) {
      for (const i of inputs) {
        if (allowed.has(`${s}:${i.type}`)) continue;
        expect(transition(at(s), i), `${s} 收到 ${i.type}`).toBeNull();
      }
    }
  });

  it('取消与关闭之后什么都不认', () => {
    for (const i of inputs) {
      expect(transition(at('cancelled'), i)).toBeNull();
      expect(transition(at('closed'), i)).toBeNull();
    }
  });

  it('守卫不成立时拒绝', () => {
    expect(transition(at('loading', 2), { type: 'auto-retry', reason: 'net-error' })).toBeNull(); // 已经重试过
    expect(transition(at('loading'), { type: 'auto-retry', reason: 'net-slow' })).toBeNull(); // 不可重试的原因
    expect(transition(at('loading'), { type: 'fail', reason: 'net-stall' })).toBeNull(); // 可重试且还没重试
    expect(transition(at('mounting'), { type: 'ready', fromCurrentFrame: false })).toBeNull(); // 别的 iframe 发来的
    expect(transition(at('mounting'), { type: 'ready-timeout', elapsedMs: 14_999, bootError: false })).toBeNull();
  });
});

describe('重试规则（§11、ADR-009）', () => {
  it('只有网络、文件 5xx 与存档库失败自动重试一次', () => {
    const auto = LAUNCH_FAIL_REASONS.filter(isRetryable);
    expect(auto).toEqual(['net-error', 'net-timeout', 'net-stall', 'http-error', 'save-timeout', 'save-error']);
    expect(LAUNCH_FAIL_REASONS.filter(r => !isRetryable(r))).toEqual(['offline', 'net-slow', 'http-404', 'boot-timeout', 'boot-error']);
  });

  it('某一路失败：第 1 次可重试就重试，否则进失败页', () => {
    expect(onLegFailure(at('loading'), 'save-error')).toEqual({ type: 'auto-retry', reason: 'save-error' });
    expect(onLegFailure(at('loading', 2), 'save-error')).toEqual({ type: 'fail', reason: 'save-error' });
    expect(onLegFailure(at('loading'), 'offline')).toEqual({ type: 'fail', reason: 'offline' });
  });
});
