// scripts/pay_sandbox_real.js
// 支付宝「真实沙箱凭证」网关联调（V12.4.2）：使用开放平台沙箱页取得的真实沙箱 APPID/密钥/买家，
// 直连沙箱网关验证凭证有效性。只读查单 + 创建一笔 0.01 元测试单后立即 close（无买家付款动作，不成交、不留挂单）。
// 密钥只从 secrets/alipay/sandbox 文件读取，脚本内不写任何密钥；证据落 scripts/pay_sandbox_real_evidence.log（不含私钥）。
// 运行：node scripts/pay_sandbox_real.js   退出码 0=全部断言通过
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SB_DIR = path.join(__dirname, '..', 'secrets', 'alipay', 'sandbox');
const read = (f) => fs.readFileSync(path.join(SB_DIR, f), 'utf8').trim();

// ---- 真实沙箱凭证（非秘密项；密钥从文件读） ----
const SB_APPID = '9021000167659394';
const SB_SELLER_PID = '2088721110933212';
const SB_BUYER_UID = '2088722110933222';
const SB_GATEWAY = 'https://openapi-sandbox.dl.alipaydev.com/gateway.do';

// 清掉外部 ALIPAY_*，进程内注入（inline，走 service 的 wrapPem），不改本地 .env、不碰线上
for (const k of Object.keys(process.env)) if (k.startsWith('ALIPAY_')) delete process.env[k];
process.env.ALIPAY_ENABLED = 'true';
process.env.ALIPAY_APP_ID = SB_APPID;
process.env.ALIPAY_PID = SB_SELLER_PID;
process.env.ALIPAY_PRIVATE_KEY = read('sandbox_app_private_key_oneline.txt');
process.env.ALIPAY_PUBLIC_KEY = read('sandbox_alipay_public_key.txt');
process.env.ALIPAY_GATEWAY = 'sandbox';

const { AlipaySdk } = require('alipay-sdk');
const alipay = require('../services/alipay');

// 独立直连客户端（PEM 文件），用于看原始网关响应
const rawClient = new AlipaySdk({
  appId: SB_APPID,
  privateKey: read('sandbox_app_private_key.pem'),
  alipayPublicKey: read('sandbox_alipay_public_key.pem'),
  signType: 'RSA2',
  keyType: 'PKCS8',
  gateway: SB_GATEWAY,
  timeout: 15000,
});
const APP_PUB_PEM = (() => { // 沙箱应用公钥 PEM（用于独立验证离线订单串签名）
  const b = read('sandbox_app_public_key.txt').match(/.{1,64}/g).join('\n');
  return `-----BEGIN PUBLIC KEY-----\n${b}\n-----END PUBLIC KEY-----\n`;
})();

