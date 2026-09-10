// 只读：POST JSON 方式调 ListSmsTemplateV2@2021-01-11，枚举 Page 结构（不发送、不打印密钥）
const { Service } = require('@volcengine/openapi');
const config = require('/opt/jjsr/config');
const svc = new Service({
  host: 'sms.volcengineapi.com', serviceName: 'volcSMS', region: config.sms.region,
  accessKeyId: config.sms.accessKeyId, secretKey: config.sms.secretAccessKey,
});
const ACC = config.sms.smsAccount || config.sms.account;
async function go(label, body) {
  try {
    const fn = svc.createJSONAPI({ Action: 'ListSmsTemplateV2', Version: '2021-01-11', method: 'POST', ContentType: 'application/json' });
    const r = await fn(body);
    const err = r.ResponseMetadata && r.ResponseMetadata.Error;
    console.log('## ' + label + ' -> ' + (err ? ('ERR ' + err.Code + ' ' + err.Message) : 'OK'));
    if (!err) console.log(JSON.stringify(r, null, 2).slice(0, 3500));
  } catch (e) { console.log('## ' + label + ' THROW ' + String(e.message || e).slice(0, 250)); }
}
(async () => {
  await go('PageNumSize', { SmsAccount: ACC, Page: { PageNum: 1, PageSize: 10 } });
  await go('PageNumber', { SmsAccount: ACC, Page: { PageNumber: 1, PageSize: 10 } });
  await go('OffsetLimit', { SmsAccount: ACC, Page: { Offset: 0, Limit: 10 } });
  await go('PageIndex', { SmsAccount: ACC, Page: { PageIndex: 1, PageSize: 10 } });
  process.exit(0);
})().catch((e) => { console.log('FATAL', String(e && e.message || e)); process.exit(1); });
