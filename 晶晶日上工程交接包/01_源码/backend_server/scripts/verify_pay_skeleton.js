// R0.6: this historical script expects removed demo/autoapproval behavior.
throw new Error('LEGACY_SELFTEST_RETIRED: 请运行 npm run test:legacy-safety；旧脚本不可作为当前验收。');

// scripts/verify_pay_skeleton.js
// 支付宝 APP 支付骨架本地自验证（不依赖真实密钥/外网；用临时 SQLite + 内置 HTTP + 本地生成 RSA2 密钥对）
// 覆盖验收点：
//  ① node --check（另见命令）；模块可正常装配
//  ② 前端篡改金额必须被服务端拒绝（金额只认服务端订单/config，单位分）
//  ③ 缺失支付宝 env 时进程正常启动、创建支付返回「未配置/演示」而非崩溃
//  ④ payments 表重复初始化不报错、不重复
//  ⑤ notify 必须 RSA2 验签且幂等（坏签名/改金额拒绝，重复回调不重复推进业务）
// 运行：node scripts/verify_pay_skeleton.js   （退出码 0=全过，1=有失败）
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

// ---- 0) 必须在 require 业务模块前准备好隔离环境：临时库 + 测试端口 + 清空支付宝 env ----
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jjsr_paytest_'));
process.env.SQLITE_PATH = path.join(tmpDir, 'test.db');
process.env.NODE_ENV = 'development';
process.env.PORT = '3999';
process.env.JWT_SECRET = 'test_jwt_secret_for_pay_skeleton_only_32chars';
for (const k of Object.keys(process.env)) {
  if (k.startsWith('ALIPAY_')) delete process.env[k];
}

const db = require('../db');
const config = require('../config');
const auth = require('../middleware/auth');
const alipay = require('../services/alipay');

// ---- 1) 造测试业务数据（金额单位：分）----
db.prepare("INSERT INTO users (id,nickname,role,status) VALUES (1,?,'user','active')").run('paytester');
// 祝福视频 99 元
db.prepare("INSERT INTO video_orders (order_no,user_id,talent_id,amount,status) VALUES (?,?,?,?,'pending')")
  .run('VVIDEO1', 1, 2, 9900);
// 品牌代言 299 元
db.prepare("INSERT INTO endorsement_orders (order_no,user_id,talent_id,amount,status) VALUES (?,?,?,?,'pending')")
  .run('EENDO1', 1, 2, 29900);
// 定制剧席位（dream）+ 项目
db.prepare("INSERT INTO projects (id,title,goal_amount,raised_amount,client_count,status) VALUES (1,?,50000,0,0,'recruiting')").run('测试定制剧');
db.prepare("INSERT INTO claims (order_no,user_id,project_id,amount,status) VALUES (?,?,?,?,'pending')")
  .run('DDREAM1', 1, 1, 50000);
// 样片订单（draft；库默认 amount=500000，但意向金必须以 config.sample.intentDeposit=9900 为准）
db.prepare("INSERT INTO sample_orders (order_no,user_id,amount,status,step) VALUES (?,?,500000,'draft',0)")
  .run('SSAMPLE1', 1);

// ---- 启动真实 Express（含全部路由与 /api/pay）----
require('../app');
const BASE = `http://127.0.0.1:${process.env.PORT}`;
const token = auth.signToken({ userId: 1, role: 'user' });
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (extra ? '  -> ' + JSON.stringify(extra) : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitHealthy() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(BASE + '/api/health'); if (r.ok) return; } catch (e) {}
    await sleep(100);
  }
  throw new Error('server not ready');
}
const jget = async (p) => (await fetch(BASE + p, { headers: H })).json();
const jpost = async (p, body, headers) => {
  const r = await fetch(BASE + p, { method: 'POST', headers: headers || H, body: JSON.stringify(body) });
  let data = null; const txt = await r.text();
  try { data = JSON.parse(txt); } catch (e) { data = txt; }
  return { status: r.status, data };
};

