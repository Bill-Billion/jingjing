// 公网登录链路验证：/api/auth/sms + /api/auth/phone（development 环境任意6位验证码）
(async () => {
  const base = 'http://8.222.213.43';
  const phone = '1380013' + String(Math.floor(1000 + Math.random() * 9000));
  const sms = await fetch(base + '/api/auth/sms', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  console.log('sms   ', sms.status, JSON.stringify(await sms.json()));
  const login = await fetch(base + '/api/auth/phone', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code: '123456' }),
  });
  const j = await login.json();
  console.log('login ', login.status, 'token?', !!j.token, 'user=', JSON.stringify(j.user));
  // 用 token 访问一个需登录接口（钱包）
  if (j.token) {
    const w = await fetch(base + '/api/settlement/wallet', {
      headers: { Authorization: 'Bearer ' + j.token },
    });
    console.log('wallet', w.status, (await w.text()).slice(0, 160));
  }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
