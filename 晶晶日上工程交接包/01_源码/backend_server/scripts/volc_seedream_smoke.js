/**
 * 方舟 Seedream 文生图(数字人形象/封面) 冒烟：实发一张最小图，验证模型已开通 + model ID 正确 + 全链路。
 * POST /images/generations（OpenAI 兼容）。运行：node scripts/volc_seedream_smoke.js ["prompt"]
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const BASE = process.env.ARK_BASE_URL;
const KEY = process.env.ARK_API_KEY;
const MODEL = (process.env.ARK_T2I_MODEL || '').split('#')[0].trim();
const log = (...a) => console.log(new Date().toISOString(), ...a);

async function tryGen(size) {
  const body = { model: MODEL, prompt: PROMPT, response_format: 'url', size };
  const r = await fetch(`${BASE}/images/generations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const txt = await r.text();
  let j; try { j = JSON.parse(txt); } catch { j = { raw: txt }; }
  return { http: r.status, j };
}

const PROMPT = process.argv[2] || '温暖金色追光下，一位年轻东亚女性的正面半身肖像，自然微笑，纯色深灰背景，写实摄影质感，柔和光线，居中构图';

(async () => {
  log('=== Seedream t2i smoke === model=', MODEL, ' keySet=', !!KEY);
  let { http, j } = await tryGen('1024x1024');
  log('try size=1024x1024 http=', http, JSON.stringify(j).slice(0, 500));
  // 兼容 Seedream 新版用 1K/2K 档位
  if (http !== 200 && /size|resolution|param/i.test(JSON.stringify(j))) {
    ({ http, j } = await tryGen('1K'));
    log('retry size=1K http=', http, JSON.stringify(j).slice(0, 500));
  }
  if (http !== 200) throw new Error('文生图未成功：' + JSON.stringify(j).slice(0, 400));
  const item = (j.data && j.data[0]) || {};
  log('usage=', JSON.stringify(j.usage || {}));
  const outDir = path.join(__dirname, '..', 'uploads', 'smoke');
  fs.mkdirSync(outDir, { recursive: true });
  if (item.b64_json) {
    const buf = Buffer.from(item.b64_json, 'base64');
    const fp = path.join(outDir, `seedream_${Date.now()}.png`);
    fs.writeFileSync(fp, buf);
    log('SAVED b64', fp, buf.length);
  } else if (item.url) {
    log('IMAGE_URL', item.url.slice(0, 160));
    const v = await fetch(item.url);
    const buf = Buffer.from(await v.arrayBuffer());
    const fp = path.join(outDir, `seedream_${Date.now()}.png`);
    fs.writeFileSync(fp, buf);
    log('SAVED url', fp, buf.length, 'bytes');
  } else {
    log('NO IMAGE, resp=', JSON.stringify(j).slice(0, 600));
  }
  log('=== SEEDREAM OK ===');
})().catch((e) => { console.error('SEEDREAM_FAIL', e.message); process.exit(1); });
