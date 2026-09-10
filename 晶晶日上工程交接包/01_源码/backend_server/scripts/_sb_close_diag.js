// 一次性：关闭诊断阶段在沙箱创建的两笔 0.01 未付款测试单（幂等，已关闭/不存在不报错）
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
const targets = [
  { out_trade_no: 'DIAGC1788240553584', trade_no: '2026090122001433220509237610' },
  { out_trade_no: 'DIAGC1788240553584b', trade_no: '2026090122001433220509239350' },
];
(async () => {
  for (const t of targets) {
    try {
      const r = await client.exec('alipay.trade.close', { bizContent: t }, { validateSign: false });
      const x = r && (r.alipayTradeCloseResponse || r);
      console.log(t.out_trade_no, '->', x && (x.code || x.subCode), x && (x.subMsg || x.msg || ''));
    } catch (e) { console.log(t.out_trade_no, 'ERR', String(e.message).slice(0, 120)); }
  }
  process.exit(0);
})();