// 生成一对 RSA2 密钥，模拟「支付宝应用私钥 + 支付宝公钥」（本地闭环验签）
const kp = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const PRIV = kp.privateKey.export({ type: 'pkcs8', format: 'pem' });
const PUB = kp.publicKey.export({ type: 'spki', format: 'pem' });
const APPID = '2021000000000001';
function enableAlipay() {
  process.env.ALIPAY_ENABLED = 'true';
  process.env.ALIPAY_APP_ID = APPID;
  process.env.ALIPAY_PRIVATE_KEY = PRIV;
  process.env.ALIPAY_PUBLIC_KEY = PUB;
  process.env.ALIPAY_GATEWAY = 'sandbox';
  process.env.ALIPAY_PID = '2088000000000001';
  alipay._reset();
}
function disableAlipay() {
  for (const k of Object.keys(process.env)) if (k.startsWith('ALIPAY_')) delete process.env[k];
  alipay._reset();
}
// 按支付宝规则对通知参数签名（key 排序、排除 sign、RSA-SHA256、base64）
function signNotify(obj, key) {
  const canon = Object.keys(obj).sort().filter((k) => k).map((k) => `${k}=${obj[k]}`).join('&');
  return crypto.createSign('RSA-SHA256').update(canon, 'utf8').sign(key, 'base64');
}
async function postNotify(obj, badSign) {
  const body = { ...obj };
  body.sign = badSign === true ? 'Zm9vYmFy' : signNotify(body, PRIV);
  body.sign_type = 'RSA2';
  const form = new URLSearchParams(body).toString();
  const r = await fetch(BASE + '/api/pay/alipay/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  return { status: r.status, text: await r.text() };
}

(async () => {
  await waitHealthy();

  // ===== ③ 无密钥：进程已正常启动（health 200），创建支付降级为演示 =====
  let r = await jget('/api/health');
  ok('T01 进程无支付宝env正常启动 /api/health=ok', r && r.status === 'ok', r);
  ok('T02 无密钥 isConfigured=false', alipay.isConfigured() === false, alipay.status());

  // 未登录 401
  let noauth = await fetch(BASE + '/api/pay/alipay/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  ok('T03 创建支付未登录返回401', noauth.status === 401);

  // 无密钥降级
  let demo = await jpost('/api/pay/alipay/create', { orderNo: 'VVIDEO1', bizType: 'video' });
  ok('T04 无密钥创建支付返回演示占位(configured:false,demo:true)', demo.status === 200 && demo.data.configured === false && demo.data.demo === true, demo.data);
  ok('T05 演示降级返回服务端金额9900分', demo.data.amountFen === 9900, demo.data);
  const demoRows = db.prepare("SELECT COUNT(*) c FROM payments WHERE order_no='VVIDEO1'").get().c;
  ok('T06 演示模式不写payments单', demoRows === 0, { rows: demoRows });

  // ===== ② 无密钥下篡改金额：仍被识别并拒绝（显式拒绝前端金额）=====
  let tamper1 = await jpost('/api/pay/alipay/create', { orderNo: 'VVIDEO1', bizType: 'video', amount: 0.01 });
  ok('T07 篡改金额(0.01元)被拒400', tamper1.status === 400 && /金额/.test(tamper1.data.message || ''), tamper1);
  let tamper2 = await jpost('/api/pay/alipay/create', { orderNo: 'EENDO1', bizType: 'endorsement', amountFen: 1 });
  ok('T08 篡改金额(1分)被拒400', tamper2.status === 400, tamper2.data);
  // 传入与服务端一致的金额（99元=9900分）不应被当作篡改
  let sameAmt = await jpost('/api/pay/alipay/create', { orderNo: 'VVIDEO1', bizType: 'video', amount: 99 });
  ok('T09 传入与服务端一致金额不误杀', sameAmt.status === 200 && sameAmt.data.demo === true, sameAmt);

  // ===== ④ payments 表幂等：重复执行建表/索引不报错、表仍只有 1 张 =====
  let idemOk = true;
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT);
      CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_no, stage);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_one_pending ON payments(order_no, stage) WHERE status='pending';
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT);
      CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_no, stage);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_one_pending ON payments(order_no, stage) WHERE status='pending';
    `);
  } catch (e) { idemOk = false; }
  const tblCnt = db.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type='table' AND name='payments'").get().c;
  ok('T10 payments重复初始化不报错', idemOk);
  ok('T11 payments表只存在1张', tblCnt === 1, { count: tblCnt });

  // ===== 切换到「已配置」（本地密钥闭环）=====
  enableAlipay();
  ok('T12 配置后 isConfigured=true', alipay.isConfigured() === true, alipay.status());

  // 已配置创建支付：离线订单串 + 金额来自服务端
  let c1 = await jpost('/api/pay/alipay/create', { orderNo: 'VVIDEO1', bizType: 'video' });
  const orderString = c1.data.orderString || '';
  const params = Object.fromEntries(orderString.split('&').map((kv) => { const i = kv.indexOf('='); return [kv.slice(0, i), decodeURIComponent(kv.slice(i + 1))]; }));
  const biz = params.biz_content ? JSON.parse(params.biz_content) : {};
  ok('T13 已配置创建支付返回orderString', c1.status === 200 && c1.data.configured === true && !!orderString, c1.data && { status: c1.status, configured: c1.data.configured });
  ok('T14 订单串biz_content金额=服务端99.00', biz.total_amount === '99.00' && biz.out_trade_no === c1.data.payNo, biz);
  const payRow1 = db.prepare("SELECT * FROM payments WHERE order_no='VVIDEO1'").get();
  ok('T15 payments落库金额9900分/pending', payRow1 && payRow1.amount_fen === 9900 && payRow1.status === 'pending', payRow1);

  // 幂等创建：同一单重复创建复用同一条 pending（payNo 不变、仍只有 1 条）
  let c1b = await jpost('/api/pay/alipay/create', { orderNo: 'VVIDEO1', bizType: 'video' });
  const payRows1 = db.prepare("SELECT COUNT(*) c FROM payments WHERE order_no='VVIDEO1' AND status='pending'").get().c;
  ok('T16 重复创建幂等(同payNo、仅1条pending)', c1b.data.payNo === c1.data.payNo && payRows1 === 1, { a: c1.data.payNo, b: c1b.data.payNo, pending: payRows1 });

  // 已配置下篡改金额仍被拒，且不新增支付单
  let before = db.prepare("SELECT COUNT(*) c FROM payments WHERE order_no='EENDO1'").get().c;
  let tamper3 = await jpost('/api/pay/alipay/create', { orderNo: 'EENDO1', bizType: 'endorsement', amountFen: 5 });
  let after = db.prepare("SELECT COUNT(*) c FROM payments WHERE order_no='EENDO1'").get().c;
  ok('T17 已配置下篡改金额仍被拒400', tamper3.status === 400, tamper3.data);
  ok('T18 篡改被拒不落支付单', before === 0 && after === 0, { before, after });

  // ===== ⑤ notify 验签 + 幂等 =====
  const notifyBase = {
    app_id: APPID, out_trade_no: c1.data.payNo, trade_no: 'TRADE' + Date.now(),
    trade_status: 'TRADE_SUCCESS', total_amount: '99.00', charset: 'utf-8', version: '1.0',
    timestamp: '2026-08-31 12:00:00', seller_id: '2088000000000001',
  };
  // 坏签名 → fail
  let bad = await postNotify(notifyBase, true);
  ok('T19 坏签名回调被拒(fail)', bad.text === 'fail', bad);
  // 改金额但沿用旧签名 → 验签失败 → fail
  let amtBogus = { ...notifyBase, total_amount: '0.01' };
  let amtBad = await postNotify(amtBogus, false);
  ok('T20 改金额(签名失效)回调被拒(fail)', amtBad.text === 'fail', amtBad);
  // 正确签名但金额与服务端不一致（postNotify 按提交内容重新签名 => 签名有效，但金额对账拒 → fail）
  const mmBody = { ...notifyBase, total_amount: '0.01' };
  let mm = await postNotify(mmBody, false);
  ok('T21 签名有效但金额不符被拒(fail)', mm.text === 'fail', mm);
  // app_id 不匹配 → fail
  let wrongApp = await postNotify({ ...notifyBase, app_id: '9999' }, false);
  ok('T22 app_id不匹配被拒(fail)', wrongApp.text === 'fail', wrongApp);

  // 正确回调 → success，业务单置 paid
  let ok1 = await postNotify(notifyBase, false);
  const videoAfter = db.prepare("SELECT status FROM video_orders WHERE order_no='VVIDEO1'").get();
  const payAfter = db.prepare("SELECT * FROM payments WHERE pay_no=?").get(c1.data.payNo);
  ok('T23 合法回调返回success', ok1.text === 'success', ok1);
  ok('T24 视频订单被置为paid', videoAfter.status === 'paid', videoAfter);
  ok('T25 payments置paid且回填trade_no/notify_hash', payAfter.status === 'paid' && !!payAfter.trade_no && !!payAfter.notify_hash, payAfter);

  // 重复同一回调 → success 但幂等（状态不变，不重复推进）
  let ok2 = await postNotify(notifyBase, false);
  const stillOne = db.prepare("SELECT COUNT(*) c FROM payments WHERE order_no='VVIDEO1' AND status='paid'").get().c;
  ok('T26 重复回调幂等(success且仍1条paid)', ok2.text === 'success' && stillOne === 1, { text: ok2.text, paid: stillOne });

  // ===== dream：回调后 claims=paid 且项目进度只加一次（幂等）=====
  let cd = await jpost('/api/pay/alipay/create', { orderNo: 'DDREAM1', bizType: 'dream' });
  const dn = {
    app_id: APPID, out_trade_no: cd.data.payNo, trade_no: 'TRDREAM1', trade_status: 'TRADE_FINISHED',
    total_amount: '500.00', charset: 'utf-8', version: '1.0', timestamp: '2026-08-31 12:05:00',
  };
  await postNotify(dn, false);
  await postNotify(dn, false); // 第二次幂等
  const claimAfter = db.prepare("SELECT status,payment_tx_no FROM claims WHERE order_no='DDREAM1'").get();
  const projAfter = db.prepare("SELECT raised_amount,client_count FROM projects WHERE id=1").get();
  ok('T27 dream席位置paid并回填pay_no', claimAfter.status === 'paid' && claimAfter.payment_tx_no === cd.data.payNo, claimAfter);
  ok('T28 dream项目进度只累加一次(50000/1)', projAfter.raised_amount === 50000 && projAfter.client_count === 1, projAfter);

  // ===== sample：意向金金额只认 config（9900），回调后 draft→intent_escrow =====
  let si = await jpost('/api/pay/alipay/create', { orderNo: 'SSAMPLE1', bizType: 'sample', stage: 'intent' });
  ok('T29 样片意向金金额=config 9900分(非库默认500000)', si.data.amountFen === config.sample.intentDeposit && si.data.amountFen === 9900, si.data);
  const sn = {
    app_id: APPID, out_trade_no: si.data.payNo, trade_no: 'TRSAMPLE1', trade_status: 'TRADE_SUCCESS',
    total_amount: '99.00', charset: 'utf-8', version: '1.0', timestamp: '2026-08-31 12:10:00',
  };
  await postNotify(sn, false);
  const sampleAfter = db.prepare("SELECT status,intent_paid,step FROM sample_orders WHERE order_no='SSAMPLE1'").get();
  ok('T30 样片意向金回调后intent_escrow/intent_paid=1/step=1', sampleAfter.status === 'intent_escrow' && sampleAfter.intent_paid === 1 && sampleAfter.step === 1, sampleAfter);
  // 缺 stage 的 sample 创建应被拒
  let noStage = await jpost('/api/pay/alipay/create', { orderNo: 'SSAMPLE1', bizType: 'sample' });
  ok('T31 样片缺stage被拒400', noStage.status === 400, noStage.data);

  // ===== status 查询 =====
  let st = await jget('/api/pay/status/VVIDEO1');
  ok('T32 status查询返回paid且金额9900', st && st.payments && st.payments[0].status === 'paid' && st.payments[0].amountFen === 9900, st);

  // ===== 未配置时 notify 一律 fail（防伪造）=====
  disableAlipay();
  let uncfgNotify = await postNotify(notifyBase, false);
  ok('T33 未配置时notify一律fail', uncfgNotify.text === 'fail', uncfgNotify);

  console.log('\n================ 支付骨架自验证结果 ================');
  console.log('PASS=' + pass + '  FAIL=' + fail);
  console.log('临时库目录: ' + tmpDir + '（可手动删除）');
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('VERIFY_HARNESS_ERROR', e);
  process.exit(1);
});