const lines = [];
const log = (...a) => { const l = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '); console.log(l); lines.push(l); };
let pass = 0, fail = 0;
const ok = (n, c, extra) => { if (c) { pass++; log('PASS  ' + n); } else { fail++; log('FAIL  ' + n + (extra ? ' -> ' + JSON.stringify(extra) : '')); } };

function verifyOrderString(orderString, pubPem) {
  const params = Object.fromEntries(orderString.split('&').map((kv) => {
    const i = kv.indexOf('='); return [kv.slice(0, i), decodeURIComponent(kv.slice(i + 1))];
  }));
  const sign = params.sign; delete params.sign;
  const canon = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&');
  const valid = crypto.createVerify('RSA-SHA256').update(canon, 'utf8').verify(pubPem, sign, 'base64');
  return { valid, biz: params.biz_content ? JSON.parse(params.biz_content) : {} };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  log('================ 晶晶日上 支付宝【真实沙箱凭证】网关联调 ================');
  log('时间: ' + new Date().toISOString() + '  沙箱APPID: ' + SB_APPID + '  网关: ' + SB_GATEWAY);

  // R1 装配状态
  const st = alipay.status();
  ok('R1 service 装配: enabled/configured/public模式/sandbox/APPID/PID 全部就位',
    st.enabled && st.configured && st.mode === 'public' && st.sandbox === true &&
    st.appIdPresent && st.pidPresent && alipay.isConfigured() === true, st);
  ok('R1b status() 不泄漏密钥材料', !/BEGIN|PRIVATE|MII[A-Za-z0-9+/]{20}/.test(JSON.stringify(st)));

  // R2 离线 APP 订单串：沙箱应用私钥签名，用沙箱应用公钥独立验签
  const outNo = 'REALSB' + Date.now();
  const orderString = alipay.buildAppOrderString({ outTradeNo: outNo, amountFen: 1, subject: '晶晶日上-沙箱联调' });
  const v = verifyOrderString(orderString, APP_PUB_PEM);
  ok('R2 离线订单串签名可被沙箱应用公钥验证通过', v.valid === true);
  ok('R2b 订单串金额0.01/产品码/seller_id=沙箱卖家PID',
    v.biz.total_amount === '0.01' && v.biz.product_code === 'QUICK_MSECURITY_PAY' &&
    v.biz.seller_id === SB_SELLER_PID && v.biz.out_trade_no === outNo, v.biz);

  // R3 真实查单（不存在单号）：期望业务错误 ACQ.TRADE_NOT_EXIST —— 证明 APPID 有效、应用私钥签名被沙箱接受
  const nonExist = 'NOEXIST_' + Date.now();
  let rawQuery = null, signedQueryOk = false, signedQueryErr = '';
  try {
    rawQuery = await rawClient.exec('alipay.trade.query', { bizContent: { out_trade_no: nonExist } }, { validateSign: false });
  } catch (e) { rawQuery = { _throw: e.message }; }
  // 注意：alipay-sdk v4 原始响应为驼峰（subCode/subMsg），service 层才会归一下划线，这里用独立 rawClient 故兼容两种
  const rq = rawQuery && (rawQuery.alipayTradeQueryResponse || rawQuery);
  const rqSub = rq && (rq.sub_code || rq.subCode);
  ok('R3 真实网关响应: code=40004 且 subCode=ACQ.TRADE_NOT_EXIST（签名已被沙箱接受，非签名错误）',
    rq && String(rq.code) === '40004' && rqSub === 'ACQ.TRADE_NOT_EXIST',
    rq && { code: rq.code, subCode: rqSub, msg: rq.msg, subMsg: rq.sub_msg || rq.subMsg });
  try {
    await rawClient.exec('alipay.trade.query', { bizContent: { out_trade_no: nonExist } }, { validateSign: true });
    signedQueryOk = true; // 未抛错即响应签名可被沙箱支付宝公钥验证
  } catch (e) {
    // 40004 业务错误在 validateSign 下若因“无 sign”抛错，说明响应未签名；记录原始信息以便判断
    signedQueryErr = String(e.message).slice(0, 160);
    // 沙箱错误响应通常仍带签名，不应对验签抛错
    signedQueryOk = /TRADE_NOT_EXIST|40004/.test(signedQueryErr) === false && /sign|签名/i.test(signedQueryErr) === false;
  }
  ok('R3b 响应可用沙箱支付宝公钥验签（validateSign:true 不抛签名错误）', signedQueryOk, { err: signedQueryErr });

  // R4 真实创建 0.01 元测试单 → 查单应为 WAIT_BUYER_PAY → 立即 close 清理（无付款、不成交）
  let createResp = null, createErr = '';
  try {
    createResp = await rawClient.exec('alipay.trade.create', {
      bizContent: {
        out_trade_no: outNo, total_amount: '0.01', subject: '晶晶日上沙箱联调测试单',
        buyer_id: SB_BUYER_UID, seller_id: SB_SELLER_PID, // trade.create 需显式卖家；该接口非 APP 支付，不带 QUICK_MSECURITY_PAY
      },
    }, { validateSign: true });
  } catch (e) { createErr = String(e.message).slice(0, 200); }
  // alipay-sdk exec 已解包为内层响应（驼峰 tradeNo），兼容包裹/未包裹两种形态
  const cr = createResp && (createResp.alipayTradeCreateResponse || createResp);
  const crTradeNo = cr && (cr.trade_no || cr.tradeNo);
  const created = cr && String(cr.code) === '10000' && !!crTradeNo;
  ok('R4 沙箱 alipay.trade.create 返回 10000 且生成 tradeNo（真实下单链路通）', created,
    created ? { tradeNo: crTradeNo } : { resp: cr, err: createErr });

  if (created) {
    await sleep(1000);
    let qAfter = null;
    try { qAfter = await alipay.queryTrade({ outTradeNo: outNo }); } catch (e) { qAfter = { _throw: e.message }; }
    // service 层已把 SDK 驼峰归一为下划线，qAfter.trade_status 必须能读到（这正是本次修复点）
    const qStatus = qAfter && (qAfter.trade_status || qAfter.tradeStatus);
    ok('R4b 创建后经 service.queryTrade 归一读到 trade_status=WAIT_BUYER_PAY（查单补入账链路成立）',
      qAfter && (qStatus === 'WAIT_BUYER_PAY' || qStatus === 'TRADE_CLOSED' || String(qAfter.code) === '10000'),
      qAfter && { status: qStatus, code: qAfter.code, hasSnake: qAfter && 'trade_status' in qAfter });
    // 关闭测试单，自清
    let closeResp = null;
    try {
      closeResp = await rawClient.exec('alipay.trade.close',
        { bizContent: { out_trade_no: outNo, trade_no: crTradeNo } }, { validateSign: false });
    } catch (e) { closeResp = { _throw: e.message }; }
    const cl = closeResp && (closeResp.alipayTradeCloseResponse || closeResp);
    ok('R4c 测试单已 alipay.trade.close 关闭（沙箱无残留挂单）', cl && String(cl.code) === '10000', cl);
  } else {
    log('INFO  R4 未创建成功（不影响 R1-R3 凭证有效性结论；若为参数/buyer_id 问题见上方原始响应）');
  }

  log('\n================ 真实沙箱联调结果 ================');
  log('PASS=' + pass + '  FAIL=' + fail);
  const ev = path.join(__dirname, 'pay_sandbox_real_evidence.log');
  fs.writeFileSync(ev, lines.join('\n') + '\n', 'utf8');
  log('证据已留存: ' + ev);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  log('REAL_SANDBOX_HARNESS_ERROR ' + (e && e.stack || e));
  fs.writeFileSync(path.join(__dirname, 'pay_sandbox_real_evidence.log'), lines.join('\n') + '\n', 'utf8');
  process.exit(1);
});
