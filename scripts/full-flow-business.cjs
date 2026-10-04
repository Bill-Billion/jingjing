'use strict';
// Convenient local-only fixtures for commercial orders and casting/release.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const scenarios = {
  gigs: { script: 'pr17', api: 3302, control: 3303, web: 5205, label: '商单、报价与直接MCN合作', phone: /^139000095\d{2}$/ },
  projects: { script: 'pr18', api: 3322, control: 3323, web: 5207, label: '选角、本人确认与发行材料', phone: /^139000096\d{2}$/ },
};
async function main() {
  const [scenario, command, arg] = process.argv.slice(2), config = scenarios[scenario];
  assert(Object.hasOwn(scenarios, scenario), 'Choose gigs or projects');
  assert(['start', 'status', 'code', 'stop'].includes(command), 'Use start --test-only | status | code ROLE | stop');
  const stateFile = path.join(root, '.local', config.script + '-ui-runtime.json');
  if (command === 'start') {
    assert.equal(arg, '--test-only'); assert(process.env.JX_MYSQL_TEST_ENV_FILE, 'Set isolated MySQL configuration');
    assert(!fs.existsSync(stateFile), 'Existing fixture must be stopped; never overwrite its runtime');
    const child = spawn(process.execPath, [path.join(__dirname, config.script + '-ui-test-server.cjs'), '--test-only'], { cwd: root, env: process.env, stdio: 'inherit', windowsHide: true });
    child.once('error', () => { console.error('TEST_FIXTURE_START_FAILED'); process.exitCode = 1; });
    child.once('exit', code => { process.exitCode = code ?? 1; }); return;
  }
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert(state.testOnly && state.syntheticOnly);
  assert.equal(state.apiUrl, 'http://127.0.0.1:' + config.api);
  assert.equal(state.controlUrl, 'http://127.0.0.1:' + config.control);
  assert(Number.isSafeInteger(state.pid)); assert(new RegExp('^jx_test_' + state.pid + '_[0-9a-f]{12}$').test(state.schema));
  const request = async (route, method = 'GET') => {
    const r = await fetch(state.controlUrl + route, { method, signal: AbortSignal.timeout(10000), headers: { Authorization: 'Bearer ' + state.controlToken } });
    assert.equal(r.status, 200); return r.json();
  };
  const current = await request('/state'); assert.equal(current.pid, state.pid); assert.equal(current.schema, state.schema);
  if (command === 'stop') { await request('/shutdown', 'POST'); console.log('已请求关闭本次测试服务；等待它清理自己的数据库、模拟文件和运行记录。'); return; }
  if (command === 'code') {
    const person = state.accounts[arg]; assert(person && config.phone.test(person.phone), 'Unknown synthetic role');
    const code = (await request('/code?phone=' + person.phone)).code; assert(code, 'Click send-code in the test page first');
    console.log('仅本机模拟验证码：' + code); return;
  }
  console.log(JSON.stringify({ testOnly: true, work: config.label, api: state.apiUrl, web: 'http://127.0.0.1:' + config.web,
    accounts: current.accounts, records: current.records, scenarios: current.scenarios, limitations: current.limitations }, null, 2));
}
main().catch(e => { console.error(e.code || e.message); process.exitCode = 1; });
