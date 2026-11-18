import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { appActionOptions } from './v5-r05-r12-app-actions-result.mjs';

const helper = new URL('./v5-r05-r12-app-actions-result.mjs', import.meta.url).href;
function finish(input) {
  const child = spawnSync(process.execPath, ['--input-type=module', '-e',
    `import { completeAppActionReport } from ${JSON.stringify(helper)}; console.log(JSON.stringify(completeAppActionReport(JSON.parse(process.argv[1]))));`,
    JSON.stringify(input)], { encoding: 'utf8' });
  assert.equal(child.error, undefined);
  return { status: child.status, report: JSON.parse(child.stdout) };
}
const successful = { checks: [{ name: '实际订单回读', result: 'PASS' }], errors: [] };

test('业务检查通过且无页面错误时正常退出', () => {
  const result = finish(successful);
  assert.equal(result.status, 0);
  assert.equal(result.report.result, 'PASS');
});

test('只有页面异常或Flutter溢出也必须非零退出', () => {
  for (const error of ['Uncaught TypeError', 'A RenderFlex overflowed by 20 pixels']) {
    const result = finish({ ...successful, errors: [error] });
    assert.equal(result.status, 1);
    assert.equal(result.report.result, 'FAIL');
    assert.deepEqual(result.report.errors, [error]);
  }
});

test('未执行检查、断言失败和非通过检查不能生成成功结果', () => {
  for (const input of [
    { checks: [], errors: [] },
    { ...successful, failure: '订单金额不符' },
    { checks: [{ name: '未执行', result: 'SKIP' }], errors: [] },
  ]) {
    const result = finish(input);
    assert.equal(result.status, 1);
    assert.equal(result.report.result, 'FAIL');
  }
});

test('默认与明确选择的合法动作保持原范围', () => {
  assert.deepEqual(appActionOptions({}).actions, ['stock', 'coupon', 'lottery', 'participation', 'conversation']);
  assert.deepEqual(appActionOptions({ V5_APP_ACTIONS: ' stock, support ' }).actions, ['stock', 'support']);
  assert.deepEqual(appActionOptions({ V5_APP_PHASE: 'cross' }), { phase: 'cross', actions: [] });
});

test('空白、拼错、重复或不适用的动作筛选必须拒绝', () => {
  for (const value of ['', ' ', 'stock,', 'stcok', 'stock,unknown', 'stock,stock']) {
    assert.throws(() => appActionOptions({ V5_APP_ACTIONS: value }), /V5_APP_ACTIONS/);
  }
  assert.throws(() => appActionOptions({ V5_APP_PHASE: 'other' }), /V5_APP_PHASE/);
  assert.throws(() => appActionOptions({ V5_APP_PHASE: 'cross', V5_APP_ACTIONS: 'stock' }), /V5_APP_ACTIONS/);
});

test('实际命令在读取夹具或启动浏览器前拒绝拼错动作', () => {
  const child = spawnSync(process.execPath, [fileURLToPath(new URL('./v5-r05-r12-app-actions.mjs', import.meta.url))], {
    encoding: 'utf8',
    env: { ...process.env, V5_APP_PHASE: 'business', V5_APP_ACTIONS: 'stcok', V5_ACCESS_FILE: 'must-not-be-read.json' },
  });
  assert.equal(child.status, 1);
  assert.match(child.stderr, /V5_APP_ACTIONS/);
  assert.doesNotMatch(child.stderr, /ENOENT/);
});
