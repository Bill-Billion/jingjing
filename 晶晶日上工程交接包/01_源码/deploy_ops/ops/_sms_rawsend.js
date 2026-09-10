// 诊断：对用户本人号码真实下发一条，打印火山完整原始响应（用户主动要求排查）
const crypto = require('crypto');
const { SmsService } = require('@volcengine/openapi').sms;
const config = require('/opt/jjsr/config');
const c = config.sms;
const svc = new SmsService({ accessKeyId: c.accessKeyId, secretKey: c.secretAccessKey, region: c.region });
const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
(async () => {
  const resp = await svc.Send({
    SmsAccount: c.smsAccount, Sign: c.signName, TemplateID: c.loginTemplateId,
    TemplateParam: JSON.stringify({ code }), PhoneNumbers: '19913338881',
  });
  console.log('FULL_RESP=', JSON.stringify(resp, null, 2));
  process.exit(0);
})().catch((e) => { console.log('THROW', e && e.message, JSON.stringify(e && e.response || {}).slice(0, 500)); process.exit(1); });
