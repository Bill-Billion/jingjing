/**
 * 豆包声音复刻2.0 · 训练冒烟：上传一段真人录音 -> 得到专属音色 speaker_id + demo试听
 * POST /api/v3/tts/voice_clone；成功后用返回的 speaker_id 走 TTS(seed-icl-2.0) 即可用该声音合成。
 * 运行：node scripts/volc_voice_clone_smoke.js [样本路径]
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const KEY = process.env.SPEECH_API_KEY || process.env.ARK_API_KEY;
const URL = 'https://openspeech.bytedance.com/api/v3/tts/voice_clone';
const sample = process.argv[2] || path.join(__dirname, '..', 'uploads', 'smoke', 'clone_sample.mp3');
const log = (...a) => console.log(new Date().toISOString(), ...a);

// 训练时顺带生成一句试听（4~300字，中文）
const DEMO_TEXT = '你好呀，我是晶晶日上的专属数字人。现在用我的声音，为你送上一份祝福：愿你所求皆如愿，所行化坦途，多喜乐，长安宁。';

function download(url, fp) {
  return new Promise((resolve, reject) => {
    https.get(url, (r) => {
      if (r.statusCode !== 200) return reject(new Error('demo dl http ' + r.statusCode));
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => { fs.writeFileSync(fp, Buffer.concat(chunks)); resolve(fp); });
    }).on('error', reject);
  });
}

async function main() {
  const buf = fs.readFileSync(sample);
  log('sample', sample, buf.length, 'bytes, base64...');
  const body = {
    // 后付费音色：speaker_id 固定 'custom_speaker_id'，自定义代号放 custom_speaker_id（字母开头/数字字母-下划线/8~256位）
    speaker_id: 'custom_speaker_id',
    custom_speaker_id: process.env.CLONE_SPEAKER_ID || 'jjsr_zh_voice_01',
    audio: { data: buf.toString('base64'), format: 'mp3' },
    language: 0, // 中文
    extra_params: {
      demo_text: DEMO_TEXT,
      enable_audio_denoise: false,
    },
  };
  const t0 = Date.now();
  const resp = await fetch(URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': KEY,
      'X-Api-Resource-Id': process.env.ARK_VOICE_CLONE_MODEL || 'seed-icl-2.0',
      'X-Api-Request-Id': crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  const txt = await resp.text();
  log('HTTP', resp.status, 'cost', Date.now() - t0, 'ms');
  let j;
  try { j = JSON.parse(txt); } catch { log('NON-JSON', txt.slice(0, 800)); throw new Error('bad resp'); }
  log('code=', j.code, 'message=', j.message, 'status=', j.status, 'speaker_id=', j.speaker_id, 'remainTrain=', j.available_training_times);
  if (j.code !== 0 && resp.status !== 200) {
    log('FULL', JSON.stringify(j).slice(0, 1000));
    throw new Error('clone failed code=' + j.code);
  }
  const demo = j.speaker_status && j.speaker_status[0] && j.speaker_status[0].demo_audio;
  const outDir = path.join(__dirname, '..', 'uploads', 'smoke');
  const result = { speaker_id: j.speaker_id, status: j.status, demo_audio_url: demo, trained_at: new Date().toISOString(), sample: path.basename(sample) };
  fs.writeFileSync(path.join(outDir, 'clone_result.json'), JSON.stringify(result, null, 2), 'utf8');
  log('RESULT SAVED clone_result.json');
  if (demo) {
    const fp = path.join(outDir, `clone_demo_${Date.now()}.mp3`);
    await download(demo, fp);
    log('DEMO AUDIO DOWNLOADED', fp, fs.statSync(fp).size, 'bytes (URL 1h有效)');
  } else {
    log('no demo_audio returned');
  }
  log('=== CLONE DONE === speaker_id=', j.speaker_id, 'status=', j.status, '(2=Success/4=Active 即可合成)');
}
main().catch((e) => { console.error('CLONE_FAIL', e && e.message ? e.message : e); process.exit(1); });
