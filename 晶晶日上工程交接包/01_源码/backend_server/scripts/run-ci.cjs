'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const backend = path.resolve(__dirname, '..');
const root = path.resolve(backend, '../../..');
const output = path.join(root, '.local/ci-evidence');
const { assessResult } = require('./ci-result.cjs');

function main() {
  fs.mkdirSync(output, { recursive: true });
  const report = { node: process.version, platform: process.platform, commit: process.env.GITHUB_SHA || null, commands: [], result: 'FAIL' };
  const save = () => fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
  save();
  if (!process.env.JX_MYSQL_TEST_ENV_FILE || !fs.existsSync(process.env.JX_MYSQL_TEST_ENV_FILE)) throw new Error('必须明确提供隔离测试数据库配置，不能跳过数据库检查后报通过。');
  const env = JSON.parse(fs.readFileSync(process.env.JX_MYSQL_TEST_ENV_FILE, 'utf8'));
  if (env.NODE_ENV !== 'test' || env.DB_CLIENT !== 'mysql' || env.MYSQL_HOST !== '127.0.0.1' || env.MYSQL_PORT !== '33316' || env.MYSQL_USER !== 'jx_local' || env.MYSQL_DATABASE !== 'jx_dev') throw new Error('只允许使用指定的本机隔离测试数据库。');
  const suites = [
    { name: 'mysql', args: ['scripts/test-mysql.js'], allowedSkips: 0 },
    { name: 'worker', args: ['scripts/test-mysql.js', 'worker'], allowedSkips: 0 },
    { name: 'providers', args: ['scripts/test-mysql.js', 'providers'], allowedSkips: 0 },
    { name: 'regression', args: ['scripts/run-tests.cjs'], allowedSkips: process.env.JX_LEGACY_SQLITE_SNAPSHOT ? 0 : 1 },
  ];
  for (const suite of suites) {
    const child = spawnSync(process.execPath, suite.args, { cwd: backend, env: process.env, encoding: 'utf8', timeout: 240000, maxBuffer: 16 * 1024 * 1024, windowsHide: true });
    const log = ((child.stdout || '') + (child.stderr || '')).split(root).join('<WORKTREE>');
    fs.writeFileSync(path.join(output, suite.name + '.log'), log);
    const result = assessResult({ exitCode: child.status, log, allowedSkips: suite.allowedSkips, allowLegacySkip: suite.name === 'regression' });
    report.commands.push({ name: suite.name, ...result }); save();
    console.log(`${suite.name}: ${result.ok ? 'PASS' : 'FAIL'}; ${JSON.stringify(result.counts)}`);
    if (!result.ok) { console.error(log.slice(-12000)); process.exitCode = 1; return; }
  }
  report.result = 'PASS'; save();
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    '## 服务器检查结果\n\n' + report.commands.map((c) => `- ${c.name}：${c.counts.pass}通过，${c.counts.skipped}跳过。`).join('\n') +
    '\n\n跳过仅允许缺少脱敏旧库的比较测试；不能据此认定旧数据迁移通过。以上各组有重复测试，不相加成业务功能数量。未调用真实支付或制作服务。\n');
}
try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
