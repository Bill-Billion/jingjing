// 只读：GET + params.query 正确携带业务参数，枚举 Page 编码（不发送、不打印密钥）
const { Service } = require('@volcengine/openapi');
const config = require('/opt/jjsr/config');
const svc = new Service({
  host: 'sms.volcengineapi.com', serviceName: 'volcSMS', region: config.sms.region,
  accessKeyId: config.sms.accessKeyId, secretKey: config.sms.secretAccessKey,
});
const ACC = config.sms.smsAccount || config.sms.account;
async function go(label, query) {
  try {
    const r = await svc.fetchOpenAPI({ Action: 'ListSmsTemplateV2', Version: '2021-01-11', method: 'GET', query });
    const err = r.ResponseMetadata && r.ResponseMetadata.Error;
    console.log('## ' + label + ' -> ' + (err ? ('ERR ' + err.Code + ' ' + err.Message) : 'OK'));
    if (!err) console.log(JSON.stringify(r, null, 2).slice(0, 4000));
    else if (typeof r === 'string') console.log('RAW', r.slice(0, 200));
  } catch (e) { console.log('## ' + label + ' THROW ' + String(e.message || e).slice(0, 250)); }
}
(async () => {
  await go('PageJSON', { SmsAccount: ACC, Page: JSON.stringify({ PageNum: 1, PageSize: 10 }) });
  await go('PageDot', { SmsAccount: ACC, 'Page.PageNum': 1, 'Page.PageSize': 10 });
  await go('flat', { SmsAccount: ACC, PageNum: 1, PageSize: 10 });
  process.exit(0);
})().catch((e) => { console.log('FATAL', String(e && e.message || e)); process.exit(1); });
