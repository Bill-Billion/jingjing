/**
 * 豆包语音合成2.0(TTS) · 冒烟测试：文本 -> mp3（先用平台预置音色打通，复刻音色后续用 seed-icl-2.0）
 * POST openspeech /api/v3/tts/unidirectional，chunked 返回多片 JSON，每片 data 为 base64 音频块。
 * 运行：node scripts/volc_tts_smoke.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KEY = process.env.SPEECH_API_KEY || process.env.ARK_API_KEY; // 豆包语音(openspeech)专用Key，兜底方舟Key
const URL = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional';
const log = (...a) => console.log(new Date().toISOString(), ...a);

const TEXT = process.argv[2] || '生日快乐！愿你岁岁常欢愉，万事皆胜意。这是一份来自晶晶日上的专属数字人祝福，送给最重要的你。';
const SPEAKER = process.argv[3] || process.env.ARK_TTS_SPEAKER || 'zh_female_vv_uranus_bigtts'; // 预置音色，复刻音色传 voice_id
const RESOURCE = process.env.ARK_TTS_MODEL || 'seed-tts-2.0';

async function main() {
  log('TTS start speaker=', SPEAKER, ' keySet=', !!KEY);
  const resp = await fetch(URL, {
    method: 'POST',
    headers: {
      'X-Api-Key': KEY,
      'X-Api-Resource-Id': RESOURCE,
      'X-Api-Request-Id': crypto.randomUUID(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      req_params: {
        text: TEXT,
        speaker: SPEAKER,
        audio_params: { format: 'mp3', sample_rate: 24000 },
      },
    }),
  });
  log('HTTP', resp.status, resp.headers.get('content-type'));
  const raw = await resp.text();
  if (!resp.ok) {
    log('ERR BODY', raw.slice(0, 800));
    throw new Error('TTS http ' + resp.status);
  }
  // 鲁棒提取所有分片里的 base64 音频块
  const matches = [...raw.matchAll(/"data"\s*:\s*"([^"]*)"/g)];
  const b64 = matches.map((m) => m[1]).join('');
  // 同时抓状态码/计费字
  const codeM = raw.match(/"code"\s*:\s*(-?\d+)/);
  const wordsM = raw.match(/"text_words"\s*:\s*(\d+)/);
  log('chunks=', matches.length, ' code=', codeM && codeM[1], ' billedWords=', wordsM && wordsM[1]);
  if (!b64) {
    log('NO AUDIO, raw head:', raw.slice(0, 800));
    throw new Error('未取到音频');
  }
  const buf = Buffer.from(b64, 'base64');
  const outDir = path.join(__dirname, '..', 'uploads', 'smoke');
  fs.mkdirSync(outDir, { recursive: true });
  const fp = path.join(outDir, `tts_${Date.now()}.mp3`);
  fs.writeFileSync(fp, buf);
  log('SAVED', fp, buf.length, 'bytes');
  log('=== TTS OK ===');
}
main().catch((e) => {
  console.error('TTS_FAIL', e && e.message ? e.message : e);
  process.exit(1);
});
