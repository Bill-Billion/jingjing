// 只读：ListSmsTemplateV2@2021-01-11，尝试不同分页形态取模板列表（不发送、不打印密钥）
const { Service } = require('@volcengine/openapi');
const config = require('/opt/jjsr/config');
const svc = new Service({
  host: 'sms.volcengineapi.com', serviceName: 'volcSMS', region: config.sms.region,
  accessKeyId: config.sms.accessKeyId, secretKey: config.sms.secretAccessKey,
});
const ACC = config.sms.smsAccount || config.sms.account;
async function go(label, extra) {
  try {
    const r = await svc.fetchOpenAPI(Object.assign({ Action: 'ListSmsTemplateV2', Version: '2021-01-11', SmsAccount: ACC }, extra));
    const err = r.ResponseMetadata && r.ResponseMetadata.Error;
    console.log('## ' + label + ' -> ' + (err ? ('ERR ' + err.Code + ' ' + err.Message) : 'OK'));
    if (!err) console.log(JSON.stringify(r, null, 2).slice(0, 3000));
  } catch (e) { console.log('## ' + label + ' THROW ' + String(e.message || e).slice(0, 200)); }
}
(async () => {
  await go('only-account', {});
  await go('PageObj', { Page: { PageNum: 1, PageSize: 10 } });
  await go('PageJSON', { Page: JSON.stringify({ PageNum: 1, PageSize: 10 }) });
  await go('flat', { PageNum: 1, PageSize: 10 });
  await go('OffsetLimit', { Page: { Offset: 0, Limit: 10 } });
  process.exit(0);
})().catch((e) => { console.log('FATAL', String(e && e.message || e)); process.exit(1); });
