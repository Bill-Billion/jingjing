// AI 生产化：webhook 验签/幂等、轮询与回调 CAS 互斥、交付物版本不覆盖、重做新版本、审核流转
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const TMP = path.join(os.tmpdir(), `jjsr_ai_${process.pid}_${Date.now()}.db`);
process.env.SQLITE_PATH = TMP;
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = 'test_secret_at_least_32_chars_long_xx';
process.env.ARK_API_KEY = 'test_ark_key_for_hmac';

const db = require('../db');
const config = require('../config');
const visual = require('../services/volcVisual');

function mkTask({ upstream = 'up' + Date.now() + Math.random(), prompt = '正常祝福语', status = 'running' } = {}) {
  const now = Date.now();
  const info = db.prepare(`INSERT INTO ai_generation_tasks
    (task_type,upstream_id,user_id,status,model,request_json,cost_fen,created_at,updated_at)
    VALUES ('seedance_t2v',?,1,?,'m',?,100,?,?)`)
    .run(upstream, status, JSON.stringify({ prompt }), now, now);
  return info.lastInsertRowid;
}
function sign(body, secret = 'test_ark_key_for_hmac') {
  return crypto.createHmac('sha256', secret).update(Buffer.from(body)).digest('hex');
}
function versions(id) { return db.prepare('SELECT * FROM deliverable_versions WHERE task_id=? ORDER BY version_no').all(id); }

test('webhook 验签：错误签名拒绝、缺密钥拒绝', async () => {
  const id = mkTask();
  const body = JSON.stringify({ id: db.prepare('SELECT upstream_id u FROM ai_generation_tasks WHERE id=?').get(id).u, status: 'succeeded' });
  await assert.rejects(() => visual.handleSupplierWebhook(body, 'deadbeef'), /验签/);
  assert.strictEqual(visual.verifyWebhookSig(body, sign(body)), true);
  assert.strictEqual(visual.verifyWebhookSig(body, ''), false);
});

test('合法 webhook 成功推进并幂等：重复回调不重复出版本', async () => {
  const up = 'up_ok_' + Date.now();
  const id = mkTask({ upstream: up });
  const body = JSON.stringify({ id: up, status: 'succeeded', usage: { tokens: 1 } });
  const r1 = await visual.handleSupplierWebhook(body, sign(body));
  assert.strictEqual(r1.ok, true);
  const t = db.prepare('SELECT * FROM ai_generation_tasks WHERE id=?').get(id);
  assert.strictEqual(t.status, 'succeeded');
  assert.strictEqual(t.deliverable_status, 'approved'); // 默认不开审核=现状
  assert.strictEqual(versions(id).length, 1);
  assert.strictEqual(versions(id)[0].source, 'webhook');
  // 再来一次回调：幂等，不新增版本
  const r2 = await visual.handleSupplierWebhook(body, sign(body));
  assert.strictEqual(r2.duplicated, true);
  assert.strictEqual(versions(id).length, 1);
});

test('轮询与回调 CAS 互斥：先 finalize 者推进，另一方不重复', async () => {
  const id = mkTask();
  const a = await visual.finalizeSucceeded(id, { resultUrl: '/uploads/ai/a.mp4', source: 'poll' });
  assert.strictEqual(a.ok, true);
  const b = await visual.finalizeSucceeded(id, { resultUrl: '/uploads/ai/b.mp4', source: 'webhook' });
  assert.strictEqual(b.ok, false);
  assert.strictEqual(b.why, 'already_terminal');
  // 旧文件 URL 不被覆盖
  const t = db.prepare('SELECT result_url FROM ai_generation_tasks WHERE id=?').get(id);
  assert.strictEqual(t.result_url, '/uploads/ai/a.mp4');
  assert.strictEqual(versions(id).length, 1);
});

test('重做生成新版本行：parent 关联、版本号递增、不覆盖旧文件', async () => {
  const p = mkTask();
  await visual.finalizeSucceeded(p, { resultUrl: '/uploads/ai/v1.mp4', source: 'poll' });
  const child = visual.regenerateTask(p, { reason: '客户要求重做' });
  assert.strictEqual(child.parent_task_id, p);
  assert.strictEqual(child.version_no, 2);
  await visual.finalizeSucceeded(child.id, { resultUrl: '/uploads/ai/v2.mp4', source: 'poll', reason: '客户要求重做' });
  assert.strictEqual(db.prepare('SELECT result_url FROM ai_generation_tasks WHERE id=?').get(p).result_url, '/uploads/ai/v1.mp4');
  assert.strictEqual(db.prepare('SELECT result_url FROM ai_generation_tasks WHERE id=?').get(child.id).result_url, '/uploads/ai/v2.mp4');
  assert.strictEqual(versions(p).length, 1);
  assert.strictEqual(versions(child.id)[0].version_no, 2);
});

test('审核开关开启：干净内容 pending_review→人工 approve；命中敏感词直接 rejected', async () => {
  const saved = config.aiDeliverable.reviewEnabled;
  config.aiDeliverable.reviewEnabled = true;
  // 干净：待人工
  const id1 = mkTask({ prompt: '祝开业大吉，生意兴隆' });
  const f1 = await visual.finalizeSucceeded(id1, { source: 'webhook' });
  assert.strictEqual(f1.deliverable, 'pending_review');
  visual.reviewDeliverable(id1, 'approve', { reviewerId: 7 });
  assert.strictEqual(db.prepare('SELECT deliverable_status FROM ai_generation_tasks WHERE id=?').get(id1).deliverable_status, 'approved');
  // 命中本地敏感词：直接驳回
  const id2 = mkTask({ prompt: '这里含有法轮功违规词' });
  const f2 = await visual.finalizeSucceeded(id2, { source: 'webhook' });
  assert.strictEqual(f2.deliverable, 'rejected');
  assert.throws(() => visual.reviewDeliverable(id2, 'approve', {}), /待审核/);
  config.aiDeliverable.reviewEnabled = saved;
});

test.after(() => { try { for (const e of ['', '-wal', '-shm']) fs.unlinkSync(TMP + e); } catch (e) {} });
