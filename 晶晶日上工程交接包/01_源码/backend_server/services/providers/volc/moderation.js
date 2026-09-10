// services/providers/volc/moderation.js
// 火山引擎「业务安全 rms · 内容风险识别（文本/图片/视频机审）」——【云端能力待审批，当前 rms ready=false】。
//
// 状态（2026-09-01）：rms 内容风险识别仍在火山人工审批（1-2 工作日），官方请求/响应字段以官方文档调研结论为准，禁止臆造。
// 审批通过前的安全行为（与阿里云缺凭证时完全对齐，保证业务不裸奔、也不误伤）：
//   - 文本：回退本地敏感词库（localWords）做基础防线；
//   - 图片：本地无法视觉识别 → 一律 review 转人工，绝不直接放行；
//   - 视频：rms 异步能力未通 → 一律 review 转人工。
//
// TODO（收到官方调研结论后补实，仍保持“缺 AppID/bizType 即降级”，审批通过前不做真实联调）：
//   1) config.volcCompliance.rms 补 textBizType/imageBizType/videoBizType 与真实 Action/Version；
//   2) cloudText：client.postRms('<文本Action>', {AppId,BizType:textBizType,Content...})，按官方风险标签/分数字段解析 reject/pass；
//   3) cloudImage 同步、cloudVideo 提交拿 taskId 后轮询/回调（异步），坏响应 fail-closed：图片/视频转人工，不放行；
//   4) 云判 pass 的文本仍过一遍本地词库双保险（与 aliyun/moderation 同策略）。
const config = require('../../../config');
const client = require('./volcClient');
const logger = require('../../../utils/logger');
const localWords = require('../localWords');

function rmsCfg() { return (config.volcCompliance && config.volcCompliance.rms) || {}; }

// 云端 rms 机审是否可用：AK/SK + rms host + AppID + 对应 bizType 齐全才算（当前审批中 → false）
function rmsTextReady() {
  const r = rmsCfg();
  return client.rmsReady() === true && !!r.textBizType;
}
function rmsImageReady() {
  const r = rmsCfg();
  return client.rmsReady() === true && !!r.imageBizType;
}
function rmsVideoReady() {
  const r = rmsCfg();
  return client.rmsReady() === true && !!r.videoBizType;
}
// 任一云端内容能力就绪即视为已接云（供 providerStatus / 健康诊断）
function cloudConfigured() {
  return rmsTextReady() || rmsImageReady() || rmsVideoReady();
}

// —— 云端 rms（骨架；审批+调研补实前不可达，返回 null 让上层走兜底）——
async function cloudText(/* text */) {
  if (!rmsTextReady()) return null;
  // TODO(调研结论): const resp = await client.postRms('<文本风险识别Action>', { AppId:rmsCfg().appId, BizType:rmsCfg().textBizType, Content:String(text).slice(0,10000) });
  // 按官方字段解析为 {decision:'reject'|'pass', provider:'volc', reasons:[...], labels}；坏响应返回 null。
  logger.warn('volc_rms_text_fields_unresearched');
  return null;
}
async function cloudImage(/* payload */) {
  if (!rmsImageReady()) return null;
  // TODO(调研结论): 图片同步机审，url/base64 入参、风险标签出参按官方文档补实；坏响应 null。
  return null;
}
async function cloudVideoSubmit(/* payload */) {
  if (!rmsVideoReady()) return null;
  // TODO(调研结论): 视频异步提交拿 taskId，最终结果轮询/回调；补实前返回 null。
  return null;
}

// —— 对外统一入口（形状与 aliyun/moderation 完全一致：decision/provider/reasons，needsHuman）——
async function moderateText(text) {
  const cloud = await cloudText(text);
  if (cloud) {
    if (cloud.decision === 'reject') return cloud;
    // 云判 pass 再过本地词库双保险
    const lb = localWords.moderateText(text, 'volc+local');
    return lb.decision === 'reject' ? lb : cloud;
  }
  // rms 未接通：本地词库兜底（现状不裸奔）
  return localWords.moderateText(text, 'local');
}

async function moderateImage(payload = {}) {
  const cloud = await cloudImage(payload);
  if (cloud) return cloud;
  // 本地无法做视觉识别 → 转人工（绝不直接放行）
  return { decision: 'review', provider: 'human', needsHuman: true, reasons: ['图片需人工审核（火山rms机审未就绪）'] };
}

async function moderateVideo(payload = {}) {
  const submitted = await cloudVideoSubmit(payload);
  if (submitted) return submitted;
  return { decision: 'review', provider: 'human', needsHuman: true, reasons: ['视频需人工审核（火山rms异步机审未就绪或未提供URL）'] };
}

module.exports = {
  moderateText, moderateImage, moderateVideo, cloudConfigured,
  rmsTextReady, rmsImageReady, rmsVideoReady,
};
