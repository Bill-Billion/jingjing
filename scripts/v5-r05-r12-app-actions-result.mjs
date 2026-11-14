import assert from 'node:assert/strict';

const phases = ['business', 'cross', 'conversation-readback', 'coupon-cancel'];
const businessActions = ['stock', 'coupon', 'lottery', 'participation', 'conversation', 'support'];

export function appActionOptions(env) {
  const phase = env.V5_APP_PHASE ?? 'business';
  assert(phases.includes(phase), 'V5_APP_PHASE 无效');
  if (env.V5_APP_ACTIONS === undefined) return { phase, actions: phase === 'business' ? businessActions.slice(0, -1) : [] };
  assert(phase === 'business', 'V5_APP_ACTIONS 仅适用于 business 阶段');
  const actions = env.V5_APP_ACTIONS.split(',').map(value => value.trim());
  assert(actions.every(value => businessActions.includes(value)), 'V5_APP_ACTIONS 包含空白或未知动作');
  assert(new Set(actions).size === actions.length, 'V5_APP_ACTIONS 不能重复');
  return { phase, actions };
}

export function completeAppActionReport(report) {
  const failure = report.failure || (report.checks.length === 0 ? '没有执行任何业务检查。' : undefined);
  const result = failure || report.errors.length || report.checks.some(check => check.result !== 'PASS') ? 'FAIL' : 'PASS';
  // A saved FAIL must also stop shell/CI command chains, including errors collected outside assertions.
  if (result === 'FAIL') process.exitCode = 1;
  return { ...report, result, failure };
}
