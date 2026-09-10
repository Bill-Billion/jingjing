/**
 * 火山方舟 Seedance 视频生成 · 最小链路冒烟测试（T-03 MVO 第一步）
 * 目标：证明 .env 密钥 -> 创建生成任务 -> 轮询 -> 拿到可播放 mp4 全链路打通。
 * 纯文生视频（不依赖人脸/照片），用最便宜的 fast + 480p + 5s。
 * 运行：node scripts/volc_video_smoke.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');

const BASE = process.env.ARK_BASE_URL;
const KEY = process.env.ARK_API_KEY;
const MODEL = process.env.ARK_T2V_MODEL;
const log = (...a) => console.log(new Date().toISOString(), ...a);

const authHeaders = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function createTask() {
  // Seedance 参数写在提示词中：分辨率/时长/比例
  const prompt = '温暖金色追光下，一位年轻女性微笑着向镜头轻轻挥手打招呼，画面明亮治愈，电影感，人物居中 --resolution 480p --duration 5 --ratio 9:16';
  const r = await fetch(`${BASE}/contents/generations/tasks`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ model: MODEL, content: [{ type: 'text', text: prompt }] }),
  });
  const j = await r.json();
  log('CREATE http=', r.status, JSON.stringify(j).slice(0, 600));
  if (!j.id) throw new Error('创建任务失败，无 id：' + JSON.stringify(j));
  return j.id;
}

async function poll(id, timeoutMs = 300000, intervalMs = 5000) {
  const t0 = Date.now();
  let res = null;
  while (Date.now() - t0 < timeoutMs) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const g = await fetch(`${BASE}/contents/generations/tasks/${id}`, {
      headers: { Authorization: `Bearer ${KEY}` },
    });
    res = await g.json();
    log('POLL', res.status, JSON.stringify(res).slice(0, 260));
    if (res.status === 'succeeded') return res;
    if (res.status === 'failed' || res.status === 'cancelled') {
      throw new Error('生成失败：' + JSON.stringify(res));
    }
  }
  throw new Error('轮询超时，最后状态：' + JSON.stringify(res));
}

async function download(url) {
  const v = await fetch(url);
  if (!v.ok) throw new Error('下载视频失败 http=' + v.status);
  const buf = Buffer.from(await v.arrayBuffer());
  const outDir = path.join(__dirname, '..', 'uploads', 'smoke');
  fs.mkdirSync(outDir, { recursive: true });
  const fp = path.join(outDir, `smoke_${Date.now()}.mp4`);
  fs.writeFileSync(fp, buf);
  return { fp, size: buf.length };
}

(async () => {
  log('=== Seedance smoke start === model=', MODEL, ' keySet=', !!KEY);
  if (!KEY || !MODEL) throw new Error('缺少 ARK_API_KEY / ARK_T2V_MODEL，请检查 .env');
  const id = await createTask();
  log('TASK_ID', id);
  const done = await poll(id);
  const url = done.content?.video_url?.url || done.content?.video_url || done.video_url;
  log('VIDEO_URL', url);
  if (!url) throw new Error('成功但未取到 video_url：' + JSON.stringify(done));
  const { fp, size } = await download(url);
  log('SAVED', fp, size, 'bytes');
  log('=== SMOKE OK ===');
})().catch((e) => {
  console.error('SMOKE_FAIL', e && e.message ? e.message : e);
  process.exit(1);
});
