// 只读：打印 Service 方法实现，确认参数/body 编码方式（不发请求）
const { Service } = require('@volcengine/openapi');
const svc = new Service({ host: 'x', serviceName: 'volcSMS', region: 'cn-north-1', accessKeyId: 'a', secretKey: 'b' });
for (const m of ['fetchOpenAPI', 'createJSONAPI', 'createAPI']) {
  try { console.log('===== ' + m + ' ====='); console.log(String(svc[m]).slice(0, 1800)); } catch (e) { console.log(m, 'NA', e.message); }
}
process.exit(0);
