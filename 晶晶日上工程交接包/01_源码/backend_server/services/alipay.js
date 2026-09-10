// services/alipay.js - 支付宝 APP 支付网关封装（V12.4，官方 alipay-sdk，RSA2/SHA256）
// ----------------------------------------------------------------------------
// 设计原则（与「先搭骨架、密钥一到填 .env 即通」对齐）：
// 1) 全部配置只从环境变量读取（process.env），不在代码里写任何真实密钥；
// 2) 密钥缺失 / ALIPAY_ENABLED 非 true 时【不抛启动错误】：require 本模块永远安全，
//    isConfigured() 返回 false，由 routes/pay.js 优雅降级为「演示环境」占位，不阻断主流程；
// 3) 同时支持「公钥模式」(ALIPAY_PUBLIC_KEY) 与「证书模式」(三张证书路径)；
// 4) 网关用 ALIPAY_GATEWAY 切换：formal=正式、sandbox=沙箱，也可直接填完整 URL；
// 5) APP 支付 trade.app.pay 用 sdkExecute【离线】生成待签订单串（不发起网络请求，
//    订单串交给 APP 端支付宝 SDK 唤起）；trade.query / trade.refund 用 exec 走网关；
// 6) 异步通知用 checkNotifySign(body, true) 做 RSA2 验签（express.urlencoded 已解码，raw=true 避免二次 decode）；
// 7) 任何日志都不输出私钥/公钥/订单串签名等敏感内容，只输出是否存在、长度等非敏感状态。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');

// 官方 SDK 用命名导出 AlipaySdk；require 失败不影响进程启动（仅在真正需要时才报错）
let AlipaySdk = null;
try {
  ({ AlipaySdk } = require('alipay-sdk'));
} catch (e) {
  AlipaySdk = null;
}

// 网关别名：formal=线上正式环境，sandbox=沙箱联调环境
const GATEWAY = {
  formal: 'https://openapi.alipay.com/gateway.do',
  sandbox: 'https://openapi-sandbox.dl.alipaydev.com/gateway.do',
};

const SUCCESS_TRADE_STATUS = ['TRADE_SUCCESS', 'TRADE_FINISHED'];

// 把单行 base64 密钥包成 PEM；本身已是 PEM 的原样返回
function wrapPem(raw, type) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/-----BEGIN/.test(s)) return s;
  const body = s.replace(/\s+/g, '');
  const lines = body.match(/.{1,64}/g).join('\n');
  if (type === 'private') {
    return `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----\n`;
  }
  return `-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----\n`;
}

// 优先读内联密钥，其次读 PEM 文件；都没有返回空串（读取失败也降级为空串，绝不崩进程）
function readKey(inlineValue, filePath, type) {
  const inline = String(inlineValue || '').trim();
  if (inline) return wrapPem(inline, type);
  if (filePath) {
    try {
      return fs.readFileSync(path.resolve(filePath), 'utf8');
    } catch (e) {
      return '';
    }
  }
  return '';
}

// 每次都从当前 env 重新读取，便于「回填 .env 后重启即生效」以及测试期切换
function loadOptions() {
  const enabled = process.env.ALIPAY_ENABLED === 'true';
  const appId = String(process.env.ALIPAY_APP_ID || '').trim();
  const pid = String(process.env.ALIPAY_PID || '').trim(); // 卖家支付宝账号/合作伙伴 2088 开头（seller_id）
  const notifyUrl = String(process.env.ALIPAY_NOTIFY_URL || '').trim();

  // 应用私钥（内联或文件）
  const privateKey = readKey(process.env.ALIPAY_PRIVATE_KEY, process.env.ALIPAY_PRIVATE_KEY_PATH, 'private');
  // 支付宝公钥（公钥模式，内联或文件）
  const alipayPublicKey = readKey(process.env.ALIPAY_PUBLIC_KEY, process.env.ALIPAY_PUBLIC_KEY_PATH, 'public');

  // 证书模式三证书路径（应用公钥证书 / 支付宝公钥证书 / 支付宝根证书）
  const appCertPath = String(process.env.ALIPAY_APP_CERT_PATH || '').trim();
  const alipayPublicCertPath = String(process.env.ALIPAY_ALIPAY_CERT_PATH || process.env.ALIPAY_PUBLIC_CERT_PATH || '').trim();
  const alipayRootCertPath = String(process.env.ALIPAY_ROOT_CERT_PATH || '').trim();
  const certMode = Boolean(appCertPath && alipayPublicCertPath && alipayRootCertPath);
  const publicMode = Boolean(alipayPublicKey);

  // 网关：formal / sandbox / 完整 URL
  const gwRaw = String(process.env.ALIPAY_GATEWAY || 'formal').trim() || 'formal';
  const gateway = /^https?:\/\//i.test(gwRaw) ? gwRaw : (GATEWAY[gwRaw] || GATEWAY.formal);
  const mode = certMode ? 'cert' : (publicMode ? 'public' : null);

  // 就绪条件：总开关开 + 有 APPID + 有应用私钥 + （公钥模式或证书模式其一齐备）
  const missing = [];
  if (!AlipaySdk) missing.push('alipay-sdk未安装');
  if (!enabled) missing.push('ALIPAY_ENABLED非true');
  if (!appId) missing.push('ALIPAY_APP_ID');
  if (!privateKey) missing.push('ALIPAY_PRIVATE_KEY/路径');
  if (!publicMode && !certMode) missing.push('支付宝公钥或三证书');
  const configured = missing.length === 0;

  return {
    enabled, configured, mode, gateway,
    appId, pid, notifyUrl,
    privateKey, alipayPublicKey,
    appCertPath, alipayPublicCertPath, alipayRootCertPath,
    missing,
  };
}

