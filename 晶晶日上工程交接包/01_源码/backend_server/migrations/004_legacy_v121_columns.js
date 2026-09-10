// 004_legacy_v121_columns.js - V12.1 历史补列（代言税率/身份更新时间/样片支付时间）
module.exports = {
  version: 4,
  name: 'legacy_v121_add_columns',
  up(db, { addColumnIfMissing }) {
    addColumnIfMissing('endorsement_orders', 'tax_rate REAL DEFAULT 0');
    addColumnIfMissing('user_identities', 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');
    addColumnIfMissing('sample_orders', 'pay_time DATETIME');
  },
};
