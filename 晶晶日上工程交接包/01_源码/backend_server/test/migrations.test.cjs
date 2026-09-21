// 迁移机制测试：全新建到最新 / 旧库升级 / 重复执行幂等 / 001 与改造前生产结构等价
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const MIG_DIR = path.join(__dirname, '..', 'migrations');
const { runMigrations, appliedVersions } = require(path.join(MIG_DIR, 'runner'));

function tmpDb() {
  const f = path.join(os.tmpdir(), `jjsr_mig_${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
  const db = new Database(f);
  db.pragma('journal_mode = WAL');
  return { db, f };
}
function cleanup(f) {
  for (const ext of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + ext); } catch (e) {} }
}
function tables(db) {
  return db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((r) => r.name);
}
function cols(db, t) {
  return db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
}
function quietLogger() { return { info() {}, warn() {}, error() {} }; }

test('场景1 全新库：一次迁移到最新，版本齐全、新增工程表存在', () => {
  const { db, f } = tmpDb();
  try {
    const res = runMigrations(db, { dir: MIG_DIR, logger: quietLogger() });
    const migrated = res.filter((r) => r.migrated).map((r) => Number(r.version));
    assert.deepStrictEqual(migrated, [1, 2, 3, 4, 5]);
    assert.deepStrictEqual(appliedVersions(db).map(Number), [1, 2, 3, 4, 5]);
    const t = new Set(tables(db));
    // 58 张业务表 + schema_migrations + 005 新增两张
    assert.ok(t.has('users') && t.has('payments') && t.has('ai_generation_tasks'));
    assert.ok(t.has('schema_migrations'));
    assert.ok(t.has('reconciliation_runs'));
    assert.ok(t.has('deliverable_versions'));
    assert.strictEqual(t.size, 58 + 3);
    // 历史补列在全新库也存在（001 已折叠）
    assert.ok(cols(db, 'humans').includes('showreel_urls'));
    assert.ok(cols(db, 'sample_orders').includes('production_fee'));
    // 005 新列
    assert.ok(cols(db, 'refunds').includes('refund_kind'));
    assert.ok(cols(db, 'payment_transactions').includes('refunded_amount'));
    assert.ok(cols(db, 'ai_generation_tasks').includes('deliverable_status'));
  } finally { db.close(); cleanup(f); }
});

test('场景2 旧库升级：缺列老库经迁移补齐到最新且不重建已有表数据', () => {
  const { db, f } = tmpDb();
  try {
    // 1) 先用 001 建出"完整基线"，塞业务数据
    require(path.join(MIG_DIR, '001_initial.js')).up(db);
    db.prepare("INSERT INTO humans (id,name,province,city) VALUES (1,'老艺人','浙江','嘉兴')").run();
    db.prepare("INSERT INTO sample_orders (id,order_no) VALUES (9,'OLD-1')").run();
    db.prepare("INSERT INTO refunds (id,refund_no,order_no,order_type,amount) VALUES (1,'R1','OLD-1','video',100)").run();
    // 2) 反向移除 002~005 增量迁移会补的列与新表，模拟"改造前老库"
    const dropCols = {
      humans: ['showreel_urls', 'verified_level', 'quality_grade', 'subsidy_until', 'is_new_talent'],
      video_orders: ['redo_count', 'redo_available', 'scene_template_id', 'after_sales_status'],
      sample_orders: ['prepay_amount', 'preview_url', 'preview_status', 'preview_deadline',
        'intent_amount', 'production_fee', 'intent_paid', 'production_paid', 'step', 'genre',
        'reference_script_id', 'script_title', 'script_outline', 'script_characters', 'script_draft',
        'script_final', 'script_status', 'revision_count', 'script_feedback', 'redo_count',
        'contact_name', 'contact_phone', 'updated_at', 'pay_time'],
      mcn_agencies: ['free_until'],
      projects: ['fast_group_bonus'],
      authorization_agreements: ['license_term_months'],
      talent_deposits: ['collection_mode'],
      endorsement_orders: ['is_ad', 'auth_letter_url', 'tax_rate'],
      user_identities: ['updated_at'],
      // 注：005 新增列在 001 基线中本不存在，无需 DROP，迁移会直接 ADD
    };
    for (const [t, list] of Object.entries(dropCols)) {
      for (const c of list) db.exec(`ALTER TABLE ${t} DROP COLUMN ${c}`);
    }
    db.exec('DROP TABLE IF EXISTS reconciliation_runs; DROP TABLE IF EXISTS deliverable_versions;');
    assert.ok(!cols(db, 'humans').includes('showreel_urls'), '前置：老库确实缺列');
    assert.ok(!cols(db, 'refunds').includes('refund_kind'));
    // 3) 跑迁移链升级
    runMigrations(db, { dir: MIG_DIR, logger: quietLogger() });
    // 老数据保留
    assert.strictEqual(db.prepare('SELECT name FROM humans WHERE id=1').get().name, '老艺人');
    assert.strictEqual(db.prepare('SELECT order_no FROM sample_orders WHERE id=9').get().order_no, 'OLD-1');
    // 缺列被增量迁移补齐
    assert.ok(cols(db, 'humans').includes('showreel_urls') && cols(db, 'humans').includes('quality_grade'));
    assert.ok(cols(db, 'sample_orders').includes('intent_amount') && cols(db, 'sample_orders').includes('script_final') && cols(db, 'sample_orders').includes('pay_time'));
    assert.ok(cols(db, 'refunds').includes('refund_kind'));
    assert.ok(tables(db).includes('reconciliation_runs') && tables(db).includes('deliverable_versions'));
    assert.deepStrictEqual(appliedVersions(db).map(Number), [1, 2, 3, 4, 5]);
  } finally { db.close(); cleanup(f); }
});

test('场景3 重复执行幂等：第二次全部跳过、结构与版本不重复', () => {
  const { db, f } = tmpDb();
  try {
    runMigrations(db, { dir: MIG_DIR, logger: quietLogger() });
    const beforeTables = tables(db).length;
    const res2 = runMigrations(db, { dir: MIG_DIR, logger: quietLogger() });
    assert.ok(res2.every((r) => r.skipped));
    assert.strictEqual(tables(db).length, beforeTables);
    assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM schema_migrations').get().c, 5);
    // 再来一次仍稳定
    const res3 = runMigrations(db, { dir: MIG_DIR, logger: quietLogger() });
    assert.ok(res3.every((r) => r.skipped));
  } finally { db.close(); cleanup(f); }
});

test('等价性：001 初始迁移结构 == 改造前生产库（58表/列集合一致）', (t) => {
  // A default development database may have just been generated by tests; it is not a legacy reference.
  const livePath = process.env.JX_LEGACY_SQLITE_SNAPSHOT;
  if (!livePath) { t.skip('未提供显式脱敏旧库样本，未执行结构等价比较'); return; }
  assert.ok(fs.existsSync(livePath), '指定的旧库样本不存在');
  const { db: fresh, f } = tmpDb();
  let live;
  try {
    // 只执行 001
    const m001 = require(path.join(MIG_DIR, '001_initial.js'));
    m001.up(fresh);
    live = new Database(livePath, { readonly: true });
    // 005 工程化新增列（本地库可能已被迁移到最新，比较基线时剔除）
    const ignoreCols = {
      refunds: ['refund_kind', 'channel_status', 'idem_key'],
      payment_transactions: ['refunded_amount'],
      payments: ['refunded_amount_fen'],
      ai_generation_tasks: ['deliverable_status', 'version_no', 'parent_task_id', 'review_reason'],
    };
    const liveTables = tables(live).filter((t) => t !== 'schema_migrations' && t !== 'reconciliation_runs' && t !== 'deliverable_versions');
    for (const t of liveTables) {
      const skip = new Set(ignoreCols[t] || []);
      const a = cols(fresh, t).sort();
      const b = cols(live, t).filter((c) => !skip.has(c)).sort();
      assert.deepStrictEqual(a, b, `表 ${t} 列集合与改造前基线不一致`);
    }
    // 表数量一致（生产库尚未跑新迁移时应为 58）
    assert.strictEqual(liveTables.length, 58);
  } finally { fresh.close(); cleanup(f); if (live) live.close(); }
});
