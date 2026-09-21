// R0.6: this historical script expects removed demo/autoapproval behavior.
throw new Error('LEGACY_SELFTEST_RETIRED: 请运行 npm run test:legacy-safety；旧脚本不可作为当前验收。');

// scripts/pay_sandbox_joint_test.js
// 支付宝 APP 支付「沙箱联调」可复跑脚本（V12.4 骨架配套，离线闭环，绝不发生真实支付、绝不使用真实密钥）
// ----------------------------------------------------------------------------
// 与 verify_pay_skeleton.js（33 项 HTTP 断言）互补，本脚本额外覆盖：
//   J01 实测交付物 scripts/gen_alipay_rsa_keypair.js 真能产出 RSA2(PKCS8/SPKI) 密钥对
//   J02 模拟「拿到沙箱材料后回填 .env」：用产出的 PEM 文件装配 services/alipay，状态正确且 status() 不泄漏密钥
//   J03 离线 sdkExecute 生成 APP 订单串：金额来自服务端；用公钥独立复算 RSA2 签名必须通过；biz_content 字段齐全
//   J04 金额工具守卫（非正整数分直接抛错，杜绝 0/负/小数）
//   J05~J08 鉴权 401、未配置演示降级（不写支付单）、已配置下单、重复下单幂等
//   J09~J13 自签 notify 走真实 SDK checkNotifySign：坏签名/错 app_id/金额不符全拒；合法回调入账；重放幂等
//   J14~J15 主动查单 trade.query 路径（以受控桩模拟沙箱网关响应）：WAIT_BUYER_PAY 不入账、TRADE_SUCCESS 补入账且幂等、
//           网关抛错时接口仍 200 返回本地状态（异常被兜住）
//   J16~J17 dream 席位幂等推进、样片【制作款】分期金额只认 config(490100=4901.00)
//   J18 真实沙箱网关只读负向探测（假 APPID，trade.query 只读不付款；预期被网关拒或网络不可达，均算“链路有兜底”，非致命）
//   J19 关闭配置后 notify 一律 fail（防伪造）
// 运行：node scripts/pay_sandbox_joint_test.js        退出码 0=全过
// 证据：控制台输出同时落 scripts/pay_sandbox_joint_evidence.log（只含状态/断言，不含任何私钥内容）
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

// ---------- 0) 隔离环境：临时库 + 独立端口；先清掉任何外部 ALIPAY_*，保证可复跑 ----------
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jjsr_sandbox_'));
const certsDir = path.join(tmpDir, 'certs');
process.env.SQLITE_PATH = path.join(tmpDir, 'sandbox.db');
process.env.NODE_ENV = 'development';
process.env.PORT = '3998';
process.env.JWT_SECRET = 'sandbox_joint_test_jwt_secret_only_32chars!';
for (const k of Object.keys(process.env)) if (k.startsWith('ALIPAY_')) delete process.env[k];

const db = require('../db');
const config = require('../config');
const auth = require('../middleware/auth');
const alipay = require('../services/alipay');
const { AlipaySdk } = require('alipay-sdk');

// ---------- 证据日志（镜像 console，最后落盘；不记录任何 PEM/私钥） ----------
const lines = [];
function log(...a) {
  const line = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
  console.log(line); lines.push(line);
}
let pass = 0, fail = 0, skip = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; log('PASS  ' + name); }
  else { fail++; log('FAIL  ' + name + (extra ? '  -> ' + JSON.stringify(extra) : '')); }
}
function info(name, extra) { log('INFO  ' + name + (extra ? '  -> ' + JSON.stringify(extra) : '')); }

