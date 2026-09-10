// services/providers/localWords.js
// 本地敏感词兜底（不依赖网络）：云机审不可用 / rms 审批未通过时，文本仍有最基础防线。
// 与 aliyun/moderation.js 内联词库保持同一基线；图片/视频本地无法识别，一律由调用方转人工，绝不直接放行。
const fs = require('fs');
const path = require('path');

const SENSITIVE_WORDS = [
  // 涉政（内容安全最基础本地防线，云不可用时兜底）
  '法轮功', '台独', '港独', '疆独', '藏独',
  // 违法违规
  '色情', '赌博', '诈骗', '违禁', '枪支', '弹药', '毒品', '反动', '暴恐',
  '加微信', '加vx', '私聊交易', '代开发票', '刷单', '套现', '裸贷',
];
try {
  const custom = path.join(__dirname, '../../data/sensitive-words.json');
  if (fs.existsSync(custom)) {
    const arr = JSON.parse(fs.readFileSync(custom, 'utf8'));
    if (Array.isArray(arr)) SENSITIVE_WORDS.push(...arr.filter(Boolean));
  }
} catch (_) { /* 词库文件缺失不影响启动 */ }

// 文本本地兜底：命中即 reject，未命中 pass；返回形状与云机审统一（decision/provider/reasons）
function moderateText(text = '', provider = 'local') {
  const hit = SENSITIVE_WORDS.filter((w) => String(text).includes(w));
  if (hit.length) {
    return { decision: 'reject', provider, reasons: hit.map((w) => `本地敏感词:${w}`) };
  }
  return { decision: 'pass', provider, reasons: [] };
}

module.exports = { SENSITIVE_WORDS, moderateText };
