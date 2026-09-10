// 只读：用 createJSONAPI/fetchOpenAPI 查询登录模板审核状态（不发送、不打印密钥）
const { Service } = require('@volcengine/openapi');
const config = require('/opt/jjsr/config');
const svc = new Service({
  host: 'sms.volcengineapi.com', serviceName: 'volcSMS', region: config.sms.region,
  accessKeyId: config.sms.accessKeyId, secretKey: config.sms.secretAccessKey,
});
const TID = config.sms.loginTemplateId;
const ACC = config.sms.smsAccount;
async function attempt(label, fn) {
  try { const r = await fn(); console.log('== ' + label + ' =='); console.log(JSON.stringify(r, null, 2).slice(0, 1800)); }
  catch (e) { console.log(label + ' ERR ' + String((e && e.message) || e).slice(0, 300)); }
}
(async () => {
  console.log('typeof fetchOpenAPI=', typeof svc.fetchOpenAPI, ' createJSONAPI=', typeof svc.createJSONAPI);
  const acts = [
    ['ListSmsTemplateV2', { SmsAccount: ACC, PageIndex: 1, PageSize: 10 }],
    ['GetSmsTemplateV2', { TemplateId: TID }],
    ['GetSmsTemplateV2', { TemplateID: TID }],
    ['ListSmsTemplate', { SmsAccount: ACC }],
    ['GetSmsTemplate', { TemplateId: TID }],
  ];
  for (const [a, p] of acts) {
    const q = Object.assign({ Version: '2020-01-01' }, p);
    if (typeof svc.fetchOpenAPI === 'function') await attempt('fetch:' + a, () => svc.fetchOpenAPI(a, q));
    if (typeof svc.createJSONAPI === 'function') {
      try {
        const fn = svc.createJSONAPI({ Action: a, Version: '2020-01-01', method: 'GET' });
        await attempt('create:' + a, () => fn(p));
      } catch (e) { console.log('create-build ' + a + ' ERR ' + String(e.message || e).slice(0, 200)); }
    }
  }
  process.exit(0);
})().catch((e) => { console.log('FATAL', String(e && e.message || e)); process.exit(1); });
