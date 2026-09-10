// 从本机走公网 Nginx(80) 复验关键接口（不经 SSH，模拟真实 APP 访问路径）
const BASE = 'http://8.222.213.43';
let pass = 0, fail = 0;
function ok(n, c, e) { console.log((c ? 'PASS ' : 'FAIL ') + n + (e ? '  ' + e : '')); c ? pass++ : fail++; }
async function req(method, p, body) {
  const opt = { method, headers: {} };
  if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  const r = await fetch(BASE + p, opt);
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch (e) {}
  return { status: r.status, json: j, ct: r.headers.get('content-type') || '' };
}
(async () => {
  let r = await req('GET', '/api/health');
  ok('公网 health 200 v13.0.0', r.status === 200 && r.json && r.json.version === '13.0.0', r.status + ' ' + JSON.stringify(r.json));

  r = await req('GET', '/api/humans');
  ok('公网 humans 列表 200', r.status === 200 && Array.isArray(r.json.list), 'n=' + (r.json && r.json.list && r.json.list.length));
  const id = r.json.list[0].id;
  r = await req('GET', '/api/humans/' + id);
  ok('公网 humans 详情 200', r.status === 200 && r.json.id === id);

  for (const q of ['', '?page=abc&size=xyz', '?page=-1&pageSize=0']) {
    r = await req('GET', '/api/projects' + q);
    ok('公网 projects' + (q || '') + ' 200', r.status === 200 && Array.isArray(r.json.list), r.status);
  }
  r = await req('GET', '/api/samples/library');
  ok('公网 samples/library 200（脏中文）', r.status === 200 && !!r.json.library, r.status);
  r = await req('GET', '/api/endorsement/packages');
  ok('公网 endorsement/packages 200', r.status === 200, r.status);
  r = await req('GET', '/api/packages');
  ok('公网 packages 200', r.status === 200, r.status);
  r = await req('GET', '/api/theater');
  ok('公网 theater 200', r.status === 200, r.status);

  // 受保护接口公网无 token = 401
  for (const p of ['/api/orders/all', '/api/ai/status', '/api/settlement/wallet', '/api/mcn/dashboard']) {
    r = await req('GET', p);
    ok('公网 ' + p + ' 401', r.status === 401, r.status);
  }
  for (const p of ['/api/ai/copy', '/api/ai/blessing']) {
    r = await req('POST', p, {});
    ok('公网 POST ' + p + ' 401', r.status === 401, r.status);
  }
  // 不存在的路由应 404 而非崩
  r = await req('GET', '/api/__no_such__');
  ok('公网未知路由 404(不崩)', r.status === 404, r.status);
  console.log('\nPUB SMOKE pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
