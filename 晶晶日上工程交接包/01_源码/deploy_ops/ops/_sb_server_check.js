// 服务器侧沙箱链路实测：离线出 APP 订单串 + 真实查单（不创建真实付款、不残留）
const alipay = require('/opt/jjsr/services/alipay');
(async () => {
  console.log('status=' + JSON.stringify(alipay.status()));
  const out = 'SBT' + Date.now();
  const str = alipay.buildAppOrderString({ outTradeNo: out, amountFen: 1, subject: '沙箱联调1分' });
  console.log('orderString len=' + str.length + ' hasSign=' + /sign=/.test(str) + ' hasSandboxAppId=' + str.includes('9021000167659394') + ' hasSeller=' + str.includes(encodeURIComponent('2088721110933212')));
  try {
    const q = await alipay.queryTrade({ outTradeNo: out });
    console.log('query code=' + q.code + ' subCode=' + (q.sub_code || q.subCode) + ' msg=' + q.msg + ' tradeStatus=' + (q.trade_status || q.tradeStatus));
  } catch (e) { console.log('query THROW code=' + e.code + ' msg=' + e.message); }
  process.exit(0);
})().catch((e) => { console.log('FATAL', e.message); process.exit(1); });
