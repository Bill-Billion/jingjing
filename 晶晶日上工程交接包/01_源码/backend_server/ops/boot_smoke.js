// ops/boot_smoke.js - 启动冒烟：子进程拉起 app.js，打 health / 未签名 webhook 应 401 / 受保护接口应 401
// 用法: node ops/boot_smoke.js   （可用 PORT/SQLITE_PATH 覆盖，默认用临时库与随机端口）
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || String(33991 + Math.floor(Math.random() * 500));
const DB = process.env.SQLITE_PATH || path.join(os.tmpdir(), `smoke_${Date.now()}.db`);
const child = spawn(process.execPath, ['app.js'], {
  cwd: ROOT,
  env: { ...process.env, PORT, SQLITE_PATH: DB, NODE_ENV: process.env.NODE_ENV || 'development', JWT_SECRET: process.env.JWT_SECRET || 'test_secret_at_least_32_chars_long_xx' },
});
let logs = '';
child.stdout.on('data', (d) => { logs += d; });
child.stderr.on('data', (d) => { logs += d; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let ok = false;
  try {
    await sleep(1800);
    const base = `http://127.0.0.1:${PORT}`;
    const h = await (await fetch(base + '/api/health')).json();
    console.log('HEALTH', JSON.stringify(h));
    const wh = await fetch(base + '/api/ai/visual/webhook', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } });
    console.log('WEBHOOK no-sig =', wh.status, '(expect 401)');
    if (wh.status !== 401) throw new Error('webhook should reject unsigned');
    const pay = await fetch(base + '/api/payment/status/NONE');
    console.log('PROTECTED no-token =', pay.status, '(expect 401)');
    if (pay.status !== 401) throw new Error('protected route should 401');
    ok = true;
  } catch (e) { console.error('SMOKE_FAIL', e); }
  finally {
    child.kill('SIGKILL');
    if (!process.env.SQLITE_PATH) for (const e of ['', '-wal', '-shm']) try { fs.unlinkSync(DB + e); } catch (_) {}
    if (!ok) { console.log(logs.slice(-2000)); process.exit(1); }
    console.log('SMOKE_OK');
    process.exit(0);
  }
})();
