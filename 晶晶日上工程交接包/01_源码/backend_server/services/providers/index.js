// services/providers/index.js - 上游供应商适配层统一入口与就绪度注册表
// 统一约定：
//  1) 所有密钥/凭证只从 .env 经 config 读取，绝不硬编码、不进前端/日志；
//  2) 此处仅是旧模块入口；新服务统一检查见 src/modules/providers。旧路由尚未全部迁移；
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
  // Configuration is not proof that a provider works. Legacy routes still require migration.
  const state = { current_status:'NOT_IMPLEMENTED', verified:false };
  return {
    storage:{...state, driver:'legacy-disabled-for-private-assets', ossWanted:!!config.upload.oss.enabled, configured:storage.ossConfigured(), ossReady:false},
    moderation:{...state, configured:moderation.cloudConfigured(), cloudReady:false},
    compliance:{...state, idVerifyConfigured:idVerify.ready(), faceVerifyConfigured:faceVerify.ready(), idVerifyReady:false, faceVerifyReady:false, moderationCloudReady:false},
    sms:{...state, configured:!!sms.channelStatus?.().ready, ready:false},
    ai:{...state, configured:!!config.volc.arkApiKey, arkReady:false, speechReady:false},
    payment:{...state, wechatEcommerceConfigured:!!config.wxPay.ecommerce.enabled, alipayDirectConfigured:!!config.alipay.directPay.enabled},
    alert:{webhookConfigured:!!config.alert.webhookUrl},
  };
}

module.exports = { getStorage, getModeration, getSms, getPaymentProvider, providerStatus };
