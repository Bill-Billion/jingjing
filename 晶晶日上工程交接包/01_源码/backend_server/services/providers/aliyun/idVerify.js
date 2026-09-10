// services/providers/aliyun/idVerify.js  —— 阿里云 V12.5 备用实现（COMPLIANCE_PROVIDER=aliyun 时启用）
// 身份证实名要素核验（阿里云实人认证 cloudauth20200618.elementSmartVerify）。
// 二要素：姓名 + 身份证号是否一致；可选传入手机号做三要素。
// 缺 AK/SK 或要素场景ID时 ready=false，由路由安全降级（绝不假装核验通过）。
const crypto = require('crypto');
const config = require('../../../config');
const client = require('../aliyunClient');
const logger = require('../../../utils/logger');

function ready() {
  return !!(client.ready() && config.aliyun.cloudauth.elementSceneId);
}

function genOuterOrderNo(prefix = 'ELEM') {
  return `${prefix}${Date.now()}${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * 身份证要素核验
 * @param {{name:string, idNo:string, mobile?:string}} p
 * @returns {Promise<{ready:boolean, passed:boolean|null, subCode?:string, outerOrderNo?:string, requestId?:string, error?:string}>}
 */
async function verifyElement({ name, idNo, mobile } = {}) {
  if (!ready()) return { ready: false, passed: null };
  const ca = client.cloudauthClient();
  const outerOrderNo = genOuterOrderNo();
  try {
    const req = {
      sceneId: config.aliyun.cloudauth.elementSceneId,
      outerOrderNo,
      certType: 'IDENTITY_CARD',
      certName: String(name || '').trim(),
      certNo: String(idNo || '').trim().toUpperCase(),
    };
    if (mobile) req.mobile = String(mobile).trim();
    const resp = await ca.elementSmartVerify(req);
    const body = resp && resp.body;
    const ro = body && body.resultObject;
    const code = body && body.code;
    if (code !== '200' || !ro) {
      // 调用未成功（如场景未开通、参数错误、服务异常），不判“不一致”，交调用方降级/重试
      logger.warn('id_verify_cloud_not_pass_code', { code, message: body && body.message, subCode: ro && ro.subCode });
      return { ready: true, passed: null, subCode: ro && ro.subCode, outerOrderNo, requestId: body && body.requestId, error: body && body.message };
    }
    const passed = ro.passed === 'T' || ro.passed === 'Y' || ro.passed === true;
    return {
      ready: true,
      passed,
      subCode: ro.subCode || '',
      outerOrderNo,
      requestId: body.requestId,
    };
  } catch (e) {
    logger.error('id_verify_cloud_error', { error: e.message, code: e.code });
    return { ready: true, passed: null, outerOrderNo, error: e.message };
  }
}

module.exports = { ready, verifyElement, genOuterOrderNo };
