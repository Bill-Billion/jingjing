// 只读：用服务器已配置的火山 AKSK 查询登录短信模板的审核状态（不发送、不打印密钥）
const { SmsService } = require('@volcengine/openapi').sms;
const config = require('/opt/jjsr/config');
(async () => {
  const s = config.sms;
  const c = new SmsService({ accessKeyId: s.accessKeyId, secretKey: s.secretAccessKey, region: s.region });
  const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(c));
  console.log('SMS_METHODS=', proto.filter((m) => /template|sign/i.test(m)).join(','));
  console.log('TEMPLATE_ID=', s.loginTemplateId, ' SIGN=', s.signName, ' ENABLED=', s.enabled, ' ACCOUNT=', s.smsAccount);
  // 逐个尝试查询模板（不同 SDK 版本方法名/入参略有差异，全部 try，打印原始返回）
  const tries = [
    ['GetSmsTemplate', { TemplateId: s.loginTemplateId }],
    ['GetSmsTemplate', { TemplateID: s.loginTemplateId }],
    ['ListSmsTemplate', { SmsAccount: s.smsAccount, PageIndex: 1, PageSize: 20 }],
  ];
  for (const [m, arg] of tries) {
    if (typeof c[m] !== 'function') { console.log(m, 'NO_METHOD'); continue; }
    try {
      const r = await c[m](arg);
      console.log('=== ' + m + ' ' + JSON.stringify(arg) + ' ===');
      console.log(JSON.stringify(r, null, 2).slice(0, 2500));
    } catch (e) { console.log(m + '_ERR ' + (e && e.message || e)); }
  }
  process.exit(0);
})().catch((e) => { console.log('FATAL', e && e.message || e); process.exit(1); });
