// 只读：枚举“短信发送记录/回执”查询接口，定位 19913338881 两条消息的运营商投递状态（不发送）
const { Service } = require('@volcengine/openapi');
const config = require('/opt/jjsr/config');
const svc = new Service({
  host: 'sms.volcengineapi.com', serviceName: 'volcSMS', region: config.sms.region,
  accessKeyId: config.sms.accessKeyId, secretKey: config.sms.secretAccessKey,
});
const ACC = config.sms.smsAccount || config.sms.account;
async function go(action, version, query) {
  try {
    const r = await svc.fetchOpenAPI({ Action: action, Version: version, method: 'GET', query });
    const err = r.ResponseMetadata && r.ResponseMetadata.Error;
    console.log(`[${action}@${version}] ` + (err ? ('ERR ' + err.Code + ' ' + err.Message) : ('OK ' + JSON.stringify(r).slice(0, 1600))));
  } catch (e) { console.log(`[${action}@${version}] THROW ` + String(e.message || e).slice(0, 200)); }
}
(async () => {
  const q = { SmsAccount: ACC, PhoneNumber: '19913338881', Phone: '19913338881', MessageID: 'e7bac2f7-1cdb-4d4d-8e79-212de075e1b2' };
  for (const v of ['2021-01-11', '2020-01-01']) {
    for (const a of ['GetSmsSendRecord', 'ListSmsSendRecord', 'GetSmsSendRecords', 'DescribeSmsSendRecords', 'QuerySmsSendRecord', 'GetSmsSendDetails']) {
      await go(a, v, q);
    }
  }
  process.exit(0);
})().catch((e) => { console.log('FATAL', String(e && e.message || e)); process.exit(1); });
