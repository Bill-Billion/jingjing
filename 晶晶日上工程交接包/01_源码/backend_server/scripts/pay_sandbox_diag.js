// 一次性诊断：打印沙箱 trade.query / trade.create 的原始响应与错误结构
const fs = require('fs');
const path = require('path');
const SB_DIR = path.join(__dirname, '..', 'secrets', 'alipay', 'sandbox');
const read = (f) => fs.readFileSync(path.join(SB_DIR, f), 'utf8').trim();
const { AlipaySdk } = require('alipay-sdk');
const client = new AlipaySdk({
  appId: '9021000167659394',
  privateKey: read('sandbox_app_private_key.pem'),
  alipayPublicKey: read('sandbox_alipay_public_key.pem'),
  signType: 'RSA2', keyType: 'PKCS8',
  gateway: 'https://openapi-sandbox.dl.alipaydev.com/gateway.do', timeout: 15000,
});
function dumpErr(tag, e) {
  console.log('=== ' + tag + ' ERROR ===');
  console.log('name=', e && e.name, '| message=', JSON.stringify(e && e.message), '| code=', e && e.code);
  console.log('keys=', Object.getOwnPropertyNames(e || {}));
  for (const k of ['responseText', 'res', 'data', 'response', 'body', 'status', 'statusCode']) {
    if (e && e[k] !== undefined) console.log(k, '=>', typeof e[k] === 'string' ? e[k].slice(0, 600) : JSON.stringify(e[k]).slice(0, 600));
  }
  console.log('stack=', String(e && e.stack).split('\n').slice(0, 4).join(' | '));
}
(async () => {
  // 1) query 不存在单，不验签，看原始
  try {
    const r = await client.exec('alipay.trade.query', { bizContent: { out_trade_no: 'DIAG' + Date.now() } }, { validateSign: false });
    console.log('=== QUERY RAW ===');
    console.log(JSON.stringify(r, null, 2).slice(0, 1500));
  } catch (e) { dumpErr('QUERY', e); }

  // 2) create validateSign:false 看原始业务响应
  const outNo = 'DIAGC' + Date.now();
  try {
    const r = await client.exec('alipay.trade.create', { bizContent: {
      out_trade_no: outNo, total_amount: '0.01', subject: 'diag', buyer_id: '2088722110933222',
    } }, { validateSign: false });
    console.log('=== CREATE RAW (validateSign false) ===');
    console.log(JSON.stringify(r, null, 2).slice(0, 1500));
  } catch (e) { dumpErr('CREATE-nosign', e); }

  // 3) create validateSign:true 看错误细节
  try {
    const r = await client.exec('alipay.trade.create', { bizContent: {
      out_trade_no: outNo + 'b', total_amount: '0.01', subject: 'diag2', buyer_id: '2088722110933222',
    } }, { validateSign: true });
    console.log('=== CREATE RAW (validateSign true) ===');
    console.log(JSON.stringify(r, null, 2).slice(0, 1500));
  } catch (e) { dumpErr('CREATE-sign', e); }
  process.exit(0);
})();
