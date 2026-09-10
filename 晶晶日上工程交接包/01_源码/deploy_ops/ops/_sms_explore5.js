// 只读：枚举 Action×Version 找到查询模板的正确组合（不发送、不打印密钥）
const { Service } = require('@volcengine/openapi');
const config = require('/opt/jjsr/config');
const svc = new Service({
  host: 'sms.volcengineapi.com', serviceName: 'volcSMS', region: config.sms.region,
  accessKeyId: config.sms.accessKeyId, secretKey: config.sms.secretAccessKey,
});
const TID = config.sms.loginTemplateId, ACC = config.sms.smsAccount || config.sms.account;
async function go(action, version, extra) {
  try {
    const r = await svc.fetchOpenAPI(Object.assign({ Action: action, Version: version }, extra));
    const m = r && r.ResponseMetadata;
    const err = m && m.Error;
    console.log(`[${action} @ ${version}]`, err ? ('ERR ' + err.Code + ' ' + err.Message) : ('OK ' + JSON.stringify(r).slice(0, 1400)));
  } catch (e) { console.log(`[${action} @ ${version}] THROW ` + String(e.message || e).slice(0, 200)); }
}
(async () => {
  const versions = ['2020-01-01', '2021-01-11', '2023-01-01', '2024-01-01'];
  for (const v of versions) {
    await go('ListSmsTemplate', v, { SmsAccount: ACC, PageIndex: 1, PageSize: 10 });
    await go('GetSmsTemplate', v, { TemplateId: TID });
    await go('ListSmsTemplateV2', v, { SmsAccount: ACC, PageIndex: 1, PageSize: 10 });
    await go('GetSmsTemplateV2', v, { TemplateId: TID });
  }
  process.exit(0);
})().catch((e) => { console.log('FATAL', String(e && e.message || e)); process.exit(1); });
