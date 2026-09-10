const test = require('node:test');
const assert = require('node:assert');
const config = require('../config');
const storage = require('../services/storage');

test('localDriver：put→publicUrl→getBuffer→remove 行为与历史一致', async () => {
  config.upload.oss.enabled = false;
  const drv = storage.getStorage();
  assert.strictEqual(drv.driver, 'local');
  const key = `ai/_test_${Date.now()}.bin`;
  const body = Buffer.from('hello-storage');
  const r = await drv.put({ key, body, contentType: 'application/octet-stream' });
  assert.strictEqual(r.url, `/uploads/${key}`);
  const got = await drv.getBuffer(key);
  assert.deepStrictEqual(got, body);
  assert.strictEqual(await drv.signedUrl(key), `/uploads/${key}`);
  await drv.remove(key);
  await assert.rejects(() => drv.getBuffer(key));
});

test('OSS 开关打开但缺凭证/依赖：优雅降级本地，不抛错、不硬编码密钥', async () => {
  delete process.env.OSS_ACCESS_KEY_ID;
  delete process.env.OSS_ACCESS_KEY_SECRET;
  delete process.env.OSS_BUCKET;
  delete process.env.OSS_REGION;
  config.upload.oss.enabled = true;
  const drv = storage.getStorage();
  assert.strictEqual(drv.driver, 'local', '缺凭证必须降级 local');
  const key = `ai/_test_fallback_${Date.now()}.txt`;
  const r = await storage.put({ key, body: Buffer.from('x') });
  assert.strictEqual(r.url, `/uploads/${key}`);
  await storage.getStorage().remove(key);
  config.upload.oss.enabled = false;
});