let _client = null;
let _clientSig = null;

// 惰性构造 SDK 客户端；未配置或构造失败返回 null（不抛出到启动链路）
function getClient() {
  const opt = loadOptions();
  if (!opt.configured) return null;
  // 用密钥内容指纹（SHA256，非密钥本身）做缓存签名：同长度但内容不同的密钥也能触发客户端重建
  const fp = (s) => crypto.createHash('sha256').update(String(s || '')).digest('hex').slice(0, 16);
  const sig = JSON.stringify([
    opt.appId, opt.gateway, opt.mode,
    fp(opt.privateKey), fp(opt.alipayPublicKey),
    opt.appCertPath, opt.alipayPublicCertPath, opt.alipayRootCertPath,
  ]);
  if (_client && _clientSig === sig) return _client;
  try {
    const base = {
      appId: opt.appId,
      privateKey: opt.privateKey,
      signType: 'RSA2',
      keyType: 'PKCS8', // 支付宝密钥工具默认生成 PKCS8 应用私钥
      gateway: opt.gateway,
      timeout: 10000,
    };
    if (opt.mode === 'cert') {
      _client = new AlipaySdk(Object.assign(base, {
        appCertPath: path.resolve(opt.appCertPath),
        alipayPublicCertPath: path.resolve(opt.alipayPublicCertPath),
        alipayRootCertPath: path.resolve(opt.alipayRootCertPath),
      }));
    } else {
      _client = new AlipaySdk(Object.assign(base, { alipayPublicKey: opt.alipayPublicKey }));
    }
    _clientSig = sig;
    return _client;
  } catch (e) {
    logger.error('alipay_client_init_fail', { error: e.message });
    _client = null;
    _clientSig = null;
    return null;
  }
}

// 分（整数）→ 元字符串（保留两位小数，支付宝要求）
function fenToYuan(fen) {
  if (!Number.isInteger(fen) || fen <= 0) throw new Error('金额必须为正整数（分）');
  return (fen / 100).toFixed(2);
}

// alipay-sdk v4 默认把网关响应字段转成驼峰（tradeStatus/tradeNo/totalAmount/subCode…），
// 而支付宝异步通知表单是下划线（trade_status/trade_no/total_amount/sub_code…）。
// 为让上层（routes/pay.js）统一按下划线口径消费，这里给 SDK 响应“补齐”下划线别名（保留驼峰原值、不覆盖已有下划线键）。
// 不修这层会导致主动查单读到 q.trade_status===undefined，查单补入账永久失效。
function snakeAlias(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const out = Object.assign({}, obj);
  for (const k of Object.keys(obj)) {
    const snake = k.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase());
    if (snake !== k && out[snake] === undefined) out[snake] = obj[k];
  }
  return out;
}