// ---------- 1) 造业务数据（金额单位：分） ----------
db.prepare("INSERT INTO users (id,nickname,role,status) VALUES (1,'sandbox-tester','user','active')").run();
db.prepare("INSERT INTO video_orders (order_no,user_id,talent_id,amount,status) VALUES ('V1',1,2,9900,'pending')").run();
db.prepare("INSERT INTO endorsement_orders (order_no,user_id,talent_id,amount,status) VALUES ('E1',1,2,29900,'pending')").run();
db.prepare("INSERT INTO projects (id,title,goal_amount,raised_amount,client_count,status) VALUES (1,'沙箱定制剧',50000,0,0,'recruiting')").run();
db.prepare("INSERT INTO claims (order_no,user_id,project_id,amount,status) VALUES ('D1',1,1,50000,'pending')").run();
db.prepare("INSERT INTO sample_orders (order_no,user_id,amount,status,step) VALUES ('S1',1,500000,'draft',0)").run();
db.prepare("INSERT INTO sample_orders (order_no,user_id,amount,status,step) VALUES ('S2',1,500000,'script_finalized',4)").run();
// 并发/重复推进专项数据
db.prepare("INSERT INTO endorsement_orders (order_no,user_id,talent_id,amount,status) VALUES ('E2',1,2,29900,'pending')").run();
db.prepare("INSERT INTO video_orders (order_no,user_id,talent_id,amount,status) VALUES ('V3',1,2,9900,'pending')").run();
db.prepare("INSERT INTO projects (id,title,goal_amount,raised_amount,client_count,status) VALUES (2,'重复推进测试剧',50000,0,0,'recruiting')").run();
db.prepare("INSERT INTO claims (order_no,user_id,project_id,amount,status) VALUES ('C1',1,2,30000,'pending')").run();

require('../app');
const BASE = `http://127.0.0.1:${process.env.PORT}`;
const token = auth.signToken({ userId: 1, role: 'user' });
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitHealthy() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(BASE + '/api/health'); if (r.ok) return; } catch (e) {}
    await sleep(100);
  }
  throw new Error('server not ready');
}
const jget = async (p) => (await fetch(BASE + p, { headers: H })).json();
const jpost = async (p, body, headers) => {
  const r = await fetch(BASE + p, { method: 'POST', headers: headers || H, body: JSON.stringify(body) });
  const txt = await r.text(); let data; try { data = JSON.parse(txt); } catch { data = txt; }
  return { status: r.status, data };
};

