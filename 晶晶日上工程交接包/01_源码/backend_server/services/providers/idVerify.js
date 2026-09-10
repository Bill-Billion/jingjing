// services/providers/idVerify.js
// 实名二要素核验 · 供应商调度层（V12.6）：默认火山引擎 volc，COMPLIANCE_PROVIDER=aliyun 切回阿里云 V12.5。
// 对路由层（routes/identity.js）暴露的方法形状与 V12.5 完全一致：ready() / verifyElement() / genOuterOrderNo()，路由零改动。
// 具体实现：
//   volc → ./volc/idVerify（rms 审批中，当前 ready=false 安全降级骨架）
//   aliyun → ./aliyun/idVerify（V12.5 完整实现，保留备用，不删除）
const config = require('../../config');

const _aliyun = require('./aliyun/idVerify');
const _volc = require('./volc/idVerify');

function providerName() {
  return config.compliance && config.compliance.provider === 'aliyun' ? 'aliyun' : 'volc';
}
function active() {
  return providerName() === 'aliyun' ? _aliyun : _volc;
}

function ready() { return active().ready(); }
function verifyElement(p) { return active().verifyElement(p); }
function genOuterOrderNo(prefix) { return active().genOuterOrderNo(prefix); }

module.exports = { ready, verifyElement, genOuterOrderNo, providerName, active };