const alipayService = {
  // 非敏感的配置状态（绝不回显任何密钥内容）
  status() {
    const opt = loadOptions();
    return {
      enabled: opt.enabled,
      configured: opt.configured,
      mode: opt.mode,
      gateway: opt.gateway,
      sandbox: opt.gateway === GATEWAY.sandbox,
      appIdPresent: Boolean(opt.appId),
      pidPresent: Boolean(opt.pid),
      notifyUrlPresent: Boolean(opt.notifyUrl),
      missing: opt.missing,
    };
  },

  isConfigured() {
    return loadOptions().configured && Boolean(getClient());
  },

  // 测试/回填后重置客户端缓存
  _reset() { _client = null; _clientSig = null; },

  /**
   * APP 支付：离线生成待签订单串（trade.app.pay），APP 端用该串唤起支付宝
   * @param {object} p { outTradeNo, amountFen, subject, body? }
   * @returns {string} orderString（key=urlencode(value)&...，含 biz_content 与 sign）
   */
  buildAppOrderString(p) {
    const { outTradeNo, amountFen, subject, body } = p;
    const client = getClient();
    const opt = loadOptions();
    if (!client) {
      const err = new Error('支付宝支付未配置：' + opt.missing.join(','));
      err.code = 'ALIPAY_NOT_CONFIGURED';
      throw err;
    }
    if (!outTradeNo) throw new Error('缺少业务订单号 outTradeNo');
    const totalAmount = fenToYuan(amountFen);
    const bizContent = {
      out_trade_no: outTradeNo,
      total_amount: totalAmount,
      subject: String(subject || '晶晶日上订单').slice(0, 128),
      product_code: 'QUICK_MSECURITY_PAY', // APP 支付固定产品码
    };
    if (opt.pid) bizContent.seller_id = opt.pid; // 可选：指定收款卖家
    if (body) Object.assign(bizContent, body);
    // sdkExecute 仅本地签名拼串，不发起网络请求
    // 把异步回调地址一并签入订单串（不依赖开放平台后台默认 notify_url 配置；未配则不带）
    const reqParams = { bizContent };
    if (opt.notifyUrl) reqParams.notifyUrl = opt.notifyUrl;
    return client.sdkExecute('alipay.trade.app.pay', reqParams);
  },

  /**
   * 主动查单 trade.query（走网关）。返回支付宝响应里的 trade 字段（含 trade_status/trade_no/total_amount）
   * @param {object} p 二选一：{ outTradeNo } 或 { tradeNo }
   */
  async queryTrade(p = {}) {
    const client = getClient();
    if (!client) {
      const err = new Error('支付宝支付未配置');
      err.code = 'ALIPAY_NOT_CONFIGURED';
      throw err;
    }
    const bizContent = {};
    if (p.outTradeNo) bizContent.out_trade_no = p.outTradeNo;
    if (p.tradeNo) bizContent.trade_no = p.tradeNo;
    if (!bizContent.out_trade_no && !bizContent.trade_no) throw new Error('查单需要 outTradeNo 或 tradeNo');
    let resp;
    try {
      resp = await client.exec('alipay.trade.query', { bizContent }, { validateSign: true });
    } catch (e) {
      // 网关错误/无签名错误响应/验签失败/超时：统一包装，调用方按 fail-closed 处理（绝不在异常时入账）
      const err = new Error('支付宝查单失败：' + (e && e.message || e));
      err.code = 'ALIPAY_GATEWAY_ERROR';
      throw err;
    }
    const raw = resp && resp.alipayTradeQueryResponse ? resp.alipayTradeQueryResponse : resp;
    return snakeAlias(raw); // 补齐下划线别名（trade_status/trade_no/total_amount/sub_code…）
  },

  /**
   * 退款 trade.refund（预留：后台/担保退款流程接入时调用）。走网关。
   * @param {object} p { outTradeNo, refundFen, reason?, tradeNo? }
   */
  async refund(p = {}) {
    const client = getClient();
    if (!client) {
      const err = new Error('支付宝支付未配置');
      err.code = 'ALIPAY_NOT_CONFIGURED';
      throw err;
    }
    const bizContent = {
      out_trade_no: p.outTradeNo,
      trade_no: p.tradeNo || undefined,
      refund_amount: fenToYuan(p.refundFen),
      refund_reason: p.reason ? String(p.reason).slice(0, 200) : '用户退款',
    };
    let resp;
    try {
      resp = await client.exec('alipay.trade.refund', { bizContent }, { validateSign: true });
    } catch (e) {
      const err = new Error('支付宝退款失败：' + (e && e.message || e));
      err.code = 'ALIPAY_GATEWAY_ERROR';
      throw err;
    }
    const raw = resp && resp.alipayTradeRefundResponse ? resp.alipayTradeRefundResponse : resp;
    return snakeAlias(raw);
  },

  // 异步通知 RSA2 验签；任何异常/未配置都返回 false（宁可不入账也不接受伪造回调）
  verifyNotify(postData) {
    try {
      if (!postData || typeof postData !== 'object') return false;
      const client = getClient();
      if (!client) return false;
      return client.checkNotifySign(postData, true) === true;
    } catch (e) {
      logger.error('alipay_notify_verify_ex', { error: e.message });
      return false;
    }
  },

  // 校验通知 app_id 是否为本应用
  notifyAppIdMatch(postData) {
    const opt = loadOptions();
    return Boolean(opt.appId) && String(postData && postData.app_id) === opt.appId;
  },

  isSuccessTradeStatus(tradeStatus) {
    return SUCCESS_TRADE_STATUS.includes(tradeStatus);
  },

  fenToYuan,
  GATEWAY,
};

module.exports = alipayService;
