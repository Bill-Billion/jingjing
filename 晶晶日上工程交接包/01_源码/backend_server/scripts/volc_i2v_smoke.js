/**
 * 火山方舟 Seedance 图生视频(i2v) · 冒烟测试（T-03 关键一跳：照片 -> 数字人出镜）
 * 输入：一张真人正面照（base64 data URI，无需 OSS）；输出：该人物动起来的 5s 竖屏 mp4。
 * 运行：node scripts/volc_i2v_smoke.js [图片绝对路径]
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');

const BASE = process.env.ARK_BASE_URL;
const KEY = process.env.ARK_API_KEY;
const MODEL = process.env.ARK_T2V_MODEL;
const log = (...a) => console.log(new Date().toISOString(), ...a);

const IMG = process.argv[2] ||
  'C:\\Users\\user\\Doubao\\chats\\2026-08-24\\new-chat-3\\work\\app\\jingjingshangri_app\\assets\\images\\artist_1.jpg';

function toDataUri(fp) {
  const buf = fs.readFileSync(fp);
  const ext = path.extname(fp).slice(1).toLowerCase() || 'jpeg';
  const mime = ext === 'jpg' ? 'jpeg' : ext;
  log('input image', fp, (buf.length / 1024).toFixed(1) + 'KB');
  return `data:image/${mime};base64,${buf.toString('base64')}`;
}

async function createTask(dataUri) {
  const body = {
    model: MODEL,
    content: [
      { type: 'image_url', image_url: { url: dataUri } },
      {
        type: 'text',
        // 保持人物一致性，只做自然的小幅动作，最贴近“数字人祝福口播”
        text: '图中人物面向镜头，露出自然微笑，轻轻点头并向镜头挥手打招呼，自然眨眼，嘴角轻微说话动作，光线柔和，保持人物五官、发型、服装与背景完全一致，写实风格 --resolution 480p --duration 5 --ratio 9:16',
      },
    ],
  };
  const r = await fetch(`${BASE}/contents/generations/tasks`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  log('CREATE http=', r.status, JSON.stringify(j).slice(0, 600));
  if (!j.id) throw new Error('创建 i2v 任务失败：' + JSON.stringify(j));
  return j.id;
}

async function poll(id, timeoutMs = 300000, intervalMs = 5000) {
  const t0 = Date.now();
  let res = null;
  while (Date.now() - t0 < timeoutMs) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const g = await fetch(`${BASE}/contents/generations/tasks/${id}`, { headers: { Authorization: `Bearer ${KEY}` } });
    res = await g.json();
    log('POLL', res.status);
    if (res.status === 'succeeded') return res;
    if (res.status === 'failed' || res.status === 'cancelled') throw new Error('生成失败：' + JSON.stringify(res));
  }
  throw new Error('轮询超时：' + JSON.stringify(res));
}

(async () => {
  log('=== Seedance i2v smoke === model=', MODEL);
  const dataUri = toDataUri(IMG);
  const id = await createTask(dataUri);
  log('TASK_ID', id);
  const done = await poll(id);
  const url = done.content?.video_url?.url || done.content?.video_url;
  log('VIDEO_URL', url);
  const v = await fetch(url);
  const buf = Buffer.from(await v.arrayBuffer());
  const outDir = path.join(__dirname, '..', 'uploads', 'smoke');
  fs.mkdirSync(outDir, { recursive: true });
  const fp = path.join(outDir, `i2v_${Date.now()}.mp4`);
  fs.writeFileSync(fp, buf);
  log('SAVED', fp, buf.length, 'bytes');
  log('=== I2V OK ===');
})().catch((e) => {
  console.error('I2V_FAIL', e && e.message ? e.message : e);
  process.exit(1);
});
