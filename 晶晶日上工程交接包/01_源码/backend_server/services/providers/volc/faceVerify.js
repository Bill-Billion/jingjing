// services/providers/volc/faceVerify.js
// 火山引擎视觉智能 · 人脸有源核身（visual / Service=cv / Version=2022-08-31 / Action=CertSrcFaceComp）。
// 已核实事实（官方文档 /docs/86081/1660382、/docs/86081/1660399）：
//   请求体 req_key=cert_src_face_comp、idcard_name、idcard_no、image（base64，不带 data:...;base64, 前缀）；
//   成功 code/status=10000，data.result(bool)、data.source_comp_details.score 与 thresholds（1e-4 通过线）、data.byted_token；
//   子错误 algorithm_base_resp.status_code：210207 姓名身份证不匹配、210311 人脸不匹配；计费 req_measure_info.value。
// 适配既有两步契约（与阿里云一致，路由零改动）：
//   initVerify：服务端此刻即用姓名+身份证+本人照片做一次权威有源比对，生成一次性核身流水号并缓存结论（TTL 5 分钟）；
//   describeVerify：按流水号取回服务端已得到的云端结论（/sign 服务端复验只信这里，不信客户端回传）。
// 缺 AK/SK 时 ready=false；任何坏响应/网络异常一律 passed=null（fail-closed：不判通过、不伪造）。
const crypto = require('crypto');
const config = require('../../../config');
const client = require('./volcClient');
const logger = require('../../../utils/logger');

// 子错误码：姓名/身份证不匹配、人脸不匹配
const SUB_NAME_ID_MISMATCH = 210207;
const SUB_FACE_MISMATCH = 210311;
const TOP_OK = 10000;

// 核身结论服务端缓存：流水号 -> 结论（一次性，TTL 到期视为“无有效结论/处理中”）
const _verdicts = new Map();

function visualCfg() { return (config.volcCompliance && config.volcCompliance.visual) || {}; }

// 人脸 visual 只依赖合规 AK/SK（无需 rms 的 AppID/bizType）
function ready() {
  return client.ready() === true && !!(visualCfg().host && visualCfg().action);
}

function genOuterOrderNo(prefix = 'VFC') {
  return `${prefix}${Date.now()}${crypto.randomBytes(4).toString('hex')}`;
}

// 去掉可能误带的 data URL mime 前缀，只留纯 base64
function stripMimePrefix(s) {
  return String(s || '').replace(/^data:[^;]+;base64,/, '');
}

