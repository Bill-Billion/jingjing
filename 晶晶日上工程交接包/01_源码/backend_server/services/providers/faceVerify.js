// services/providers/faceVerify.js
// 人脸活体/实人核身 · 供应商调度层（V12.6）：默认火山引擎 volc（visual CertSrcFaceComp 有源比对），
// COMPLIANCE_PROVIDER=aliyun 切回阿里云 V12.5（initSmartVerify/describeSmartVerify）。
// 对路由层（routes/faceverify.js、routes/compliance.js）暴露方法形状与 V12.5 完全一致：
//   ready() / initVerify() / describeVerify() / genOuterOrderNo()，路由零改动。
const config = require('../../config');

const _aliyun = require('./aliyun/faceVerify');
const _volc = require('./volc/faceVerify');

function providerName() {
  return config.compliance && config.compliance.provider === 'aliyun' ? 'aliyun' : 'volc';
}
function active() {
  return providerName() === 'aliyun' ? _aliyun : _volc;
}

function ready() { return active().ready(); }
function initVerify(p) { return active().initVerify(p); }
function describeVerify(id) { return active().describeVerify(id); }
function genOuterOrderNo(prefix) { return active().genOuterOrderNo(prefix); }

module.exports = { ready, initVerify, describeVerify, genOuterOrderNo, providerName, active };
