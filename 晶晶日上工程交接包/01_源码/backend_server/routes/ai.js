// routes/ai.js - 火山 AI 统一接口（V12：文案 / TTS / 声音复刻 / Seedream文生图 / Seedance视频异步）
// 这些接口会产生上游调用费用：开发环境可直接调用，生产环境强制登录（见 costGuard）。
// 合规：数字人/照片开口视频必须使用“真人照片”，禁止动漫/卡通人脸；本层不提供卡通人脸生成。
const express = require('express');
const crypto = require('crypto');
const volc = require('../services/volc');
const sms = require('../services/smsService');
const storage = require('../services/storage');
const volcVisual = require('../services/volcVisual');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

// 供应商（方舟）异步任务回调：必须放在 optionalAuth/costGuard 之前（无用户态），靠 HMAC 验签 + 幂等
router.post('/visual/webhook', async (req, res) => {
  try {
    const sig = req.headers['x-ark-signature'] || req.headers['x-signature'] || '';
    const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
    const r = await volcVisual.handleSupplierWebhook(raw, sig);
    res.json({ code: 0, ...r });
  } catch (e) {
    res.status(e.status || 500).json({ code: e.status || 500, message: e.message });
  }
});

// 成本保护：AI 接口直接产生上游费用，默认必须登录；仅本地联调可显式 ALLOW_ANON_AI=true 放行（与 NODE_ENV 解耦，避免线上 development 模式被匿名刷量）
function costGuard(req, res, next) {
  const allowAnon = process.env.ALLOW_ANON_AI === 'true';
  if (!req.userId && !allowAnon) {
    return res.status(401).json({ code: 401, message: '生成接口需登录后使用' });
  }
  next();
}
// V12.3 修复顺序：必须先解析可选登录态，再做成本保护；否则 costGuard 先于 optionalAuth 执行，
// req.userId 永远为空，已登录用户也会被 401（AI 层整体不可用）。
router.use(optionalAuth);
router.use(costGuard);

// 统一错误回传：保留上游 429（熔断/限流）、400、502/503 等状态
function fail(res, e, http) {
  const status = e && e.status ? e.status : (http || 500);
  res.status(status).json({ code: status, message: (e && e.message) || 'AI服务异常' });
}

async function saveAudio(buf, format = 'mp3') {
  const fn = `${Date.now()}_${crypto.randomBytes(3).toString('hex')}.${format}`;
  const r = await storage.put({ key: `ai/${fn}`, body: buf, contentType: format === 'mp3' ? 'audio/mpeg' : 'audio/wav' });
  return { url: r.url, file: fn, bytes: buf.length };
}

// 异步任务对外 DTO（不回传 request_json 等内部大字段）
function taskDto(t) {
  if (!t) return null;
  return {
    id: t.id,
    taskType: t.task_type,
    status: t.status, // pending | running | succeeded | failed
    resultUrl: t.result_url,
    error: t.error || null,
    costFen: t.cost_fen,
    createdAt: t.created_at,
    finishedAt: t.finished_at || null,
  };
}

// 1) 生成祝福/口播文案  body: {scene,toName,style,extra}
router.post('/copy', optionalAuth, async (req, res) => {
  try {
    const text = await volc.generateBlessingCopy({ ...(req.body || {}), userId: req.userId || null });
    res.json({ code: 0, text });
  } catch (e) { fail(res, e); }
});

// 2) 文本转语音  body: {text,speaker,cloned,format,speechRate}
router.post('/tts', optionalAuth, async (req, res) => {
  try {
    const { text, speaker, cloned, format, speechRate } = req.body || {};
    const r = await volc.synthesize({ text, speaker, cloned: !!cloned, format: format || 'mp3', speechRate, userId: req.userId || null });
    const saved = await saveAudio(r.audio, r.format);
    res.json({ code: 0, ...saved, speaker: r.speaker, chars: r.chars });
  } catch (e) { fail(res, e); }
});

// 3) 一步到位：没传 text 就先用 LLM 写文案，再 TTS 出语音
//    body: {text?,scene,toName,style,extra,speaker?,cloned?}
router.post('/blessing', optionalAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const text = body.text && body.text.trim()
      ? body.text
      : await volc.generateBlessingCopy({ ...body, userId: req.userId || null });
    const r = await volc.synthesize({ text, speaker: body.speaker, cloned: !!body.cloned, userId: req.userId || null });
    const saved = await saveAudio(r.audio, r.format);
    res.json({ code: 0, text, ...saved, speaker: r.speaker });
  } catch (e) { fail(res, e); }
});

// 4) 声音复刻训练 body: {audioBase64,format,demoText,customSpeakerId}
router.post('/voice-clone', optionalAuth, async (req, res) => {
  try {
    const { audioBase64, format, demoText, customSpeakerId } = req.body || {};
    if (!audioBase64) return res.status(400).json({ code: 400, message: '缺少 audioBase64' });
    const r = await volc.cloneVoice({
      audioBase64OrBuffer: audioBase64,
      format: format || 'mp3',
      demoText,
      customSpeakerId,
      userId: req.userId || null,
    });
    res.json({ code: 0, ...r });
  } catch (e) { fail(res, e); }
});

// 5) Seedream 文生图（同步，转存本地）body: {prompt,size}
//    用于数字人形象概念图/海报/分镜；真人数字人本体仍以“真人照片”为准，不用卡通人脸。
router.post('/image', optionalAuth, async (req, res) => {
  try {
    const { prompt, size } = req.body || {};
    if (!prompt || !String(prompt).trim()) return res.status(400).json({ code: 400, message: '缺少画面描述 prompt' });
    const t = await volc.textToImage({ prompt: String(prompt), size: size || '1024x1024', userId: req.userId || null });
    res.json({ code: 0, task: taskDto(t) });
  } catch (e) { fail(res, e); }
});

// 6) Seedance 视频异步创建（t2v 文生视频 / i2v 照片开口视频）
//    body: {type:'i2v'|'t2v', prompt, imageUrl(真人照片,可访问URL), duration, ratio, resolution}
//    返回本地任务id，前端用 GET /api/ai/task/:id 轮询；后台自动轮询上游并转存成片。
router.post('/video', optionalAuth, async (req, res) => {
  try {
    const b = req.body || {};
    const type = b.type === 'i2v' ? 'i2v' : 't2v';
    if (type === 'i2v' && !b.imageUrl) return res.status(400).json({ code: 400, message: '照片开口视频必须提供已上传的真人照片 imageUrl' });
    const t = await volc.createVideoTask({
      type,
      prompt: b.prompt || '',
      imageUrl: b.imageUrl || null,
      duration: Number(b.duration || 5),
      ratio: b.ratio || '9:16',
      resolution: b.resolution || '480p',
      generateAudio: b.generateAudio !== false,
      userId: req.userId || null,
    });
    res.json({ code: 0, task: taskDto(t) });
  } catch (e) { fail(res, e); }
});

// 7) 查询异步任务状态/结果  GET /api/ai/task/:id
router.get('/task/:id', optionalAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ code: 400, message: '任务id非法' });
    const t = volc.getTask(id);
    if (!t) return res.status(404).json({ code: 404, message: '任务不存在' });
    res.json({ code: 0, task: taskDto(t) });
  } catch (e) { fail(res, e); }
});

// 8) 能力与通道状态（生产需登录）：LLM/语音/视觉在途与成本、短信签名模板就绪情况
router.get('/status', optionalAuth, (req, res) => {
  res.json({ code: 0, volc: volc.volcStatus(), sms: sms.channelStatus() });
});

module.exports = router;
