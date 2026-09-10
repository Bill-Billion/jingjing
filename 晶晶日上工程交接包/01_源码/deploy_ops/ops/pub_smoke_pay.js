// 公网（经 Nginx 80）支付骨架 V12.4 专项冒烟：新 /api/pay 鉴权/降级 + 旧 /api/payment 占位链路并存
// 只读、无副作用（未配置真实密钥，notify 一律 fail，不写任何业务数据）
// 运行：node pub_smoke_pay.js
const BASE = process.env.BASE || 'http://8.222.213.43';
let pass = 0, fail = 0;
function ok(n, c, e) { console.log((c ? 'PASS ' : 'FAIL ') + n + (e ? '  ' + e : '')); c ? pass++ : fail++; }
async function req(method, p, body, form) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = form ? 'application/x-www-form-urlencoded' : 'application/json';
  const r = await fetch(BASE + p, { method, headers, body: body !== undefined ? (form ? body : JSON.stringify(body)) : undefined });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch {}
  return { status: r.status, text: t, json: j };
}
(async () => {
  // 1) 新骨架受保护接口：无 token 必须 401
  let r = await req('POST', '/api/pay/alipay/create', {});
  ok('新 POST /api/pay/alipay/create 无token=401', r.status === 401, r.status + ' ' + r.text);
  r = await req('GET', '/api/pay/status/NOPE');
  ok('新 GET /api/pay/status/:orderNo 无token=401', r.status === 401, r.status + ' ' + r.text);

  // 2) 未配置真实密钥：伪造回调必须被优雅拒绝（纯文本 fail，且不是 5xx 崩溃）
  r = await req('POST', '/api/pay/alipay/notify', 'a=1&out_trade_no=FAKE', true);
  ok('未配置时 notify 返回 200+fail(降级不崩、防伪造)', r.status === 200 && r.text === 'fail', r.status + ' [' + r.text + ']');

  // 3) 旧 payment 占位链路仍然挂载、仍然需要登录（与新链路并存不冲突）
  r = await req('POST', '/api/payment/pay', {});
  ok('旧 POST /api/payment/pay 仍挂载且无token=401', r.status === 401, r.status + ' ' + r.text);
  r = await req('GET', '/api/payment/status/FAKE');
  ok('旧 GET /api/payment/status/:txNo 仍挂载(401/4xx 非5xx)', r.status < 500, r.status + ' ' + r.text);

  // 4) 基线 health
  r = await req('GET', '/api/health');
  ok('health 200 v10.1.0', r.status === 200 && r.json && r.json.version === '10.1.0', r.status);

  // 5) 不存在的子路径 404 而非进程错误
  r = await req('GET', '/api/pay/__nope__');
  ok('/api/pay 未知子路径 404 不崩', r.status === 404, r.status + ' ' + r.text);

  console.log('\nPUB PAY SMOKE pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message); process.exit(2); });
