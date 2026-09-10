// AI 接口自测：文案接口 + 成品音频静态可访问性。运行：node scripts/ai_api_check.js
const BASE = 'http://localhost:3000';
async function main() {
  // 1) 纯文案
  const c = await fetch(`${BASE}/api/ai/copy`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scene: '生日', toName: '妈妈', style: '亲切温暖' }),
  });
  const cj = await c.json();
  console.log('COPY http=', c.status, 'code=', cj.code, '\n文案：', cj.text);

  // 2) 已生成成品的静态访问
  const u = '/uploads/ai/1788017247381_383d3e.mp3';
  const s = await fetch(`${BASE}${u}`);
  console.log('STATIC http=', s.status, 'type=', s.headers.get('content-type'), 'len=', s.headers.get('content-length'));
}
main().catch((e) => { console.error('CHECK_FAIL', e.message); process.exit(1); });
