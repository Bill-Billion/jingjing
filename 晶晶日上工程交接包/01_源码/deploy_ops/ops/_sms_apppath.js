// 诊断：走与 App 完全一致的 sendLoginCode 全链路真实下发，并打印实际使用的签名/模板（不打印密钥）
const sms = require('/opt/jjsr/services/smsService');
const config = require('/opt/jjsr/config');
const S = config.sms;
console.log('BACKEND_USING Sign=%j Tpl=%j Account=%j region=%j enabled=%j env=%j',
  S.signName, S.loginTemplateId, S.smsAccount, S.region, S.enabled, config.env);
(async () => {
  const r = await sms.sendLoginCode('19913338881', 'login', 'manual-diag');
  console.log('SEND_RESULT=', JSON.stringify(r));
  setTimeout(() => process.exit(0), 500);
})().catch((e) => { console.log('SEND_ERR status=%s code=%j msg=%j', e.status, e.providerCode || '', e.message); process.exit(1); });
