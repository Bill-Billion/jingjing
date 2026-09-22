// routes/settlement.js - 钱包、结算、提现（V2：风控+审核+实名认证）
const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const config = require('../config');
const { genTxNo, genWithdrawNo, calculateWithdrawalFee } = require('../utils/settlement');
const { validate, v } = require('../middleware/validate');
const limits = require('../middleware/rateLimit');
const { maskBankCard } = require('../utils/crypto');
const router = express.Router();
const {rejectLegacyIdentity,assessLegacyIdentity} = require('../src/modules/legacy-safety');

// 钱包信息
router.get('/wallet', auth, (req, res) => {
  db.prepare('INSERT OR IGNORE INTO wallets (user_id) VALUES (?)').run(req.userId);
  const w = db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(req.userId);
  const identity = db.prepare('SELECT identity_type, status FROM user_identities WHERE user_id = ?').get(req.userId);
  res.json({
    balance: w.balance / 100,
    frozen: w.frozen / 100,
    pending: w.pending / 100,
    totalIncome: w.total_income / 100,
    totalWithdrawn: w.total_withdrawn / 100,
    bankCard: w.bank_card ? maskBankCard(w.bank_card) : '',
    alipayAccount: w.alipay_account || '',
    idVerified: false, // Old boolean has no verification provenance.
    identityType: identity ? identity.identity_type : 'personal',
    identityStatus: assessLegacyIdentity(identity).status,
    identityVerificationStatus: assessLegacyIdentity(identity).verificationStatus,
  });
});

// 交易流水
router.get('/transactions', auth, (req, res) => {
  const { type, page = 1, pageSize = 20 } = req.query;
  let sql = 'SELECT * FROM transactions WHERE user_id = ?';
  const params = [req.userId];
  if (type) { sql += ' AND type = ?'; params.push(type); }
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));
  const list = db.prepare(sql).all(...params);
  res.json({
    list: list.map(t => ({
      id: t.id, txNo: t.tx_no, type: t.type, amount: t.amount / 100,
      balanceAfter: t.balance_after / 100, orderType: t.order_type,
      description: t.description, status: t.status, date: t.created_at,
    })),
  });
});

