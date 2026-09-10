// utils/contentModeration.js
// 内容机审对外薄封装：统一转调 services/providers/moderation（阿里云内容安全2.0 优先，本地词库/人工兜底）。
// 保留历史 { pass, score, reason } 返回形状，并补充 decision/needsHuman/provider 供新代码使用。
const prov = require('../services/providers/moderation');

function adapt(r) {
  const decision = r.decision; // pass | reject | review
  return {
    pass: decision === 'pass',
    score: decision === 'reject' ? 1 : 0,
    reason: (r.reasons || []).join(';'),
    decision,
    needsHuman: decision === 'review',
    provider: r.provider,
  };
}

async function moderateText(text) {
  return adapt(await prov.moderateText(text));
}

async function moderateImage(imageUrl) {
  return adapt(await prov.moderateImage({ url: imageUrl }));
}

async function moderateVideo(videoUrl) {
  return adapt(await prov.moderateVideo({ url: videoUrl }));
}

module.exports = { moderateText, moderateImage, moderateVideo };
