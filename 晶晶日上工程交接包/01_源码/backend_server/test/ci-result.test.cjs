'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { assessResult } = require('../scripts/ci-result.cjs');
const summary = (pass, fail, skipped) => `# tests ${pass + fail + skipped}\n# pass ${pass}\n# fail ${fail}\n# cancelled 0\n# skipped ${skipped}\n# todo 0\n`;
test('CI rejects failure, empty output, missing totals and nonzero process exits', () => {
  for (const input of [{ exitCode: 1, log: summary(2, 0, 0) }, { exitCode: null, log: summary(2, 0, 0) },
    { exitCode: 0, log: '' }, { exitCode: 0, log: summary(0, 0, 0) }, { exitCode: 0, log: summary(1, 1, 0) },
    { exitCode: 0, log: '# pass 2\n' }]) assert.equal(assessResult(input).ok, false);
  assert.equal(assessResult({ exitCode: 0, log: summary(2, 0, 0) }).ok, true);
});
test('CI only permits the named missing legacy snapshot skip, never skipped MySQL suites', () => {
  const legacy = 'ok 1 - old snapshot # SKIP 未提供显式脱敏旧库样本，未执行结构等价比较\n' + summary(2, 0, 1);
  assert.equal(assessResult({ exitCode: 0, log: legacy }).ok, false);
  assert.equal(assessResult({ exitCode: 0, log: legacy, allowedSkips: 1, allowLegacySkip: true }).ok, true);
  assert.equal(assessResult({ exitCode: 0, log: 'ok 1 - MySQL # SKIP\n' + summary(2, 0, 1), allowedSkips: 1, allowLegacySkip: true }).ok, false);
  assert.equal(assessResult({ exitCode: 0, log: legacy.replace('# pass 2', '# pass 1'), allowedSkips: 1, allowLegacySkip: true }).ok, false);
});
