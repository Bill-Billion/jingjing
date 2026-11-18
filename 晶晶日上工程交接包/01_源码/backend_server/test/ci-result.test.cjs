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

test('an actual child timeout preserves its diagnostic and cannot pass even after printing complete TAP totals', () => {
  const child=require('node:child_process').spawnSync(process.execPath,['-e',`process.stdout.write(${JSON.stringify(summary(1,0,0))});setInterval(()=>{},1000);`],{encoding:'utf8',timeout:1000,windowsHide:true});
  assert.equal(child.error?.code,'ETIMEDOUT');
  const result=assessResult({exitCode:child.status,log:child.stdout||'',processError:child.error,signal:child.signal});
  assert.equal(result.ok,false);assert.equal(result.process_error_code,'ETIMEDOUT');assert.equal(result.signal,child.signal);
  assert.equal(assessResult({exitCode:0,log:summary(1,0,0),signal:'SIGTERM'}).ok,false);
  assert.equal(assessResult({exitCode:0,log:summary(1,0,0),processError:{code:'ENOBUFS'}}).ok,false);
});
