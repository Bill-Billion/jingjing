// 资金对账与退款状态机测试：临时库构造数据，覆盖 成功/全退/部分退/重复回调/渠道失败 账平
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = path.join(os.tmpdir(), `jjsr_fin_${process.pid}_${Date.now()}.db`);
process.env.SQLITE_PATH = TMP;
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = 'test_secret_at_least_32_chars_long_xx';

const db = require('../db');
const config = require('../config');
const paymentService = require('../services/paymentService');
const recon = require('../services/reconciliation');
const { calculateFees } = require('../utils/settlement');

let seq = 0;
function mkPaidVideo(amount = 10000) {
  const orderNo = 'T' + Date.now() + '_' + (++seq);
  const fees = calculateFees(amount, 'personal', config.aiCost.video, 0); // 99引流档0平台费
  db.prepare(`INSERT INTO video_orders
    (order_no,user_id,talent_id,amount,platform_fee,ai_cost,tax_amount,tax_rate,net_amount,status,pay_time)
    VALUES (?,?,?,?,?,?,?,?,?, 'paid', CURRENT_TIMESTAMP)`)
    .run(orderNo, 1, 2, fees.amount, fees.platformFee, fees.aiCost, fees.taxAmount, fees.taxRate, fees.netAmount);
  const txNo = 'TX' + (++seq) + Date.now();
  db.prepare(`INSERT INTO payment_transactions (tx_no,order_no,order_type,channel,channel_txn_no,amount,status,callback_at)
    VALUES (?,?, 'video','mock',?,?, 'success',CURRENT_TIMESTAMP)`)
    .run(txNo, orderNo, 'CH' + seq, amount);
  return { orderNo, txNo, amount, fees };
}
function diffsFor(result, orderNo) { return result.diffs.filter((d) => d.orderNo === orderNo); }

test('成功（无退款）：四账守恒、reconcile 无该单差异', () => {
  const o = mkPaidVideo(10000);
  const r = recon.runReconciliation(db);
  assert.deepStrictEqual(diffsFor(r, o.orderNo), []);
  const mo = r.perOrder.find((x) => x.orderNo === o.orderNo);
  assert.strictEqual(mo.received, 10000);
  assert.strictEqual(mo.refunded, 0);
});

test('全额退款：kind=full、支付单 refunded、账仍平', async () => {
  const o = mkPaidVideo(10000);
  const res = await paymentService.refund(o.orderNo, 10000, '全额退', 9);
  assert.strictEqual(res.kind, 'full');
  const pay = db.prepare('SELECT * FROM payment_transactions WHERE order_no=?').get(o.orderNo);
  assert.strictEqual(pay.status, 'refunded');
  assert.strictEqual(pay.refunded_amount, 10000);
  const rf = db.prepare("SELECT * FROM refunds WHERE order_no=? AND status='success'").get(o.orderNo);
  assert.strictEqual(rf.refund_kind, 'full');
  const r = recon.runReconciliation(db);
  assert.deepStrictEqual(diffsFor(r, o.orderNo), []);
});

test('部分退两次到全退：partial→refunded，超额被拒，账平', async () => {
  const o = mkPaidVideo(10000);
  const r1 = await paymentService.refund(o.orderNo, 4000, '部分退1');
  assert.strictEqual(r1.kind, 'partial');
  let pay = db.prepare('SELECT * FROM payment_transactions WHERE order_no=?').get(o.orderNo);
  assert.strictEqual(pay.status, 'partially_refunded');
  assert.strictEqual(pay.refunded_amount, 4000);
  // 再退超过剩余应被拒
  await assert.rejects(() => paymentService.refund(o.orderNo, 7000, '超额'), /超额/);
  // 退清剩余
  const r2 = await paymentService.refund(o.orderNo, 6000, '部分退2');
  assert.strictEqual(r2.kind, 'full');
  pay = db.prepare('SELECT * FROM payment_transactions WHERE order_no=?').get(o.orderNo);
  assert.strictEqual(pay.status, 'refunded');
  assert.strictEqual(pay.refunded_amount, 10000);
  // 已全退再退必须失败（无 success/partially 支付单）
  await assert.rejects(() => paymentService.refund(o.orderNo, 1, '多退'), /无成功支付/);
  const rr = recon.runReconciliation(db);
  assert.deepStrictEqual(diffsFor(rr, o.orderNo), []);
});

