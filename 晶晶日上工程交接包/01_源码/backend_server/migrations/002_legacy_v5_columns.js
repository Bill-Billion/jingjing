// 002_legacy_v5_columns.js - V5.0 历史补列（老库升级用；001 全新库已含这些列，会自动跳过）
module.exports = {
  version: 2,
  name: 'legacy_v5_add_columns',
  up(db, { addColumnIfMissing }) {
    const cols = [
      ['humans', 'showreel_urls TEXT'],
      ['humans', 'verified_level TEXT DEFAULT "none"'],
      ['humans', 'quality_grade TEXT DEFAULT "B"'],
      ['humans', 'subsidy_until DATETIME'],
      ['humans', 'is_new_talent INTEGER DEFAULT 0'],
      ['video_orders', 'redo_count INTEGER DEFAULT 0'],
      ['video_orders', 'redo_available INTEGER DEFAULT 1'],
      ['video_orders', 'scene_template_id INTEGER'],
      ['video_orders', 'after_sales_status TEXT'],
      ['sample_orders', 'prepay_amount INTEGER DEFAULT 0'],
      ['sample_orders', 'preview_url TEXT'],
      ['sample_orders', 'preview_status TEXT'],
      ['sample_orders', 'preview_deadline DATETIME'],
      ['mcn_agencies', 'free_until DATETIME'],
      ['projects', 'fast_group_bonus INTEGER DEFAULT 0'],
      ['authorization_agreements', 'license_term_months INTEGER DEFAULT 36'],
      ['talent_deposits', 'collection_mode TEXT DEFAULT "first_income"'],
      ['endorsement_orders', 'is_ad INTEGER DEFAULT 1'],
      ['endorsement_orders', 'auth_letter_url TEXT'],
    ];
    for (const [t, ddl] of cols) addColumnIfMissing(t, ddl);
  },
};