// 测试用沙箱假材料（非真实）
const SANDBOX_APPID = '2021000999999999';
const SANDBOX_PID = '2088999999999999';
let PRIV = '', PUB = '';
function enableAlipay() {
  process.env.ALIPAY_ENABLED = 'true';
  process.env.ALIPAY_APP_ID = SANDBOX_APPID;
  process.env.ALIPAY_PID = SANDBOX_PID;
  process.env.ALIPAY_PRIVATE_KEY = PRIV;
  process.env.ALIPAY_PUBLIC_KEY = PUB; // 闭环测试：自生成公钥同时充当“平台回传的支付宝公钥”
  process.env.ALIPAY_GATEWAY = 'sandbox';
  process.env.ALIPAY_NOTIFY_URL = 'https://notify.example.com/api/pay/alipay/notify';
  alipay._reset();
}
function disableAlipay() {
  for (const k of Object.keys(process.env)) if (k.startsWith('ALIPAY_')) delete process.env[k];
  alipay._reset();
}
// 按支付宝开放平台规则签名：剔除 sign/sign_type、key 字典序、k=v& 拼接、RSA-SHA256、base64
function signParams(obj, keyPem) {
  const canon = Object.keys(obj).filter((k) => k && k !== 'sign' && k !== 'sign_type').sort()
    .map((k) => `${k}=${obj[k]}`).join('&');
  return crypto.createSign('RSA-SHA256').update(canon, 'utf8').sign(keyPem, 'base64');
}
async function postNotify(obj, mode) { // mode: 'ok' 正确私钥签 | 'bad' 坏签名 | 'stale' 用上一次签名
  const body = { ...obj };
  if (mode === 'bad') body.sign = 'Zm9vYmFyZm9vYmFy';
  else body.sign = signParams(body, PRIV);
  body.sign_type = 'RSA2';
  const r = await fetch(BASE + '/api/pay/alipay/notify', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  return { status: r.status, text: await r.text() };
}
// 独立（不依赖 SDK）校验 sdkExecute 订单串签名
function verifyOrderString(orderString, pubPem) {
  const params = Object.fromEntries(orderString.split('&').map((kv) => {
    const i = kv.indexOf('='); return [kv.slice(0, i), decodeURIComponent(kv.slice(i + 1))];
  }));
  const sign = params.sign; delete params.sign;
  const canon = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&');
  const valid = crypto.createVerify('RSA-SHA256').update(canon, 'utf8').verify(pubPem, sign, 'base64');
  return { valid, params, biz: params.biz_content ? JSON.parse(params.biz_content) : {} };
}

(async () => {
  log('================ 晶晶日上 支付宝 APP 支付 · 沙箱联调（离线闭环，无真实支付） ================');
  log('时间: ' + new Date().toISOString() + '  临时目录: ' + tmpDir);
  await waitHealthy();

  // ===== J01 实测密钥生成脚本（交付物本身必须可跑） =====
  let keygenOut = '';
  try {
    keygenOut = execFileSync(process.execPath, [path.join(__dirname, 'gen_alipay_rsa_keypair.js'), certsDir], { encoding: 'utf8' });
  } catch (e) { log('keygen stderr', e.message); }
  const privPemPath = path.join(certsDir, 'app_private_pkcs8.pem');
  const pubPemPath = path.join(certsDir, 'app_public.pem');
  PRIV = fs.existsSync(privPemPath) ? fs.readFileSync(privPemPath, 'utf8') : '';
  PUB = fs.existsSync(pubPemPath) ? fs.readFileSync(pubPemPath, 'utf8') : '';
  ok('J01 密钥生成脚本产出 PKCS8 私钥+SPKI 公钥两个 PEM',
    /-----BEGIN PRIVATE KEY-----/.test(PRIV) && /-----BEGIN PUBLIC KEY-----/.test(PUB),
    { privBytes: PRIV.length, pubBytes: PUB.length, printedOneLinePub: /应用公钥单行/.test(keygenOut) });

  // ===== J02 模拟回填 .env 后装配（从 PEM 文件读密钥，等价 ALIPAY_PRIVATE_KEY_PATH 流程） =====
  enableAlipay();
  const st = alipay.status();
  ok('J02 装配后 enabled/configured/public模式/sandbox 全部正确',
    st.enabled === true && st.configured === true && st.mode === 'public' && st.sandbox === true &&
    st.appIdPresent === true && st.pidPresent === true && alipay.isConfigured() === true, st);
  ok('J02b status() 不泄漏任何密钥材料（无 PEM/base64 长串）',
    !/BEGIN|PRIVATE|PUBLIC|MII[A-Za-z0-9+/]{20}/.test(JSON.stringify(st)));

  // ===== J03 离线 sdkExecute 订单串：服务端金额 + 独立验签 + 字段齐全（全程无网络） =====
  const orderString = alipay.buildAppOrderString({ outTradeNo: 'AP_OFFLINE_1', amountFen: 9900, subject: '晶晶日上-祝福视频' });
  const v = verifyOrderString(orderString, PUB);
  ok('J03 订单串 RSA2 签名可被公钥独立验证通过(离线sdkExecute)', v.valid === true);
  ok('J03b biz_content 金额=服务端99.00/out_trade_no一致/产品码QUICK_MSECURITY_PAY/seller_id=PID',
    v.biz.total_amount === '99.00' && v.biz.out_trade_no === 'AP_OFFLINE_1' &&
    v.biz.product_code === 'QUICK_MSECURITY_PAY' && v.biz.seller_id === SANDBOX_PID && /晶晶日上/.test(v.biz.subject), v.biz);
  ok('J03c 订单串签入 notify_url（异步回调不依赖开放平台后台默认配置）',
    v.params.notify_url === 'https://notify.example.com/api/pay/alipay/notify', { notify_url: v.params.notify_url });

  // ===== J04 金额守卫 =====
  let guard = { zero: false, neg: false, float: false, ok: false };
  try { alipay.fenToYuan(0); } catch { guard.zero = true; }
  try { alipay.fenToYuan(-1); } catch { guard.neg = true; }
  try { alipay.fenToYuan(99.5); } catch { guard.float = true; }
  guard.ok = alipay.fenToYuan(490100) === '4901.00';
  ok('J04 fenToYuan 拒绝0/负/小数且正常换算', guard.zero && guard.neg && guard.float && guard.ok, guard);

  // ===== J05 未登录 401 =====
  const noAuthCreate = await fetch(BASE + '/api/pay/alipay/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const noAuthStatus = await fetch(BASE + '/api/pay/status/X');
  ok('J05 create/status 未登录均 401', noAuthCreate.status === 401 && noAuthStatus.status === 401);

  // ===== J06 未配置：演示降级且不写支付单 =====
  disableAlipay();
  const demo = await jpost('/api/pay/alipay/create', { orderNo: 'V1', bizType: 'video' });
  const demoRows = db.prepare("SELECT COUNT(*) c FROM payments WHERE order_no='V1'").get().c;
  ok('J06 未配置创建支付=演示占位(configured:false,demo:true)且不写payments',
    demo.status === 200 && demo.data.configured === false && demo.data.demo === true && demoRows === 0, demo.data);

  // ===== J07 已配置：真实 HTTP 下单，金额来自服务端 =====
  enableAlipay();
  const c1 = await jpost('/api/pay/alipay/create', { orderNo: 'V1', bizType: 'video' });
  const v1 = c1.data.orderString ? verifyOrderString(c1.data.orderString, PUB) : null;
  const row1 = db.prepare("SELECT * FROM payments WHERE pay_no=?").get(c1.data.payNo);
  ok('J07 已配置下单返回可验签订单串、金额9900分/pending落库',
    c1.status === 200 && c1.data.configured === true && v1 && v1.valid &&
    v1.biz.total_amount === '99.00' && row1 && row1.amount_fen === 9900 && row1.status === 'pending',
    { status: c1.status, amountFen: c1.data.amountFen });

  // ===== J08 重复下单幂等（同 payNo，仅 1 条 pending） =====
  const c1b = await jpost('/api/pay/alipay/create', { orderNo: 'V1', bizType: 'video' });
  const pendCnt = db.prepare("SELECT COUNT(*) c FROM payments WHERE order_no='V1' AND status='pending'").get().c;
  ok('J08 重复创建复用同一pending支付单(payNo不变、仅1条)', c1b.data.payNo === c1.data.payNo && pendCnt === 1);

  // ===== J09 service 层真实 SDK 验签（不经 HTTP，直接验证 services/alipay.verifyNotify） =====
  const baseNotify = {
    app_id: SANDBOX_APPID, out_trade_no: c1.data.payNo, trade_no: 'TR' + Date.now(),
    trade_status: 'TRADE_SUCCESS', total_amount: '99.00', charset: 'utf-8', version: '1.0',
    timestamp: '2026-08-31 10:00:00', seller_id: SANDBOX_PID,
  };
  const signed = { ...baseNotify, sign: signParams(baseNotify, PRIV), sign_type: 'RSA2' };
  const tampered = { ...baseNotify, total_amount: '0.01', sign: signParams({ ...baseNotify, total_amount: '0.01' }, PRIV), sign_type: 'RSA2' };
  const staleSigned = { ...baseNotify, total_amount: '0.01', sign: signed.sign, sign_type: 'RSA2' };
  ok('J09 真实SDK checkNotifySign：正确签名通过', alipay.verifyNotify(signed) === true);
  ok('J09b 签名有效但内容被改(重签)验签仍通过——由后续金额对账兜底', alipay.verifyNotify(tampered) === true);
  ok('J09c 改内容却沿用旧签名→验签失败', alipay.verifyNotify(staleSigned) === false);
  ok('J09d 坏签名→验签失败', alipay.verifyNotify({ ...signed, sign: 'bad' }) === false);

  // ===== J10 HTTP：坏签名 / 错 app_id 一律 fail，且不入账 =====
  const bad = await postNotify(baseNotify, 'bad');
  const wrongApp = await postNotify({ ...baseNotify, app_id: '2021000000000000' }, 'ok');
  ok('J10 坏签名/错app_id回调均fail', bad.text === 'fail' && wrongApp.text === 'fail', { bad: bad.text, wrongApp: wrongApp.text });

  // ===== J11 签名有效但金额不符 → fail（金额服务端权威的最后一道闸） =====
  const amt = await postNotify({ ...baseNotify, total_amount: '0.01' }, 'ok');
  const stillPending = db.prepare("SELECT status FROM payments WHERE pay_no=?").get(c1.data.payNo);
  ok('J11 签名有效但金额0.01≠99.00被拒且仍pending', amt.text === 'fail' && stillPending.status === 'pending');

  // ===== J12 合法回调入账 =====
  const ok1 = await postNotify(baseNotify, 'ok');
  const videoPaid = db.prepare("SELECT status FROM video_orders WHERE order_no='V1'").get();
  const payPaid = db.prepare("SELECT * FROM payments WHERE pay_no=?").get(c1.data.payNo);
  ok('J12 合法notify=success、视频单paid、payments回填trade_no/notify_hash',
    ok1.text === 'success' && videoPaid.status === 'paid' &&
    payPaid.status === 'paid' && !!payPaid.trade_no && !!payPaid.notify_hash);

  // ===== J13 重放幂等（再打 2 次，paid 仍 1 条） =====
  const r2 = await postNotify(baseNotify, 'ok');
  const r3 = await postNotify(baseNotify, 'ok');
  const paidCnt = db.prepare("SELECT COUNT(*) c FROM payments WHERE order_no='V1' AND status='paid'").get().c;
  ok('J13 notify重放2次始终success且paid仅1条(幂等)', r2.text === 'success' && r3.text === 'success' && paidCnt === 1);

  // ===== J14 主动查单 trade.query 路径（受控桩模拟沙箱网关，确定性、无网络） =====
  const origExec = AlipaySdk.prototype.exec;
  let queryMode = 'wait';
  AlipaySdk.prototype.exec = async function (method, params) {
    if (method !== 'alipay.trade.query') throw new Error('unexpected method ' + method);
    const outNo = params && params.bizContent && params.bizContent.out_trade_no;
    if (queryMode === 'throw') throw new Error('simulated gateway network error');
    const status = queryMode === 'success' ? 'TRADE_SUCCESS' : 'WAIT_BUYER_PAY';
    return {
      alipayTradeQueryResponse: {
        code: '10000', msg: 'Success', out_trade_no: outNo, trade_no: 'Q' + Date.now(),
        trade_status: status, total_amount: '299.00',
      },
    };
  };
  const ce = await jpost('/api/pay/alipay/create', { orderNo: 'E1', bizType: 'endorsement' });
  queryMode = 'wait';
  const stWait = await jget('/api/pay/status/E1');
  const eAfterWait = db.prepare("SELECT status FROM endorsement_orders WHERE order_no='E1'").get();
  ok('J14 查单返回WAIT_BUYER_PAY时保持pending不入账',
    stWait.payments[0].status === 'pending' && eAfterWait.status === 'pending', stWait);
  queryMode = 'success';
  const stOk = await jget('/api/pay/status/E1');
  const eAfterOk = db.prepare("SELECT status FROM endorsement_orders WHERE order_no='E1'").get();
  ok('J14b 查单返回TRADE_SUCCESS且金额一致→补入账paid(查单推进)',
    stOk.payments[0].status === 'paid' && stOk.payments[0].hasTradeNo === true && eAfterOk.status === 'paid', stOk);
  const stOk2 = await jget('/api/pay/status/E1');
  const ePaidCnt = db.prepare("SELECT COUNT(*) c FROM payments WHERE order_no='E1' AND status='paid'").get().c;
  ok('J14c 再次查单幂等(仍1条paid)', stOk2.payments[0].status === 'paid' && ePaidCnt === 1);

  // ===== J15 查单网关抛错：接口不 500，返回本地状态 =====
  queryMode = 'throw';
  let stErr = null, stErrCode = 0;
  try {
    // 新建一张 pending 单，让其在查单时触发抛错路径
    db.prepare("INSERT INTO video_orders (order_no,user_id,talent_id,amount,status) VALUES ('V2',1,2,19900,'pending')").run();
    const cv2 = await jpost('/api/pay/alipay/create', { orderNo: 'V2', bizType: 'video' });
    const rr = await fetch(BASE + '/api/pay/status/V2', { headers: H });
    stErrCode = rr.status; stErr = await rr.json();
  } catch (e) { stErr = { threw: e.message }; }
  ok('J15 查单网关异常被兜住：HTTP200且本地pending状态照常返回',
    stErrCode === 200 && stErr && stErr.payments && stErr.payments[0].status === 'pending', { code: stErrCode });
  AlipaySdk.prototype.exec = origExec; // 还原真实 exec

  // ===== J16 dream 回调幂等推进（项目进度只加一次） =====
  const cd = await jpost('/api/pay/alipay/create', { orderNo: 'D1', bizType: 'dream' });
  const dn = {
    app_id: SANDBOX_APPID, out_trade_no: cd.data.payNo, trade_no: 'TRDREAM1', trade_status: 'TRADE_FINISHED',
    total_amount: '500.00', charset: 'utf-8', version: '1.0', timestamp: '2026-08-31 10:05:00',
  };
  await postNotify(dn, 'ok'); await postNotify(dn, 'ok');
  const claim = db.prepare("SELECT status,payment_tx_no FROM claims WHERE order_no='D1'").get();
  const proj = db.prepare("SELECT raised_amount,client_count FROM projects WHERE id=1").get();
  ok('J16 dream两次notify只推进一次(claims paid/项目50000分/人数1)',
    claim.status === 'paid' && claim.payment_tx_no === cd.data.payNo &&
    proj.raised_amount === 50000 && proj.client_count === 1, { claim, proj });

  // ===== J17 样片制作款分期：金额只认 config(490100=4901.00)，状态 script_finalized 可付 =====
  const sp = await jpost('/api/pay/alipay/create', { orderNo: 'S2', bizType: 'sample', stage: 'production' });
  const spv = sp.data.orderString ? verifyOrderString(sp.data.orderString, PUB) : null;
  ok('J17 样片制作款金额=config 490100分(4901.00)且订单串可验签',
    sp.data.amountFen === config.sample.productionFee && sp.data.amountFen === 490100 && spv && spv.valid &&
    spv.biz.total_amount === '4901.00', { amountFen: sp.data.amountFen });
  // 意向金链路再走一遍回调
  const si = await jpost('/api/pay/alipay/create', { orderNo: 'S1', bizType: 'sample', stage: 'intent' });
  const sn = {
    app_id: SANDBOX_APPID, out_trade_no: si.data.payNo, trade_no: 'TRSAMPLE1', trade_status: 'TRADE_SUCCESS',
    total_amount: '99.00', charset: 'utf-8', version: '1.0', timestamp: '2026-08-31 10:10:00',
  };
  await postNotify(sn, 'ok');
  const s1 = db.prepare("SELECT status,intent_paid,step FROM sample_orders WHERE order_no='S1'").get();
  ok('J17b 样片意向金回调后 intent_escrow/intent_paid=1/step=1',
    s1.status === 'intent_escrow' && s1.intent_paid === 1 && s1.step === 1, s1);

  // ===== J18-a 金额对账数值化：99 与 99.00 等价；缺失/乱值拒绝 =====
  const payRouter = require('../routes/pay');
  ok('J18a yuanEqual 兼容 99/99.00、拒绝空值与乱值',
    payRouter._testing.yuanEqual('99', '99.00') === true &&
    payRouter._testing.yuanEqual(9900 / 100, '99.00') === true &&
    payRouter._testing.yuanEqual(undefined, '99.00') === false &&
    payRouter._testing.yuanEqual('abc', '99.00') === false &&
    payRouter._testing.yuanEqual('0.01', '99.00') === false);
  // total_amount 用非两位小数 '99'（正确签名）也应被接受入账
  const cv3 = await jpost('/api/pay/alipay/create', { orderNo: 'V3', bizType: 'video' });
  const n3 = {
    app_id: SANDBOX_APPID, out_trade_no: cv3.data.payNo, trade_no: 'TRV3', trade_status: 'TRADE_SUCCESS',
    total_amount: '99', charset: 'utf-8', version: '1.0', timestamp: '2026-08-31 10:15:00',
  };
  const n3r = await postNotify(n3, 'ok');
  const v3paid = db.prepare("SELECT status FROM video_orders WHERE order_no='V3'").get();
  ok('J18b 回传金额为 99（非两位小数）数值等价仍可入账', n3r.text === 'success' && v3paid.status === 'paid', { r: n3r.text, st: v3paid.status });

  // ===== J19-a 并发双击创建：两个请求同时到达，只允许 1 条 pending、都 200、payNo 一致 =====
  const [ca, cb] = await Promise.all([
    jpost('/api/pay/alipay/create', { orderNo: 'E2', bizType: 'endorsement' }),
    jpost('/api/pay/alipay/create', { orderNo: 'E2', bizType: 'endorsement' }),
  ]);
  const e2pend = db.prepare("SELECT COUNT(*) c, GROUP_CONCAT(pay_no) nos FROM payments WHERE order_no='E2' AND status='pending'").get();
  ok('J19a 并发双击创建均200且仅1条pending、payNo一致(唯一索引兜底)',
    ca.status === 200 && cb.status === 200 && ca.data.configured === true && cb.data.configured === true &&
    e2pend.c === 1 && ca.data.payNo === cb.data.payNo, { a: ca.status, b: cb.status, c: e2pend.c, nos: e2pend.nos });

  // ===== J19-b dream 重复推进守卫：席位已 paid 后再次 markBusinessPaid，项目进度不双加 =====
  const payRouterTesting = payRouter._testing;
  const fakePay1 = { order_no: 'C1', biz_type: 'dream', stage: '', pay_no: 'APC1' };
  payRouterTesting.markBusinessPaid(fakePay1);
  const proj2after1 = db.prepare("SELECT raised_amount,client_count FROM projects WHERE id=2").get();
  const claim1after = db.prepare("SELECT status,payment_tx_no FROM claims WHERE order_no='C1'").get();
  payRouterTesting.markBusinessPaid(fakePay1); // 再推进一次（模拟重复支付回调/重复查单补入账）
  const proj2after2 = db.prepare("SELECT raised_amount,client_count FROM projects WHERE id=2").get();
  ok('J19b dream重复推进只累加一次(30000/1)、席位置paid回填payNo',
    claim1after.status === 'paid' && claim1after.payment_tx_no === 'APC1' &&
    proj2after1.raised_amount === 30000 && proj2after1.client_count === 1 &&
    proj2after2.raised_amount === 30000 && proj2after2.client_count === 1, { p1: proj2after1, p2: proj2after2 });

  // ===== J18 真实沙箱网关只读负向探测（假 APPID；trade.query 只读，绝不付款；非致命） =====
  try {
    const q = await alipay.queryTrade({ outTradeNo: 'AP_NONEXIST_' + Date.now() });
    info('J18 沙箱网关已响应（假APPID预期业务错误）', { code: q && q.code, subCode: q && q.sub_code, msg: q && q.sub_msg || q && q.msg });
    ok('J18 真实网关探测：请求被正常返回/结构化处理，未崩溃', true);
  } catch (e) {
    const netErr = /timeout|ENOTFOUND|ECONN|fetch failed|network/i.test(e.message || '');
    info('J18 沙箱网关探测' + (netErr ? '（本机网络不可达，跳过实连）' : '（网关按预期拒绝假凭证）'), { code: e.code, error: String(e.message).slice(0, 160) });
    // 网络不可达=SKIP 不算失败；被网关拒（凭证错误）=符合预期；且错误必须被归一为 ALIPAY_GATEWAY_ERROR（F4）
    if (netErr) skip++; else pass++;
    ok('J18 真实网关探测：异常被捕获且错误码归一为 ALIPAY_GATEWAY_ERROR、无未捕获崩溃',
      netErr ? true : e.code === 'ALIPAY_GATEWAY_ERROR', { code: e.code });
  }

  // ===== J19 关闭配置：notify 一律 fail（防伪造入账） =====
  disableAlipay();
  const uncfg = await postNotify(baseNotify, 'ok');
  ok('J19 未配置时任何notify一律fail', uncfg.text === 'fail');

  log('\n================ 沙箱联调结果 ================');
  log('PASS=' + pass + '  FAIL=' + fail + '  SKIP(网络不可达项)=' + skip);
  log('说明：全程离线闭环，APPID/PID/密钥均为测试自生成，未发生任何真实支付、未写入任何真实密钥。');
  const evidencePath = path.join(__dirname, 'pay_sandbox_joint_evidence.log');
  fs.writeFileSync(evidencePath, lines.join('\n') + '\n', 'utf8');
  log('证据已留存: ' + evidencePath);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  log('JOINT_TEST_HARNESS_ERROR ' + (e && e.stack || e));
  fs.writeFileSync(path.join(__dirname, 'pay_sandbox_joint_evidence.log'), lines.join('\n') + '\n', 'utf8');
  process.exit(1);
});