test('重复回调/重复请求幂等：同 idemKey 不重复出款', async () => {
  const o = mkPaidVideo(10000);
  const opt = { idemKey: 'cb-evt-001' };
  const a = await paymentService.refund(o.orderNo, 3000, '回调退款', 9, opt);
  const b = await paymentService.refund(o.orderNo, 3000, '回调退款', 9, opt);
  assert.strictEqual(b.duplicated, true);
  assert.strictEqual(a.refundNo, b.refundNo);
  const succ = db.prepare("SELECT COUNT(*) c FROM refunds WHERE order_no=? AND status='success'").get(o.orderNo).c;
  assert.strictEqual(succ, 1);
  const pay = db.prepare('SELECT refunded_amount FROM payment_transactions WHERE order_no=?').get(o.orderNo);
  assert.strictEqual(pay.refunded_amount, 3000); // 未翻倍
});

test('渠道不可用（生产无持牌渠道）：退款单 rejected、支付单不动、绝不假退', async () => {
  const savedEnv = config.env;
  config.env = 'production'; // 生产环境 getProvider(mock) 直接抛错
  const o = mkPaidVideo(10000);
  await assert.rejects(() => paymentService.refund(o.orderNo, 10000, 'x'), /持牌|Mock|支付/);
  const rf = db.prepare('SELECT * FROM refunds WHERE order_no=?').get(o.orderNo);
  assert.strictEqual(rf.status, 'rejected');
  const pay = db.prepare('SELECT status,refunded_amount FROM payment_transactions WHERE order_no=?').get(o.orderNo);
  assert.strictEqual(pay.status, 'success'); // 未被标记退款
  assert.strictEqual(pay.refunded_amount, 0);
  config.env = savedEnv;
});

test('runAndReport 落表：balanced 状态与汇总写入 reconciliation_runs', async () => {
  const before = db.prepare('SELECT COUNT(*) c FROM reconciliation_runs').get().c;
  const r = await recon.runAndReport(db, { scope: 'manual' });
  const after = db.prepare('SELECT COUNT(*) c FROM reconciliation_runs').get().c;
  assert.strictEqual(after, before + 1);
  assert.ok(typeof r.balanced === 'boolean');
  const row = db.prepare('SELECT * FROM reconciliation_runs WHERE id=?').get(r.id);
  assert.strictEqual(row.scope, 'manual');
  assert.strictEqual(row.status, r.balanced ? 'balanced' : 'diff');
});

test('对账能抓出坏账：费用结构错配 + 已支付状态却无支付流水', () => {
  // 坏单1：拆分金额之和对不上 amount（net 被多写 100）
  const bad1 = 'BADSPLIT' + (++seq);
  db.prepare(`INSERT INTO video_orders (order_no,user_id,amount,platform_fee,ai_cost,tax_amount,net_amount,status)
    VALUES (?,1,10000,0,1500,0,8600,'paid')`).run(bad1);
  db.prepare(`INSERT INTO payment_transactions (tx_no,order_no,order_type,channel,amount,status) VALUES (?,?, 'video','mock',10000,'success')`).run('TXB' + seq, bad1);
  // 坏单2：状态 paid 但没有任何支付流水
  const bad2 = 'NOPAY' + (++seq);
  db.prepare(`INSERT INTO video_orders (order_no,user_id,amount,platform_fee,ai_cost,tax_amount,net_amount,status)
    VALUES (?,1,5000,0,0,0,5000,'paid')`).run(bad2);
  const r = recon.runReconciliation(db);
  const types = new Set(r.diffs.map((d) => d.type));
  assert.ok(types.has('fee_split_mismatch'), '应抓出费用结构错配');
  assert.ok(types.has('paid_without_payment'), '应抓出有单无支付');
  assert.ok(r.diffs.some((d) => d.orderNo === bad1));
  assert.ok(r.diffs.some((d) => d.orderNo === bad2));
  assert.strictEqual(r.balanced, false);
});

test.after(() => { try { for (const e of ['', '-wal', '-shm']) fs.unlinkSync(TMP + e); } catch (e) {} });
