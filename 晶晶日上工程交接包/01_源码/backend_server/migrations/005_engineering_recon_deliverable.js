// 005_engineering_recon_deliverable.js
// 工程化整改新增：资金对账结果落表、AI 交付物版本化、退款/支付状态机增强列。
// 全部 IF NOT EXISTS / addColumnIfMissing，可重复执行；新增状态列默认值保证存量行为不变。
module.exports = {
  version: 5,
  name: 'engineering_recon_deliverable_refund',
  up(db, { exec, addColumnIfMissing }) {
    exec(`
      -- 每日/手动对账运行记录（订单账/支付账/退款账/结算账勾稽结果）
      CREATE TABLE IF NOT EXISTS reconciliation_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_date TEXT NOT NULL,
        scope TEXT NOT NULL DEFAULT 'daily',      -- daily | manual
        order_book INTEGER NOT NULL DEFAULT 0,    -- 订单应收（分）
        pay_book INTEGER NOT NULL DEFAULT 0,      -- 支付实收（分）
        refund_book INTEGER NOT NULL DEFAULT 0,   -- 已退（分）
        settle_book INTEGER NOT NULL DEFAULT 0,   -- 已结/待结给艺人/MCN（分）
        platform_book INTEGER NOT NULL DEFAULT 0, -- 平台收入（分）
        fee_tax_book INTEGER NOT NULL DEFAULT 0,  -- 渠道费/税费（分）
        diff_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'balanced',  -- balanced | diff
        detail TEXT,                              -- JSON 差异明细
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_recon_date ON reconciliation_runs(run_date);

      -- AI 交付物版本：重做/重生成生成新版本行，不覆盖旧文件；通过后才成为可交付物
      CREATE TABLE IF NOT EXISTS deliverable_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL,
        version_no INTEGER NOT NULL DEFAULT 1,
        result_url TEXT,
        result_meta TEXT,
        reason TEXT,                              -- 重做/重生成原因
        source TEXT NOT NULL DEFAULT 'poll',      -- poll | webhook | manual
        review_status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
        review_reason TEXT,
        reviewer_id INTEGER,
        reviewed_at INTEGER,
        created_at INTEGER NOT NULL,
        UNIQUE(task_id, version_no)
      );
      CREATE INDEX IF NOT EXISTS idx_deliver_task ON deliverable_versions(task_id, version_no);
      CREATE INDEX IF NOT EXISTS idx_deliver_review ON deliverable_versions(review_status);
    `);

    // 退款状态机增强：区分全退/部分退、记录渠道状态与幂等键，杜绝"插单即已退"
    addColumnIfMissing('refunds', 'refund_kind TEXT DEFAULT "full"'); // full | partial
    addColumnIfMissing('refunds', 'channel_status TEXT');             // 渠道返回状态
    addColumnIfMissing('refunds', 'idem_key TEXT');
    // 支付侧累计已退金额，用于部分退多次时的超额校验与状态区分（partial_refunded/refunded）
    addColumnIfMissing('payment_transactions', 'refunded_amount INTEGER DEFAULT 0');
    addColumnIfMissing('payments', 'refunded_amount_fen INTEGER DEFAULT 0');

    // AI 任务审核/版本字段。deliverable_status 默认 approved：存量与未开启审核开关时行为不变；
    // 开启 config.aiDeliverable.reviewEnabled 后，新任务显式置 pending_review，经机审/人工通过才交付。
    addColumnIfMissing('ai_generation_tasks', 'deliverable_status TEXT DEFAULT "approved"'); // pending_review|approved|rejected
    addColumnIfMissing('ai_generation_tasks', 'version_no INTEGER DEFAULT 1');
    addColumnIfMissing('ai_generation_tasks', 'parent_task_id INTEGER');
    addColumnIfMissing('ai_generation_tasks', 'review_reason TEXT');
  },
};
