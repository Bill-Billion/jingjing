// 只读：GetSmsSendDetails 多参数组合，拿运营商投递回执（不发送）
const { Service } = require('@volcengine/openapi');
const config = require('/opt/jjsr/config');
const svc = new Service({
  host: 'sms.volcengineapi.com', serviceName: 'volcSMS', region: config.sms.region,
  accessKeyId: config.sms.accessKeyId, secretKey: config.sms.secretAccessKey,
});
const SUB = config.sms.smsAccount || '8d0968fa';
// 北京 15:00 / 15:55 -> UTC 07:00 / 07:55
const msStart = Date.parse('2026-09-01T07:00:00Z');
const msEnd = Date.parse('2026-09-01T07:55:00Z');
const fmt = (d, n) => { const p = (x) => String(x).padStart(2, '0'); return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + p(d.getUTCHours()) + (n >= 14 ? p(d.getUTCMinutes()) : '') + (n >= 16 ? p(d.getUTCSeconds()) : ''); };
const s14 = fmt(new Date(msStart), 14), e14 = fmt(new Date(msEnd), 14);
const s12 = fmt(new Date(msStart), 12), e12 = fmt(new Date(msEnd), 12);
async function go(label, query) {
  try {
    const r = await svc.fetchOpenAPI({ Action: 'GetSmsSendDetails', Version: '2021-01-11', method: 'GET', query });
    const err = r.ResponseMetadata && r.ResponseMetadata.Error;
    console.log('## ' + label + ' -> ' + (err ? ('ERR ' + err.Code + ' ' + err.Message) : 'OK'));
    if (!err) console.log(JSON.stringify(r, null, 2).slice(0, 4000));
  } catch (e) { console.log('## ' + label + ' THROW ' + String(e.message || e).slice(0, 200)); }
}
(async () => {
  await go('ms+PageNum', { subAccount: SUB, PhoneNumber: '19913338881', StartTime: msStart, EndTime: msEnd, PageNum: 1, PageSize: 20 });
  await go('yyyyMMddHHmmss', { subAccount: SUB, PhoneNumber: '19913338881', StartTime: s14, EndTime: e14, PageNum: 1, PageSize: 20 });
  await go('yyyyMMddHH', { subAccount: SUB, PhoneNumber: '19913338881', StartTime: s12, EndTime: e12, PageNum: 1, PageSize: 20 });
  await go('PhoneNumbers+SmsAccount', { subAccount: SUB, SmsAccount: SUB, PhoneNumbers: '19913338881', StartTime: msStart, EndTime: msEnd, PageNum: 1, PageSize: 20 });
  process.exit(0);
})().catch((e) => { console.log('FATAL', String(e && e.message || e)); process.exit(1); });
