// 只读：最后枚举 Page 结构字段命名（GET query，Page 为 JSON 字符串）
const { Service } = require('@volcengine/openapi');
const config = require('/opt/jjsr/config');
const svc = new Service({
  host: 'sms.volcengineapi.com', serviceName: 'volcSMS', region: config.sms.region,
  accessKeyId: config.sms.accessKeyId, secretKey: config.sms.secretAccessKey,
});
const ACC = config.sms.smsAccount || config.sms.account;
async function go(label, pageObj, extra) {
  try {
    const query = Object.assign({ SmsAccount: ACC, Page: JSON.stringify(pageObj) }, extra || {});
    const r = await svc.fetchOpenAPI({ Action: 'ListSmsTemplateV2', Version: '2021-01-11', method: 'GET', query });
    const err = r.ResponseMetadata && r.ResponseMetadata.Error;
    console.log('## ' + label + ' -> ' + (err ? ('ERR ' + err.Code + ' ' + err.Message) : 'OK'));
    if (!err) console.log(JSON.stringify(r, null, 2).slice(0, 4000));
  } catch (e) { console.log('## ' + label + ' THROW ' + String(e.message || e).slice(0, 200)); }
}
(async () => {
  await go('PageNumber', { PageNumber: 1, PageSize: 10 });
  await go('PageIndex', { PageIndex: 1, PageSize: 10 });
  await go('NumSizeTotal', { PageNum: 1, PageSize: 10, Total: 0 });
  await go('OffsetLimitJSON', { Offset: 0, Limit: 10 });
  process.exit(0);
})().catch((e) => { console.log('FATAL', String(e && e.message || e)); process.exit(1); });
