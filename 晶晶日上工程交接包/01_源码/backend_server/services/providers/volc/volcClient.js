// services/providers/volc/volcClient.js
// 火山引擎 OpenAPI 统一客户端（V12.6 合规套件）：懒加载单例 + 火山 V4 签名。
// 复用与「火山短信」同一套官方 SDK @volcengine/openapi 的通用 Service（内部完成 SigV4 签名，见 lib/base/sign.js），
// 不自己造签名、不硬编码密钥。凭证只从 config.volcCompliance（.env：VOLC_COMPLIANCE_ACCESS_KEY_ID/SECRET_ACCESS_KEY）读取。
// 原则与 aliyunClient 一致：缺 AK/SK 或 SDK 加载失败时返回 null / ready=false，由上层安全降级，绝不抛未捕获异常、绝不假装已接通。
const config = require('../../../config');
const logger = require('../../../utils/logger');

const C = () => config.volcCompliance || {};

let _sdk = null;
let _cache = new Map(); // 按 service|host|protocol|region 缓存单例

function loadSdk() {
  if (_sdk) return _sdk;
  _sdk = require('@volcengine/openapi'); // 与短信同一依赖，已在 package.json
  return _sdk;
}

// 凭证是否齐全（只返回布尔，绝不回传密钥内容）
function credentials() {
  const c = C();
  return {
    ok: c.enabled !== false && !!(c.accessKeyId && c.secretAccessKey),
    enabled: c.enabled !== false,
    hasAk: !!c.accessKeyId,
    hasSk: !!c.secretAccessKey,
  };
}

/** 合规 AK/SK 齐全（人脸 visual 只依赖 AK/SK；rms 另需 host+AppID，见 rmsReady） */
function ready() {
  return credentials().ok;
}

// 构造（并缓存）一个指向指定 host/service 的 V4 签名 Service 单例
function buildService({ host, service, protocol, region, defaultVersion }) {
  const key = `${service}|${host}|${protocol || 'https:'}|${region || ''}`;
  const hit = _cache.get(key);
  if (hit) return hit;
  const c = C();
  const Service = loadSdk().Service;
  const svc = new Service({
    host,
    serviceName: service,
    protocol: protocol || 'https:',
    region: region || c.region || 'cn-north-1',
    accessKeyId: c.accessKeyId,
    secretKey: c.secretAccessKey,
    defaultVersion,
  });
  _cache.set(key, svc);
  return svc;
}

// ---------------- 视觉智能 visual（Service=cv，人脸核身，已可真实联调） ----------------
function visualService() {
  if (!ready()) return null;
  const v = C().visual || {};
  if (!v.host || !v.service) return null;
  try {
    return buildService({ host: v.host, service: v.service, protocol: v.protocol, defaultVersion: v.version });
  } catch (e) {
    logger.error('volc_visual_client_init_fail', { error: e.message });
    return null;
  }
}

/**
 * 以 V4 签名 POST 一个 visual(cv) JSON OpenAPI；调用失败/未就绪返回 null（上层据此 fail-closed，不得放行）。
 * @returns {Promise<object|null>} 火山返回体（扁平 JSON，业务码在 code/status/algorithm_base_resp）
 */
async function postVisual(action, body = {}, version) {
  const svc = visualService();
  if (!svc) return null;
  const v = C().visual || {};
  const api = svc.createJSONAPI(action, { Version: version || v.version, method: 'POST' });
  return api(body);
}

// ---------------- 业务安全 rms（实名二要素 + 内容风险识别，人工审批中） ----------------
// rms 除 AK/SK 外还需官方下发的 host 与 AppID；任一缺失即未就绪（骨架阶段恒 false，禁止臆造）。
function rmsReady() {
  if (!ready()) return false;
  const r = (C().rms) || {};
  return !!(r.host && r.appId);
}

function rmsService() {
  if (!rmsReady()) return null;
  const r = C().rms;
  try {
    return buildService({ host: r.host, service: r.service, protocol: r.protocol, defaultVersion: r.version });
  } catch (e) {
    logger.error('volc_rms_client_init_fail', { error: e.message });
    return null;
  }
}

async function postRms(action, body = {}, version) {
  const svc = rmsService();
  if (!svc) return null;
  const r = C().rms || {};
  const api = svc.createJSONAPI(action, { Version: version || r.version, method: 'POST' });
  return api(body);
}

// 仅供自测：切换 config（如指向本地 mock HTTP）后清空单例缓存
function _reset() { _cache.clear(); }

module.exports = {
  ready, credentials,
  visualService, postVisual,
  rmsReady, rmsService, postRms,
  buildService, _reset,
};
