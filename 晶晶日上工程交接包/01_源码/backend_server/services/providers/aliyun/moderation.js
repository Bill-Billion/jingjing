// services/providers/aliyun/moderation.js —— 阿里云 V12.5 备用实现（COMPLIANCE_PROVIDER=aliyun 时启用）
// 内容安全决策适配层：
//   文本：阿里云内容安全2.0(green20220302.textModeration) 优先，云不可用/故障回退本地敏感词库；
//   图片：阿里云 imageModeration 同步判定，云不可用时转人工 review；
//   视频：阿里云 videoModeration 异步提交（返回 taskId，最终结果轮询/回调），同步阶段一律转人工兜底。
// 统一决策：pass(放行) / reject(拒绝) / review(转人工)。绝不因云故障直接放行图片/视频，也不误伤——统一转人工。
const fs = require('fs');
const path = require('path');
const config = require('../../../config');
const logger = require('../../../utils/logger');
const aliyun = require('../aliyunClient');

// ---------- 本地敏感词兜底（不依赖网络，云不可用时文本仍有基础防线） ----------
const SENSITIVE_WORDS = [
  // 涉政（内容安全最基础本地防线，云不可用时兜底）
  '法轮功', '台独', '港独', '疆独', '藏独',
  // 违法违规
  '色情', '赌博', '诈骗', '违禁', '枪支', '弹药', '毒品', '反动', '暴恐',
  '加微信', '加vx', '私聊交易', '代开发票', '刷单', '套现', '裸贷',
];
try {
  const custom = path.join(__dirname, '../../../data/sensitive-words.json');
  if (fs.existsSync(custom)) {
    const arr = JSON.parse(fs.readFileSync(custom, 'utf8'));
    if (Array.isArray(arr)) SENSITIVE_WORDS.push(...arr.filter(Boolean));
  }
} catch (_) { /* 词库文件缺失不影响启动 */ }

const local = {
  moderateText(text = '') {
    const hit = SENSITIVE_WORDS.filter((w) => text.includes(w));
    if (hit.length) {
      return { decision: 'reject', provider: 'local', reasons: hit.map((w) => `本地敏感词:${w}`) };
    }
    return { decision: 'pass', provider: 'local', reasons: [] };
  },
};

// ---------- 阿里云内容安全2.0 ----------
// 云机审是否可用：以是否配置阿里云 AK/SDK 为准（配了即用云，没配自动降级本地/人工）。
// 可用 MODERATION_ENABLED=false 显式强制关闭云机审。
function greenReady() {
  if (config.contentModeration.enabled === false && process.env.MODERATION_ENABLED === 'false') return false;
  return aliyun.ready();
}

// 内容安全2.0 结果解析：data.labels 命中风险标签 / data.reason 非空 → reject；干净 → pass；无法判定 → null
function parseSyncResult(body) {
  if (!body || body.code !== 200 || !body.data) return null; // 调用未成功
  const d = body.data;
  const labels = String(d.labels || '').trim();
  const reason = String(d.reason || '').trim();
  const safeLabels = new Set(['', 'nonLabel', 'none', 'normal', 'pass']);
  const hasRisk = (!safeLabels.has(labels)) || reason.length > 0;
  if (!hasRisk) return { decision: 'pass', provider: 'aliyun', reasons: [], labels, requestId: body.requestId };
  return {
    decision: 'reject',
    provider: 'aliyun',
    reasons: [labels && `云机审标签:${labels}`, reason && `云机审原因:${reason}`].filter(Boolean),
    labels,
    requestId: body.requestId,
  };
}

async function cloudText(text) {
  if (!greenReady()) return null;
  try {
    const g = aliyun.greenClient();
    const resp = await g.textModeration({
      service: config.aliyun.green.textService,
      serviceParameters: JSON.stringify({ content: String(text || '').slice(0, 10000) }),
    });
    return parseSyncResult(resp && resp.body);
  } catch (e) {
    logger.error('cloud_text_moderation_error', { error: e.message, code: e.code });
    return null; // 云故障 → 调用方回退本地
  }
}

async function cloudImage({ url, base64 } = {}) {
  if (!greenReady()) return null;
  try {
    const g = aliyun.greenClient();
    const params = url ? { imageUrl: url } : { imageBase64: base64 };
    const resp = await g.imageModeration({
      service: config.aliyun.green.imageService,
      serviceParameters: JSON.stringify(params),
    });
    return parseSyncResult(resp && resp.body);
  } catch (e) {
    logger.error('cloud_image_moderation_error', { error: e.message, code: e.code });
    return null;
  }
}

// 视频异步：提交即返回 taskId，同步阶段无法出最终结论 → review（人工/轮询兜底）
async function cloudVideoSubmit({ url } = {}) {
  if (!greenReady() || !url) return null;
  try {
    const g = aliyun.greenClient();
    const resp = await g.videoModeration({
      service: config.aliyun.green.videoService,
      serviceParameters: JSON.stringify({ videoUrl: url }),
    });
    const body = resp && resp.body;
    const taskId = body && body.data && body.data.taskId;
    if (body && body.code === 200 && taskId) {
      return { decision: 'review', provider: 'aliyun', reasons: [`视频云机审异步任务:${taskId}`], taskId, requestId: body.requestId };
    }
    logger.warn('cloud_video_submit_not_ok', { code: body && body.code, message: body && body.message });
    return null;
  } catch (e) {
    logger.error('cloud_video_moderation_error', { error: e.message, code: e.code });
    return null;
  }
}

// ---------- 对外统一入口 ----------
async function moderateText(text) {
  const cloud = await cloudText(text);
  if (cloud) {
    if (cloud.decision === 'reject') return cloud;
    // 云判 pass 再过一遍本地词库做双保险
    const lb = local.moderateText(text);
    return lb.decision === 'reject'
      ? { decision: 'reject', provider: 'aliyun+local', reasons: lb.reasons }
      : cloud;
  }
  return local.moderateText(text); // 云不可用：本地兜底（现状不变）
}

async function moderateImage(payload = {}) {
  const cloud = await cloudImage(payload);
  if (cloud) return cloud;
  // 本地无法做视觉识别 → 转人工（现状不变，绝不直接放行）
  return { decision: 'review', provider: 'human', needsHuman: true, reasons: ['图片需人工审核（云机审不可用）'] };
}

async function moderateVideo(payload = {}) {
  const submitted = await cloudVideoSubmit(payload);
  if (submitted) return submitted;
  return { decision: 'review', provider: 'human', needsHuman: true, reasons: ['视频需人工审核（云机审不可用或未提供URL）'] };
}

function cloudConfigured() {
  return greenReady();
}

module.exports = { moderateText, moderateImage, moderateVideo, cloudConfigured };