async function urlToBase64(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch_face_image_fail_http_${r.status}`);
  return Buffer.from(await r.arrayBuffer()).toString('base64');
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * 解析 CertSrcFaceComp 返回体为统一核身结论。
 * @returns {{passed:boolean|null, score:number|null, threshold:number, subCode:(number|string), bytedToken:string, bad?:boolean, error?:string}}
 *  passed: true 通过 / false 明确不通过（含 210207/210311） / null 无有效结论（处理中或坏响应，绝不误判通过）
 */
function parseFaceResp(resp) {
  const threshold = num(visualCfg().facePassScore) ?? 0.0001;
  const base = { passed: null, score: null, threshold, subCode: '', bytedToken: '' };
  if (!resp || typeof resp !== 'object') return { ...base, bad: true, error: 'empty_response' };

  const topCode = num(resp.code !== undefined ? resp.code : resp.status);
  const algo = resp.algorithm_base_resp
    || (resp.data && resp.data.algorithm_base_resp)
    || {};
  const subCode = algo.status_code !== undefined ? num(algo.status_code) : '';
  const data = resp.data || {};
  const details = data.source_comp_details || {};
  const score = num(details.score);
  const bytedToken = data.byted_token || '';

  // 1) 权威业务终态子码优先：真实 API 在 210207/210311 时顶层 code 可能并非 10000，子码才是“明确不通过”的结论
  if (subCode === SUB_NAME_ID_MISMATCH || subCode === SUB_FACE_MISMATCH) {
    return {
      ...base,
      passed: false,
      score,
      subCode,
      bytedToken,
      error: algo.message || (subCode === SUB_NAME_ID_MISMATCH ? '姓名身份证不匹配' : '人脸不匹配'),
    };
  }

  // 2) 顶层未成功（签名/参数/配额/服务异常）且无明确人脸结论：判 null 交上层重试/降级，绝不伪造通过
  if (topCode !== null && topCode !== TOP_OK) {
    return {
      ...base,
      score,
      subCode,
      bad: true,
      passed: data.result === false ? false : null,
      error: resp.message || `top_code_${topCode}`,
    };
  }

  // 3) 其它非 0 未知子码：以 data.result 为准，缺结论则 null（不臆断）
  if (subCode !== '' && subCode !== 0 && subCode !== TOP_OK) {
    if (data.result === false) return { ...base, passed: false, score, subCode, bytedToken, error: algo.message || `algorithm_sub_${subCode}` };
    return { ...base, score, subCode, bytedToken, processing: true };
  }

  if (data.result === true) {
    // result=true 且相似度达通过线（缺分值时只信 result 标志）
    const scoreOk = score !== null ? score >= threshold : true;
    return { passed: scoreOk, score, threshold, subCode: '', bytedToken, error: scoreOk ? '' : 'score_below_threshold' };
  }
  if (data.result === false) {
    return { passed: false, score, threshold, subCode: subCode !== '' ? subCode : SUB_FACE_MISMATCH, bytedToken, error: 'result_false' };
  }
  // 无 result 且无子错误：仍在处理/无结论 → null（不是不通过）
  return { ...base, score, subCode, bytedToken, processing: true };
}

function cacheVerdict(token, verdict) {
  const ttl = visualCfg().verdictTtlMs || 300000;
  _verdicts.set(token, { ...verdict, expireAt: Date.now() + ttl });
}

function readCached(token) {
  const v = _verdicts.get(token);
  if (!v) return null;
  if (v.expireAt && v.expireAt < Date.now()) { _verdicts.delete(token); return null; }
  return v;
}

/**
 * 发起一次有源人脸核身（同步比对），返回一次性核身流水号（作为既有契约里的 certifyId / livenessTxnId）。
 * @param {{name:string,idNo:string,facePictureUrl?:string,facePictureBase64?:string,metaInfo?:string,userId?:string}} p
 */
async function initVerify(p = {}) {
  if (!ready()) return { ready: false, certifyId: null };
  const outerOrderNo = genOuterOrderNo();
  try {
    let image = '';
    if (p.facePictureBase64) {
      image = stripMimePrefix(p.facePictureBase64);
    } else if (p.facePictureUrl) {
      image = await urlToBase64(p.facePictureUrl);
    } else if (p.metaInfo) {
      // H5/动作活体流程（cert_h5_config_init→cert_h5_token→h5-v2.kych5.com）为后续扩展，本期 API 有源比对不支持仅凭 metaInfo 发起
      return { ready: true, certifyId: null, outerOrderNo, error: 'h5_metainfo_flow_not_implemented' };
    } else {
      return { ready: true, certifyId: null, outerOrderNo, error: 'missing_face_image' };
    }
    if (!image) return { ready: true, certifyId: null, outerOrderNo, error: 'empty_face_image' };

    const body = {
      req_key: visualCfg().reqKey || 'cert_src_face_comp',
      idcard_name: String(p.name || '').trim(),
      idcard_no: String(p.idNo || '').trim().toUpperCase(),
      image,
    };
    const resp = await client.postVisual(visualCfg().action || 'CertSrcFaceComp', body);
    const verdict = parseFaceResp(resp);

    // 无论通过与否都生成流水号并缓存服务端结论，供 result 轮询与 /sign 复验；坏响应也缓存为 null（不伪造）
    const token = outerOrderNo;
    cacheVerdict(token, verdict);
    logger.info('volc_face_init', {
      outerOrderNo, passed: verdict.passed, subCode: verdict.subCode,
      hasScore: verdict.score !== null, bad: !!verdict.bad,
    });
    return {
      ready: true,
      certifyId: token,
      outerOrderNo,
      bytedToken: verdict.bytedToken || '',
      passed: verdict.passed,
      subCode: verdict.subCode,
      error: verdict.error || '',
    };
  } catch (e) {
    logger.error('volc_face_init_error', { error: e.message, code: e.code });
    return { ready: true, certifyId: null, outerOrderNo, error: e.message };
  }
}

/**
 * 服务端复验：取回 initVerify 时由火山云端给出的结论。
 * 无缓存/过期 → passed=null（处理中，/sign 会 409，绝不放行）。
 */
async function describeVerify(certifyId) {
  if (!ready()) return { ready: false, passed: null, score: null };
  if (!certifyId) return { ready: true, passed: false, score: null, error: 'empty_certify_id' };
  const v = readCached(String(certifyId));
  if (!v) return { ready: true, passed: null, score: null, processing: true, subCode: '' };
  return {
    ready: true,
    passed: v.passed,
    score: v.score,
    threshold: v.threshold,
    subCode: v.subCode || '',
    bytedToken: v.bytedToken || '',
    processing: v.passed === null,
    error: v.error || '',
  };
}

// 仅供自测：清空结论缓存 / 注入一条结论（mock HTTP 路径仍走真实 init，不强制用注入）
function _resetCache() { _verdicts.clear(); }
function _seedVerdict(token, verdict) { cacheVerdict(token, verdict); }

module.exports = {
  ready, initVerify, describeVerify, genOuterOrderNo,
  parseFaceResp, stripMimePrefix, _resetCache, _seedVerdict,
  SUB_NAME_ID_MISMATCH, SUB_FACE_MISMATCH,
};
