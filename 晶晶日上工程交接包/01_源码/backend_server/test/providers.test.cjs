const test = require('node:test');
const assert = require('node:assert');

const providers = require('../services/providers');
const alert = require('../services/alert');
const appleIap = require('../services/providers/appleIap');

test('providerStatus 返回六类通道就绪度且不含任何密钥字段', () => {
  const s = providers.providerStatus();
  for (const k of ['storage', 'moderation', 'sms', 'ai', 'payment', 'alert']) assert.ok(k in s, '缺 ' + k);
  const flat = JSON.stringify(s);
  assert.ok(!/secret|password|apiKey|accessKey/i.test(flat.replace(/Ready|Wanted|mockAllowed/g, '')), '就绪度不应含密钥');
});

test('alert 未配置 webhook 时只落日志、不外发、不抛错', async () => {
  const before = process.env.ALERT_WEBHOOK_URL;
  delete process.env.ALERT_WEBHOOK_URL;
  const r = await alert.emit('unit_test_event', { x: 1 }, { throttle: false });
  assert.strictEqual(r.sent, false);
  assert.strictEqual(r.reason, 'no_webhook');
  if (before) process.env.ALERT_WEBHOOK_URL = before;
});

test('Apple IAP 缺共享密钥/缺票据时拒绝，绝不伪造成功', async () => {
  const before = process.env.APPLE_IAP_SHARED_SECRET;
  delete process.env.APPLE_IAP_SHARED_SECRET;
  await assert.rejects(() => appleIap.verifyReceipt('xyz'), /APPLE_IAP_SHARED_SECRET/);
  await assert.rejects(() => appleIap.verifyReceipt(''), /receiptData/);
  if (before) process.env.APPLE_IAP_SHARED_SECRET = before;
});
