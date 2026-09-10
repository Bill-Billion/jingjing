// 只读：修正调用约定，把 Action/Version 显式带入查询登录模板状态（不发送、不打印密钥）
const { Service } = require('@volcengine/openapi');
const config = require('/opt/jjsr/config');
const svc = new Service({
  host: 'sms.volcengineapi.com', serviceName: 'volcSMS', region: config.sms.region,
  accessKeyId: config.sms.accessKeyId, secretKey: config.sms.secretAccessKey,
});
const TID = config.sms.loginTemplateId, ACC = config.sms.smsAccount, V = '2020-01-01';
async function attempt(label, fn) {
  try { const r = await fn(); console.log('== ' + label + ' =='); console.log(JSON.stringify(r, null, 2).slice(0, 2000)); }
  catch (e) { console.log(label + ' ERR ' + String((e && e.message) || e).slice(0, 300)); }
}
(async () => {
  const acts = [
    ['ListSmsTemplateV2', { SmsAccount: ACC, PageIndex: 1, PageSize: 10 }],
    ['GetSmsTemplateV2', { TemplateId: TID }],
    ['GetSmsTemplateV2', { TemplateID: TID }],
  ];
  for (const [a, p] of acts) {
    // 形式1：fetchOpenAPI 单对象，自带 Action/Version
    await attempt('fetch1:' + a, () => svc.fetchOpenAPI(Object.assign({ Action: a, Version: V }, p)));
    // 形式2：createJSONAPI(GET) 绑定后，业务参数里也带 Action
    try {
      const fn = svc.createJSONAPI({ Action: a, Version: V, method: 'GET', ContentType: 'application/json' });
      await attempt('create2:' + a, () => fn(Object.assign({ Action: a, Version: V }, p)));
    } catch (e) { console.log('build ' + a + ' ERR ' + String(e.message || e).slice(0, 200)); }
  }
  process.exit(0);
})().catch((e) => { console.log('FATAL', String(e && e.message || e)); process.exit(1); });
