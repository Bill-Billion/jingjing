// 公网 AI 闭环验证：经 Nginx 80 调 /api/ai/blessing（LLM写词+TTS），再取音频
(async () => {
  const base = 'http://8.222.213.43';
  const t0 = Date.now();
  const r = await fetch(base + '/api/ai/blessing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scene: '生日祝福', toName: '妈妈', style: '亲切温暖' }),
  });
  const j = await r.json();
  console.log('blessing http=', r.status, 'code=', j.code, 'ms=', Date.now() - t0);
  console.log('text=', j.text);
  console.log('audio=', j.url, 'bytes=', j.bytes, 'speaker=', j.speaker);
  if (j.url) {
    const a = await fetch(base + j.url);
    const buf = await a.arrayBuffer();
    console.log('audio fetch http=', a.status, a.headers.get('content-type'), buf.byteLength);
  }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
