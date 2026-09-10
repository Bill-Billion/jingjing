// 只读：GetSmsSendDetails 查询 19913338881 短信投递回执（不发送）
const { Service } = require('@volcengine/openapi');
const config = require('/opt/jjsr/config');
const svc = new Service({
  host: 'sms.volcengineapi.com', serviceName: 'volcSMS', region: config.sms.region,
  accessKeyId: config.sms.accessKeyId, secretKey: config.sms.secretAccessKey,
});
async function go(label, query) {
  try {
    const r = await svc.fetchOpenAPI({ Action: 'GetSmsSendDetails', Version: '2021-01-11', method: 'GET', query });
    const err = r.ResponseMetadata && r.ResponseMetadata.Error;
    console.log('## ' + label + ' -> ' + (err ? ('ERR ' + err.Code + ' ' + err.Message) : 'OK'));
    console.log(JSON.stringify(r, null, 2).slice(0, 4000));
  } catch (e) { console.log('## ' + label + ' THROW ' + String(e.message || e).slice(0, 250)); }
}
(async () => {
  const base = { subAccount: config.sms.smsAccount || config.sms.account || '8d0968fa', PhoneNumber: '19913338881' };
  await go('minimal', base);
  await go('withTimePage', Object.assign({}, base, {
    StartTime: '202609011500', EndTime: '202609011630', PageNum: 1, PageSize: 20,
  }));
  await go('withPageObj', Object.assign({}, base, {
    StartTime: '202609011500', EndTime: '202609011630', Page: JSON.stringify({ PageNum: 1, PageSize: 20 }),
  }));
  process.exit(0);
})().catch((e) => { console.log('FATAL', String(e && e.message || e)); process.exit(1); });
