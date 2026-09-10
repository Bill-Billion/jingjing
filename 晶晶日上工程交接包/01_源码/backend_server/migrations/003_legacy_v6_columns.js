// 003_legacy_v6_columns.js - V6.0 样片/定制剧历史补列（老库升级；全新库 001 已含，自动跳过）
module.exports = {
  version: 3,
  name: 'legacy_v6_add_columns',
  up(db, { addColumnIfMissing }) {
    const cols = [
      ['sample_orders', 'intent_amount INTEGER DEFAULT 100000'],
      ['sample_orders', 'production_fee INTEGER DEFAULT 400000'],
      ['sample_orders', 'intent_paid INTEGER DEFAULT 0'],
      ['sample_orders', 'production_paid INTEGER DEFAULT 0'],
      ['sample_orders', 'step INTEGER DEFAULT 0'],
      ['sample_orders', 'genre TEXT'],
      ['sample_orders', 'reference_script_id INTEGER'],
      ['sample_orders', 'script_title TEXT'],
      ['sample_orders', 'script_outline TEXT'],
      ['sample_orders', 'script_characters TEXT'],
      ['sample_orders', 'script_draft TEXT'],
      ['sample_orders', 'script_final TEXT'],
      ['sample_orders', 'script_status TEXT DEFAULT "pending"'],
      ['sample_orders', 'revision_count INTEGER DEFAULT 0'],
      ['sample_orders', 'script_feedback TEXT'],
      ['sample_orders', 'redo_count INTEGER DEFAULT 0'],
      ['sample_orders', 'contact_name TEXT'],
      ['sample_orders', 'contact_phone TEXT'],
      ['sample_orders', 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP'],
    ];
    for (const [t, ddl] of cols) addColumnIfMissing(t, ddl);
  },
};
