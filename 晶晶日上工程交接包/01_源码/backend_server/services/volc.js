// services/volc.js - 火山引擎统一聚合入口（V12）
// 职责：对外只暴露这一层。LLM（方舟对话/文案）在本文件实现并纳入治理；
//       语音 TTS/声音复刻复用 ./volcSpeech；视觉文生图/视频复用 ./volcVisual；短信见 ./smsService。
// 所有密钥来自 config（.env），本层及子层只被服务端调用，绝不暴露给 APP/前端。
const config = require('../config');
const logger = require('../utils/logger');
const quota = require('./aiQuota');
const speech = require('./volcSpeech');
const visual = require('./volcVisual');

const V = config.volc;
const U = config.aiQuota.unitCostFen;

// ---------------- 方舟：豆包语言大模型（通用对话 / 文案），纳入并发·重试·成本治理 ----------------
async function chatCompletion({ system, user, temperature = 0.8, maxTokens = 600, userId = null } = {}) {
  if (!V.arkApiKey) throw new Error('未配置 ARK_API_KEY');
  if (!user || !user.trim()) throw new Error('LLM 输入为空');

  // 粗估输入 token（中文约 1 字 1 token，留余量），用于调用前预算闸门
  const estIn = Math.ceil(((system || '').length + user.length) / 1.5);
  const estCost = Math.ceil((estIn / 1000) * U.llmPer1kIn + (maxTokens / 1000) * U.llmPer1kOut);
  quota.assertBudget(estCost);

  const release = await quota.acquire('llm');
  const t0 = Date.now();
  try {
    const resp = await quota.withRetry(() => fetch(`${V.arkBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${V.arkApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: V.llmModel,
        temperature,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    }));
    const txt = await resp.text();
    let j; try { j = JSON.parse(txt); } catch { throw Object.assign(new Error(`LLM返回非JSON http=${resp.status} ${txt.slice(0, 150)}`), { status: resp.status }); }
    if (!resp.ok || j.error) {
      quota.logCost({ svc: 'ark', action: 'llm_chat', model: V.llmModel, userId, ok: 0, http_code: resp.status, estCostFen: 0, meta: { error: j.error && j.error.message } });
      throw new Error(`方舟LLM失败 http=${resp.status} ${(j.error && j.error.message) || txt.slice(0, 200)}`);
    }
    const text = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '').trim();
    if (!text) throw new Error('方舟LLM返回为空');
    const usage = j.usage || {};
    const cost = Math.ceil(((usage.prompt_tokens || estIn) / 1000) * U.llmPer1kIn + ((usage.completion_tokens || 0) / 1000) * U.llmPer1kOut);
    quota.logCost({ svc: 'ark', action: 'llm_chat', model: V.llmModel, userId, ok: 1, http_code: resp.status, billedUnits: (usage.total_tokens || estIn), unit: 'token', estCostFen: cost, requestId: j.id || null, meta: usage });
    logger.info('volc_llm_ok', { ms: Date.now() - t0, usage });
    return { text, usage };
  } finally {
    release();
  }
}

// 生成祝福/口播文案（场景化）
async function generateBlessingCopy({ scene = '通用', toName = '', style = '温暖真诚', extra = '', userId = null } = {}) {
  const system = [
    '你是“晶晶日上”数字人祝福平台的金牌口播文案。',
    '任务：写一段由数字人/艺人口播的祝福词，要求：',
    '1) 口语化、适合直接朗读、断句自然；2) 不使用 emoji、不写舞台说明、不要括号注释；',
    '3) 控制在 120 字以内；4) 真诚不浮夸；5) 只输出口播正文，不要标题和解释。',
  ].join('\n');
  const user = `使用场景：${scene}\n送给谁：${toName || '对方'}\n期望风格：${style}\n${extra ? `补充要求：${extra}\n` : ''}请写一段祝福口播文案。`;
  const { text } = await chatCompletion({ system, user, temperature: 0.85, maxTokens: 400, userId });
  // 去掉模型可能带的首尾引号
  return text.replace(/^[“"'「\s]+|[”"'」\s]+$/g, '').trim();
}

// ---------------- 语音（复用 volcSpeech，透传 userId 以落成本） ----------------
async function synthesize(opt) { return speech.synthesize(opt); }
async function cloneVoice(opt) { return speech.cloneVoice(opt); }

// ---------------- 视觉（复用 volcVisual） ----------------
async function textToImage(opt) { return visual.textToImage(opt); }
async function createVideoTask(opt) { return visual.createVideoTask(opt); }
function getTask(id) { return visual.getTask(id); }

// ---------------- 统一能力状态（健康检查/运维面板） ----------------
function volcStatus() {
  return {
    llm: { model: V.llmModel, arkKeyConfigured: !!V.arkApiKey },
    speech: speech.speechStatus(),
    visual: visual.visualStatus(),
    inflight: quota.inflightCount(),
    rolling24hCostFen: quota.rolling24hCostFen(),
    dailyCostCapFen: config.aiQuota.dailyCostCapFen,
  };
}

module.exports = {
  // LLM
  chatCompletion, generateBlessingCopy,
  // 语音（转发 volcSpeech）
  synthesize, cloneVoice,
  // 视觉（转发 volcVisual）
  textToImage, createVideoTask, getTask,
  // 状态
  volcStatus,
};
