// 只读探测 @volcengine/openapi 的可用入口（不实例化、不用密钥、不发送）
const volc = require('@volcengine/openapi');
console.log('TOP_EXPORTS=', Object.keys(volc).join(','));
console.log('VER=', require('@volcengine/openapi/package.json').version);
try {
  const sms = volc.sms || {};
  console.log('SMS_EXPORTS=', Object.keys(sms).join(','));
  if (sms.SmsService) console.log('SMS_PROTO_ALL=', Object.getOwnPropertyNames(sms.SmsService.prototype).join(','));
} catch (e) { console.log('SMS_EXPLORE_ERR', e.message); }
