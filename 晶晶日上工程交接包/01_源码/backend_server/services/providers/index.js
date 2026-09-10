// services/providers/index.js - 上游供应商适配层统一入口与就绪度注册表
// 统一约定：
//  1) 所有密钥/凭证只从 .env 经 config 读取，绝不硬编码、不进前端/日志；
//  2) 缺凭证时显式"未就绪/降级"，绝不假装已接通（支付在生产直接禁用，存储/机审/短信走本地或人工兜底）；
//  3) 各 Provider 接口形状见同目录 README。业务侧优先从这里取，便于替换供应商。
const config = require('../../config');

const storage = require('../storage');
const moderation = require('./moderation');
const idVerify = require('./idVerify');
const faceVerify = require('./faceVerify');
const sms = require('../smsService');

// 各能力取数入口（保持现有实现，不改变行为）
function getStorage() { return storage.getStorage(); }
function getModeration() { return moderation; }
function getSms() { return sms; }
function getPaymentProvider(channel) {
  // 延迟 require，避免与 paymentService 形成循环
  const ps = require('../paymentService');
  // getProvider 未导出，这里通过 ps 方法间接使用；状态判断见 providerStatus
  return ps;
}

// 凭证/通道就绪度（只返回布尔与名称，绝不回传密钥），供 /health 与后台诊断
function providerStatus() {
  const smsStat = sms.channelStatus ? sms.channelStatus() : { ready: false };
  return {
    storage: {
      driver: config.upload.oss.enabled ? 'oss-or-local-fallback' : 'local',
      ossWanted: !!config.upload.oss.enabled,
      ossReady: config.upload.oss.enabled && storage.ossConfigured(),
    },
    moderation: {
      wanted: !!config.contentModeration.enabled,
      provider: moderation.providerName ? moderation.providerName() : (config.compliance && config.compliance.provider),
      cloudReady: moderation.cloudConfigured(),
      effective: moderation.cloudConfigured() ? (config.contentModeration.provider || moderation.providerName()) : 'local+human',
    },
    // V12.6 合规三件套就绪度（只回布尔/名称，不回密钥）：默认 volc，可切 aliyun
    compliance: {
      provider: config.compliance && config.compliance.provider,
      idVerifyReady: idVerify.ready(),
      faceVerifyReady: faceVerify.ready(),
      moderationCloudReady: moderation.cloudConfigured(),
    },
    sms: { wanted: !!config.sms.enabled, ready: !!smsStat.ready },
    ai: {
      arkReady: !!config.volc.arkApiKey,
      t2vModel: !!config.volc.t2vModel,
      t2iModel: !!config.volc.t2iModel,
      speechReady: !!(config.sms ? true : true) && !!(config.volc.speechKey),
    },
    payment: {
      wechatEcommerce: !!config.wxPay.ecommerce.enabled,
      alipayDirect: !!config.alipay.directPay.enabled,
      // 生产环境若两者都未开，paymentService 会直接拒绝 Mock（防二清/伪造回调）
      mockAllowed: config.env !== 'production',
    },
    alert: { webhookConfigured: !!config.alert.webhookUrl },
  };
}

module.exports = { getStorage, getModeration, getSms, getPaymentProvider, providerStatus };
