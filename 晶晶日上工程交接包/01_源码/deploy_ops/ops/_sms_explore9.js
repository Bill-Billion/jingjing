// 只读：正确调用 createJSONAPI(Action字符串,{Version}) + POST JSON body，枚举 Page 结构
const { Service } = require('@volcengine/openapi');
const config = require('/opt/jjsr/config');
const svc = new Service({
  host: 'sms.volcengineapi.com', serviceName: 'volcSMS', region: config.sms.region,
  accessKeyId: config.sms.accessKeyId, secretKey: config.sms.secretAccessKey,
});
const ACC = config.sms.smsAccount || config.sms.account;
async function go(label, body) {
  try {
    const fn = svc.createJSONAPI('ListSmsTemplateV2', { Version: '2021-01-11', method: 'POST', contentType: 'json' });
    const r = await fn(body);
    const err = r.ResponseMetadata && r.ResponseMetadata.Error;
    console.log('## ' + label + ' -> ' + (err ? ('ERR ' + err.Code + ' ' + err.Message) : 'OK'));
    if (!err) console.log(JSON.stringify(r, null, 2).slice(0, 4000));
  } catch (e) { console.log('## ' + label + ' THROW ' + String(e.message || e).slice(0, 250)); }
}
(async () => {
  await go('PageNumSize', { SmsAccount: ACC, Page: { PageNum: 1, PageSize: 10 } });
  await go('PageNumber', { SmsAccount: ACC, Page: { PageNumber: 1, PageSize: 10 } });
  await go('OffsetLimit', { SmsAccount: ACC, Page: { Offset: 0, Limit: 10 } });
  process.exit(0);
})().catch((e) => { console.log('FATAL', String(e && e.message || e)); process.exit(1); });
