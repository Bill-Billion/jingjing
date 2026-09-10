/**
 * 方舟 Ark 开通情况只读探测：列出可用模型 + 校验 .env 里配置的模型 ID 是否可被识别。
 * 不生成内容、不产生费用。运行：node scripts/volc_ark_probe.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const BASE = process.env.ARK_BASE_URL;
const KEY = process.env.ARK_API_KEY;
const log = (...a) => console.log(new Date().toISOString(), ...a);

(async () => {
  log('BASE=', BASE, ' keySet=', !!KEY, ' len=', (KEY || '').length);
  const r = await fetch(`${BASE}/models`, { headers: { Authorization: `Bearer ${KEY}` } });
  const txt = await r.text();
  log('GET /models http=', r.status);
  let j;
  try { j = JSON.parse(txt); } catch { log('NON-JSON', txt.slice(0, 500)); process.exit(1); }
  const ids = (j.data || j.models || []).map((m) => m.id || m.model || String(m));
  log('TOTAL models=', ids.length);
  const kw = /seedream|seedance|doubao-seed|image|vision|omni|human|lip|avatar/i;
  const hit = ids.filter((x) => kw.test(x)).sort();
  log('--- 与图像/视频/数字人相关的可用模型 ---');
  hit.forEach((x) => log('  *', x));
  log('--- .env 配置的模型 ID 是否在列表中 ---');
  ['ARK_LLM_MODEL', 'ARK_T2V_MODEL', 'ARK_T2I_MODEL'].forEach((k) => {
    const v = (process.env[k] || '').split('#')[0].trim();
    log(`  ${k}=${v}  => ${v ? (ids.includes(v) ? '在列表中(可直接model直连)' : '【不在/models列表】(可能仍可直连,以实际生成调用为准)') : '未配置'}`);
  });
})().catch((e) => { console.error('PROBE_FAIL', e.message); process.exit(1); });
