// services/providers/moderation.js
// 内容机审 · 供应商调度层（V12.6）：默认火山引擎 volc（rms 内容风险识别，审批中→本地词库/人工兜底），
// COMPLIANCE_PROVIDER=aliyun 切回阿里云 V12.5（green20220302）。
// 对上层（routes/review.js、utils/contentModeration.js、services/volcVisual.js、providers/index.js）暴露方法形状不变：
//   moderateText() / moderateImage() / moderateVideo() / cloudConfigured()，统一决策 pass/reject/review。
const config = require('../../config');

const _aliyun = require('./aliyun/moderation');
const _volc = require('./volc/moderation');

function providerName() {
  return config.compliance && config.compliance.provider === 'aliyun' ? 'aliyun' : 'volc';
}
function active() {
  return providerName() === 'aliyun' ? _aliyun : _volc;
}

function moderateText(t) { return active().moderateText(t); }
function moderateImage(p) { return active().moderateImage(p); }
function moderateVideo(p) { return active().moderateVideo(p); }
function cloudConfigured() { return active().cloudConfigured(); }

module.exports = { moderateText, moderateImage, moderateVideo, cloudConfigured, providerName, active };
