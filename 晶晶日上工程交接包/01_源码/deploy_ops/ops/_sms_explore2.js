// 只读：用通用 Service 枚举火山短信“查询模板”接口，定位登录模板审核状态（不发送、不打印密钥）
const { Service } = require('@volcengine/openapi');
const config = require('/opt/jjsr/config');
console.log('SERVICE_PROTO=', Object.getOwnPropertyNames(Service.prototype).join(','));
const svc = new Service({
  host: 'sms.volcengineapi.com', serviceName: 'volcSMS', region: config.sms.region,
  accessKeyId: config.sms.accessKeyId, secretKey: config.sms.secretAccessKey,
});
const caller = typeof svc.jsonAPI === 'function' ? svc.jsonAPI.bind(svc)
  : (typeof svc.requestSign === 'function' ? svc.requestSign.bind(svc) : null);
console.log('CALLER=', caller ? 'jsonAPI/requestSign ok' : 'none');
(async () => {
  const acts = [
    ['ListSmsTemplateV2', { SmsAccount: config.sms.smsAccount, PageIndex: 1, PageSize: 10 }],
    ['GetSmsTemplateV2', { TemplateId: config.sms.loginTemplateId }],
    ['GetSmsTemplateV2', { TemplateID: config.sms.loginTemplateId }],
    ['ListSmsTemplate', { SmsAccount: config.sms.smsAccount }],
    ['GetSmsTemplate', { TemplateId: config.sms.loginTemplateId }],
  ];
  for (const [a, p] of acts) {
    try {
      const r = await caller(a, Object.assign({ Version: '2020-01-01' }, p));
      console.log('== ' + a + ' ' + JSON.stringify(p) + ' ==');
      console.log(JSON.stringify(r, null, 2).slice(0, 1800));
    } catch (e) { console.log(a + ' ERR ' + String((e && e.message) || e).slice(0, 300)); }
  }
  process.exit(0);
})().catch((e) => { console.log('FATAL', String(e && e.message || e)); process.exit(1); });
