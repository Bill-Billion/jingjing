// services/volcSpeech.js - 火山 openspeech 语音服务层（语音合成 TTS / 声音复刻 2.0）
// 独立于方舟：域名 openspeech.bytedance.com，鉴权用 SPEECH_API_KEY（不能用 ARK_API_KEY）。
// 含并发额度、失败重试、按字符成本流水；密钥只从 config.volc（.env）读取，仅服务端调用。
const crypto = require('crypto');
const config = require('../config');
const logger = require('../utils/logger');
const quota = require('./aiQuota');

const V = config.volc;
const U = config.aiQuota.unitCostFen;

// ---------------- 语音合成 TTS（chunked 分片，拼接 base64） ----------------
// cloned=true 走复刻音色资源 seed-icl-2.0，并带 model=seed-icl-2.0-standard
async function synthesize({ text, speaker, cloned = false, format = 'mp3', sampleRate = 24000, speechRate = 0, userId = null } = {}) {
  if (!V.speechKey) throw new Error('未配置 SPEECH_API_KEY');
  if (!text || !text.trim()) throw new Error('TTS 文本为空');
  const sp = speaker || V.defaultSpeaker;
  const resource = cloned ? V.cloneResource : V.ttsResource;
  const reqParams = {
    text,
    speaker: sp,
    audio_params: { format, sample_rate: sampleRate, speech_rate: speechRate },
  };
  if (cloned) reqParams.model = V.cloneModel;

  quota.assertBudget(Math.ceil(text.length * U.ttsPerChar));
  const release = await quota.acquire(cloned ? 'tts' : 'tts');
  const t0 = Date.now();
  try {
    const resp = await quota.withRetry(() => fetch(`${V.speechBase}/api/v3/tts/unidirectional`, {
      method: 'POST',
      headers: {
        'X-Api-Key': V.speechKey,
        'X-Api-Resource-Id': resource,
        'X-Api-Request-Id': crypto.randomUUID(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ req_params: reqParams }),
    }));
    const raw = await resp.text();
    if (!resp.ok) {
      quota.logCost({ svc: 'openspeech', action: 'tts', model: resource, userId, ok: 0, http_code: resp.status, billedUnits: text.length, unit: 'char', estCostFen: 0, meta: { raw: raw.slice(0, 200) } });
      throw new Error(`TTS失败 http=${resp.status} ${raw.slice(0, 200)}`);
    }
    const b64 = [...raw.matchAll(/"data"\s*:\s*"([^"]*)"/g)].map((m) => m[1]).join('');
    const codeM = raw.match(/"code"\s*:\s*(-?\d+)/);
    if (codeM && codeM[1] !== '0') {
      quota.logCost({ svc: 'openspeech', action: 'tts', model: resource, userId, ok: 0, http_code: resp.status, billedUnits: text.length, unit: 'char', estCostFen: 0, meta: { code: codeM[1] } });
      throw new Error(`TTS业务失败 code=${codeM[1]} ${raw.slice(0, 200)}`);
    }
    if (!b64) throw new Error('TTS 未返回音频数据');
    const audio = Buffer.from(b64, 'base64');
    const cost = Math.ceil(text.length * U.ttsPerChar);
    quota.logCost({ svc: 'openspeech', action: 'tts', model: resource, userId, ok: 1, http_code: resp.status, billedUnits: text.length, unit: 'char', estCostFen: cost });
    logger.info('volc_tts_ok', { ms: Date.now() - t0, chars: text.length, bytes: audio.length, cloned, speaker: sp });
    return { audio, format, speaker: sp, chars: text.length };
  } finally {
    release();
  }
}

// ---------------- 声音复刻（训练自定义音色） ----------------
async function cloneVoice({ audioBase64OrBuffer, format = 'mp3', demoText, customSpeakerId, language = 0, userId = null } = {}) {
  const dataB64 = Buffer.isBuffer(audioBase64OrBuffer) ? audioBase64OrBuffer.toString('base64') : audioBase64OrBuffer;
  if (!dataB64) throw new Error('缺少复刻录音');
  const speaker = customSpeakerId || `jjsr_${crypto.randomBytes(4).toString('hex')}`;
  if (!/^[A-Za-z][A-Za-z0-9_-]{7,255}$/.test(speaker)) throw new Error('customSpeakerId 需字母开头、仅含数字字母-_、8~256位');
  const body = {
    speaker_id: 'custom_speaker_id', // 后付费音色固定值
    custom_speaker_id: speaker,
    audio: { data: dataB64, format },
    language, // 0=中文
    extra_params: { demo_text: demoText || '你好，这是我的声音复刻试听，祝你万事顺意，天天开心。' },
  };
  quota.assertBudget(0); // 训练试听先走免费额度；正式合成时才计 138 元/音色
  const release = await quota.acquire('clone');
  const t0 = Date.now();
  try {
    const resp = await quota.withRetry(() => fetch(`${V.speechBase}/api/v3/tts/voice_clone`, {
      method: 'POST',
      headers: {
        'X-Api-Key': V.speechKey,
        'X-Api-Resource-Id': V.cloneResource,
        'X-Api-Request-Id': crypto.randomUUID(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }));
    const txt = await resp.text();
    let j; try { j = JSON.parse(txt); } catch { throw new Error(`声音复刻返回非JSON http=${resp.status} ${txt.slice(0, 200)}`); }
    if (!resp.ok || (j.code && j.code !== 0)) {
      quota.logCost({ svc: 'openspeech', action: 'voice_clone', model: V.cloneResource, userId, ok: 0, http_code: resp.status, estCostFen: 0, meta: { code: j.code, message: j.message } });
      throw new Error(`声音复刻失败 http=${resp.status} ${j.message || txt.slice(0, 200)}`);
    }
    // 训练本身不立即计费（后付费在首次正式合成时扣 138 元/音色），记一条 0 成本流水用于追踪
    quota.logCost({ svc: 'openspeech', action: 'voice_clone', model: V.cloneResource, userId, ok: 1, http_code: resp.status, billedUnits: 1, unit: 'voice', estCostFen: 0, meta: { pendingFormalCostFen: U.cloneTrain, speaker } });
    logger.info('volc_clone_ok', { ms: Date.now() - t0, speaker: j.speaker_id, status: j.status });
    return {
      speakerId: j.speaker_id,
      customSpeakerId: speaker,
      status: j.status, // 2=Success / 4=Active
      demoAudioUrl: (j.speaker_status && j.speaker_status[0] && j.speaker_status[0].demo_audio) || null,
      remain: j.available_training_times,
    };
  } finally {
    release();
  }
}

// 语音通道状态（健康检查用）
function speechStatus() {
  return {
    configured: !!(V.speechKey), ttsResource: V.ttsResource, cloneResource: V.cloneResource,
    defaultSpeaker: V.defaultSpeaker, appId: process.env.SPEECH_APP_ID || '',
  };
}

module.exports = { synthesize, cloneVoice, speechStatus };
