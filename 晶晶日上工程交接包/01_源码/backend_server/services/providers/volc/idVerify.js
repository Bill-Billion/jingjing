// services/providers/volc/idVerify.js
// 火山引擎「业务安全 rms · 身份要素验证（实名二要素）」——【骨架 / 待审批，当前 ready 恒 false】。
//
// 状态（2026-09-01）：rms 身份要素验证仍在火山人工审批（预计 1-2 工作日），官方请求/响应字段以「组织者另派的官方文档调研结论」为准。
//   - 在拿到调研结论前，禁止臆造 Action 名、请求字段、host/Version、一致/不一致判定字段；
//   - 即使合规 AK/SK 已配置，也必须同时具备 rms.host + rms.appId + idVerifyBizType 才允许 ready=true；
//   - ready=false 时 verifyElement 一律返回 {ready:false,passed:null}，由 routes/identity.js 走安全降级，绝不误判“一致”。
//
// TODO（收到官方文档调研结论后补实，仍保持“缺 AppID/bizType 即降级”，且在审批通过前不做真实联调）：
//   1) 在 config.volcCompliance.rms 确认 host/Version/appId/idVerifyBizType 的真实取值与环境变量名；
//   2) 用 client.postRms('<调研确认的Action>', { AppId, BizId/bizType, 姓名, 证件号, ... }) 发请求；
//   3) 按调研结论解析“一致 / 不一致 / 处理中”：一致 passed=true、不一致 passed=false、调用失败/无结论 passed=null（不臆断）；
//   4) 补 scripts/volc_compliance_selftest.js 中 rms 二要素的 mock HTTP 用例后再放开 ready。
const crypto = require('crypto');
const config = require('../../../config');
const client = require('./volcClient');
const logger = require('../../../utils/logger');

function rmsCfg() { return (config.volcCompliance && config.volcCompliance.rms) || {}; }

// rms 二要素就绪条件：合规 AK/SK + rms host + AppID + 二要素 bizType 全部到位（当前审批中，恒 false）
function ready() {
  const r = rmsCfg();
  return client.rmsReady() === true && !!(r.idVerifyBizType);
}

function genOuterOrderNo(prefix = 'VID') {
  return `${prefix}${Date.now()}${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * 二要素三态判定策略（与火山线上字段无关、不臆造任何请求/响应字段名）：
 * 待官方调研补实后，由“线上响应字段提取层”把结果归一为 {concluded:boolean, matched:boolean} 再喂入本函数。
 *   concluded=true & matched=true  → true  一致
 *   concluded=true & matched=false → false 不一致
 *   其余（未得出结论/坏响应/缺字段） → null  无结论（fail-closed，绝不臆断为一致）
 */
function decideElementVerdict({ concluded, matched } = {}) {
  if (concluded === true) {
    if (matched === true) return true;
    if (matched === false) return false;
  }
  return null;
}

/**
 * 身份证二要素核验（姓名 + 身份证号是否一致）。
 * 当前为待审批骨架：永远不发起真实请求、永远不给出 passed=true/false，只回 passed=null（无结论），交路由安全降级。
 * @returns {Promise<{ready:boolean, passed:boolean|null, subCode?:string, error?:string}>}
 */
async function verifyElement(/* { name, idNo, mobile } = {} */) {
  if (!ready()) {
    // 未就绪：显式无结论。调用方（identity 路由）据此转人工/现状降级，绝不自动当作核验通过。
    return { ready: false, passed: null, error: 'volc_rms_id_verify_not_ready' };
  }
  // —— 以下仅在 rms 审批通过、官方字段调研补实后可达（当前不可达）——
  // TODO(调研结论): const r = rmsCfg();
  //   const resp = await client.postRms('<Action 待调研>', { AppId:r.appId, BizType:r.idVerifyBizType, ... });
  //   按官方字段映射 passed(true 一致 / false 不一致 / null 无结论)，坏响应 fail-closed 为 null。
  logger.warn('volc_rms_id_verify_called_but_fields_unresearched');
  return { ready: true, passed: null, error: 'volc_rms_fields_pending_official_research' };
}

module.exports = { ready, verifyElement, genOuterOrderNo, decideElementVerdict };