// 提现记录
router.get('/withdrawals', auth, (req, res) => {
  const list = db.prepare('SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.userId);
  res.json({
    list: list.map(w => ({
      withdrawNo: w.withdraw_no, amount: w.amount / 100, fee: w.fee / 100,
      channel: w.channel, status: w.status, rejectReason: w.reject_reason,
      createdAt: w.created_at, processedAt: w.processed_at,
    })),
  });
});

// 绑定提现账户（需实名认证）
router.post('/bind-account', auth, rejectLegacyIdentity, validate({
  bankCard: [v.string],
  alipayAccount: [v.string],
}), (req, res) => {
  const { bankCard, alipayAccount } = req.body;
  const w = db.prepare('SELECT id_verified FROM wallets WHERE user_id = ?').get(req.userId);
  if (!w || !w.id_verified) {
    return res.status(403).json({ message: '请先完成实名认证' });
  }
  const { encrypt } = require('../utils/crypto');
  db.prepare('UPDATE wallets SET bank_card = ?, alipay_account = ? WHERE user_id = ?')
    .run(bankCard ? encrypt(bankCard) : '', alipayAccount || '', req.userId);
  res.json({ message: '绑定成功' });
});

// 申请提现（风控）
router.post('/withdraw', auth, rejectLegacyIdentity, limits.withdraw, validate({
  amount: [v.required, v.number, v.positive],
  channel: [v.required, v.enum('bank', 'alipay')],
}), (req, res) => {
  const amountFen = Math.round(Number(req.body.amount) * 100);
  const channel = req.body.channel;
  const w = db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(req.userId);
  if (!w || w.balance < amountFen) return res.status(400).json({ message: '余额不足' });

  // 实名认证
  if (!w.id_verified) return res.status(403).json({ message: '请先完成实名认证' });
  // 绑定账户
  if (channel === 'bank' && !w.bank_card) return res.status(400).json({ message: '请先绑定银行卡' });
  if (channel === 'alipay' && !w.alipay_account) return res.status(400).json({ message: '请先绑定支付宝' });
  // 最低/最高限额
  if (amountFen < config.risk.withdraw.minAmount) return res.status(400).json({ message: `最低提现${config.risk.withdraw.minAmount / 100}元` });
  if (amountFen > config.risk.withdraw.singleLimit) return res.status(400).json({ message: `单笔上限${config.risk.withdraw.singleLimit / 100}元` });

  // 单日限额
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayWithdrawn = db.prepare("SELECT COALESCE(SUM(amount),0) as total FROM withdrawals WHERE user_id = ? AND status != 'rejected' AND created_at >= ?")
    .get(req.userId, todayStart.toISOString()).total;
  if (todayWithdrawn + amountFen > config.risk.withdraw.dailyLimit) {
    return res.status(400).json({ message: '超出单日提现限额' });
  }

  // 新账户冷静期
  const user = db.prepare('SELECT created_at FROM users WHERE id = ?').get(req.userId);
  const accountAgeHours = (Date.now() - new Date(user.created_at).getTime()) / 3600000;
  if (accountAgeHours < config.risk.withdraw.newAccountCoolHours) {
    return res.status(400).json({ message: `新账户需等待${config.risk.withdraw.newAccountCoolHours}小时后可提现` });
  }

  const fee = calculateWithdrawalFee(amountFen);
  const withdrawNo = genWithdrawNo();
  const needManual = config.risk.withdraw.firstWithdrawManual &&
    !db.prepare("SELECT id FROM withdrawals WHERE user_id = ? AND status = 'success'").get(req.userId);

  const txn = db.transaction(() => {
    db.prepare('UPDATE wallets SET balance = balance - ?, frozen = frozen + ? WHERE user_id = ?')
      .run(amountFen, amountFen, req.userId);
    db.prepare(`INSERT INTO withdrawals (withdraw_no, user_id, amount, fee, channel, account, status)
      VALUES (?,?,?,?,?,?,?)`).run(
      withdrawNo, req.userId, amountFen, fee, channel,
      channel === 'bank' ? maskBankCard(require('../utils/crypto').decrypt(w.bank_card)) : w.alipay_account,
      needManual ? 'reviewing' : 'pending'
    );
    db.prepare(`INSERT INTO transactions (tx_no, user_id, type, amount, balance_after, description, status)
      VALUES (?,?,?,?,?,?,?)`).run(genTxNo(), req.userId, 'withdraw', -amountFen,
      w.balance - amountFen, `提现-${amountFen / 100}元（手续费${fee / 100}元）`, 'pending');
  });
  txn();

  res.json({
    withdrawNo, fee: fee / 100,
    message: needManual ? '提现申请已提交，首笔需人工审核，1-3个工作日到账' : '提现申请已提交，1-3个工作日到账',
  });
});

// 结算汇总
router.get('/summary', auth, (req, res) => {
  const videoIncome = db.prepare(`SELECT COALESCE(SUM(net_amount),0) as total, COUNT(*) as cnt
    FROM video_orders WHERE talent_id IN (SELECT id FROM humans WHERE user_id = ?) AND settle_status = 'settled'`).get(req.userId);
  const endorsementIncome = db.prepare(`SELECT COALESCE(SUM(net_amount),0) as total, COUNT(*) as cnt
    FROM endorsement_orders WHERE talent_id IN (SELECT id FROM humans WHERE user_id = ?) AND settle_status = 'settled'`).get(req.userId);
  const pending = db.prepare(`SELECT COALESCE(SUM(net_amount),0) as total, COUNT(*) as cnt
    FROM video_orders WHERE talent_id IN (SELECT id FROM humans WHERE user_id = ?) AND settle_status = 'unsettled' AND status IN ('paid','delivering','delivered')`).get(req.userId);
  res.json({
    video: { total: videoIncome.total / 100, count: videoIncome.cnt },
    endorsement: { total: endorsementIncome.total / 100, count: endorsementIncome.cnt },
    pending: { total: pending.total / 100, count: pending.cnt },
  });
});

module.exports = router;
