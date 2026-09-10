// services/providers/aliyun/faceVerify.js —— 阿里云 V12.5 备用实现（COMPLIANCE_PROVIDER=aliyun 时启用）
// 人脸活体/实人核身（阿里云实人认证 cloudauth20200618：initSmartVerify + describeSmartVerify）。
// 本期闭环：App 采集本人人脸照片上传得 URL → initSmartVerify(实名 idName/idNo + facePictureUrl)
//          → describeSmartVerify(certifyId) 判定“是该身份证本人且相似度达标”。无需原生动作活体 SDK。
// 扩展：传入 metaInfo 即为客户端动作活体/H5 核身（Flutter 原生 SDK 或 webview 接入后启用）。
// 缺 AK/SK 或人脸场景ID时 ready=false；生产环境缺核验能力必须拒绝签署（见 routes/compliance.js）。
const crypto = require('crypto');
const config = require('../../../config');
const client = require('../aliyunClient');
const logger = require('../../../utils/logger');

function ready() {
  return !!(client.ready() && config.aliyun.cloudauth.faceSceneId);
}

function genOuterOrderNo(prefix = 'FACE') {
  return `${prefix}${Date.now()}${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * 发起一次核身，返回 certifyId（一次性，5 分钟有效）。
 * @param {{name:string,idNo:string,facePictureUrl?:string,facePictureBase64?:string,metaInfo?:string,userId?:string,mobile?:string,ip?:string,callbackUrl?:string,returnUrl?:string}} p
 */
async function initVerify(p = {}) {
  if (!ready()) return { ready: false, certifyId: null };
  const ca = client.cloudauthClient();
  const outerOrderNo = genOuterOrderNo();
  try {
    const req = {
      sceneId: config.aliyun.cloudauth.faceSceneId,
      outerOrderNo,
      userId: p.userId ? String(p.userId) : outerOrderNo,
    };
    if (p.name) req.idName = String(p.name).trim();
    if (p.idNo) req.idNo = String(p.idNo).trim().toUpperCase();
    if (p.facePictureUrl) req.facePictureUrl = p.facePictureUrl;
    if (p.facePictureBase64) req.facePictureBase64 = p.facePictureBase64;
    if (p.metaInfo) req.metaInfo = p.metaInfo; // 客户端动作活体/H5 采集环境
    if (p.mobile) req.mobile = p.mobile;
    if (p.ip) req.ip = p.ip;
    if (p.callbackUrl) req.callbackUrl = p.callbackUrl;
    const resp = await ca.initSmartVerify(req);
    const body = resp && resp.body;
    const certifyId = body && body.resultObject && body.resultObject.certifyId;
    if (body && body.code === '200' && certifyId) {
      return { ready: true, certifyId, outerOrderNo, requestId: body.requestId };
    }
    logger.warn('face_init_not_ok', { code: body && body.code, message: body && body.message });
    return { ready: true, certifyId: null, outerOrderNo, error: body && body.message };
  } catch (e) {
    logger.error('face_init_error', { error: e.message, code: e.code });
    return { ready: true, certifyId: null, outerOrderNo, error: e.message };
  }
}

/**
 * 查询核身结论（服务端复验，合规关键：只信云端结果，不信客户端回传）。
 * @returns {Promise<{ready:boolean, passed:boolean|null, score:number|null, subCode?:string, materialInfo?:string, error?:string}>}
 */
async function describeVerify(certifyId) {
  if (!ready()) return { ready: false, passed: null, score: null };
  if (!certifyId) return { ready: true, passed: false, score: null, error: 'empty_certify_id' };
  const ca = client.cloudauthClient();
  try {
    const resp = await ca.describeSmartVerify({
      sceneId: config.aliyun.cloudauth.faceSceneId,
      certifyId: String(certifyId),
    });
    const body = resp && resp.body;
    const ro = body && body.resultObject;
    if (body && body.code === '200' && ro) {
      // 没有明确 passed 结论（空对象/缺字段）= 仍在处理中，判 null 而非“不通过”
      if (ro.passed === undefined || ro.passed === null || ro.passed === '') {
        return { ready: true, passed: null, score: null, processing: true, subCode: ro.subCode || '' };
      }
      const isPass = ro.passed === 'T' || ro.passed === 'Y' || ro.passed === true;
      const score = Number(ro.passedScore);
      const threshold = config.aliyun.cloudauth.facePassScore;
      // 云端判定通过且相似度达标；score 缺失时只信 passed 标志（不同场景可能不回分值）
      const scoreOk = Number.isFinite(score) ? score >= threshold : true;
      return {
        ready: true,
        passed: !!(isPass && scoreOk),
        score: Number.isFinite(score) ? score : null,
        threshold,
        subCode: ro.subCode || '',
        materialInfo: ro.materialInfo || '',
      };
    }
    logger.warn('face_describe_not_ok', { code: body && body.code, message: body && body.message });
    return { ready: true, passed: null, score: null, subCode: ro && ro.subCode, error: body && body.message };
  } catch (e) {
    logger.error('face_describe_error', { error: e.message, code: e.code });
    return { ready: true, passed: null, score: null, error: e.message };
  }
}

module.exports = { ready, initVerify, describeVerify, genOuterOrderNo };
