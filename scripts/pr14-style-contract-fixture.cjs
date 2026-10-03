'use strict';

// Trusted fixture setup for visual read checks only. No HTTP permission override
// and no signature/payment fact. The frontend still signs in and reads normally.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');

async function main() {
  assert(process.argv.includes('--test-only'), 'Explicit --test-only is required');
  const statePath = path.join(root, '.local/pr14-ui-runtime.json');
  const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
  const env = JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE || '/Users/yanghaoran/Code/jingjing-ux/.local/mysql/runtime/test-env.json', 'utf8'));
  assert.equal(state.testOnly, true); assert(/^jx_test_\d+_[a-f0-9]{12}$/.test(state.schema));
  assert.equal(env.NODE_ENV, 'test'); assert.equal(env.MYSQL_HOST, '127.0.0.1');
  assert.equal(String(env.MYSQL_PORT), '33316'); assert.equal(env.MYSQL_USER, 'jx_local');
  assert.equal(env.MYSQL_DATABASE, 'jx_dev'); assert.equal(state.apiUrl, 'http://127.0.0.1:3242');
  process.kill(state.pid, 0);
  const fromBackend = createRequire(path.join(root, '晶晶日上工程交接包/01_源码/backend_server/package.json'));
  const { openDatabase } = fromBackend('./src/infrastructure/database');
  const { sealUnsignedContent, verifyUnsignedContent } = fromBackend('./src/modules/governance/content');
  const db = await openDatabase({ ...env, MYSQL_DATABASE: state.schema });
  let snapshot;
  try {
    snapshot = await db.withTransaction(async tx => {
      const sourceRef = 'synthetic:pr14:gallery-contract-read-v1';
      const [[existing]] = await tx.execute('SELECT content_json FROM governance_snapshots WHERE source_ref=?', [sourceRef]);
      if (existing) return verifyUnsignedContent(typeof existing.content_json === 'string' ? JSON.parse(existing.content_json) : existing.content_json);
      const [[rule]] = await tx.execute('SELECT content_json,current_status,effective_at FROM governance_rules WHERE id=?', [state.ruleId]);
      assert(rule); assert.equal(rule.current_status, 'EFFECTIVE');
      const parties = [state.accounts.owner.personalPartyId, state.accounts.otherOwner.personalPartyId];
      const readers = [state.accounts.owner.accountId, state.accounts.otherOwner.accountId];
      for (let i = 0; i < readers.length; i++) {
        const [[member]] = await tx.execute('SELECT a.current_status AS account_status,m.current_status AS membership_status FROM identity_accounts a JOIN party_memberships m ON m.account_id=a.id WHERE a.id=? AND m.party_id=?', [readers[i], parties[i]]);
        assert.equal(member?.account_status, 'ACTIVE'); assert.equal(member?.membership_status, 'ACTIVE');
      }
      const value = sealUnsignedContent({ id: randomUUID(), contract_version_id: randomUUID(), party_ids: parties,
        created_at: new Date().toISOString(), rules: [{ content: typeof rule.content_json === 'string' ? JSON.parse(rule.content_json) : rule.content_json,
          current_status: rule.current_status, effective_at: new Date(rule.effective_at.replace(' ', 'T') + 'Z').toISOString() }],
        commitments: { 标题: '历史合同内容（隔离测试）', 说明: '仅用于页面布局和只读接口检查；未签署，不证明已付款或获准制作。',
          范围: { 用途: '受控评估阅读', 生成许可: false, 商业条件: null }, 原文展示: ['完整历史内容应保留', '<b>原文按文字显示</b>'] } });
      await tx.execute('INSERT INTO governance_snapshots(id,source_ref,content_json,created_by) VALUES (?,?,?,?)', [value.id, sourceRef, JSON.stringify(value), readers[0]]);
      for (const reader of readers) await tx.execute('INSERT INTO governance_snapshot_readers(snapshot_id,account_id) VALUES (?,?)', [value.id, reader]);
      return value;
    });
  } finally { await db.close(); }
  state.contractSnapshotId = snapshot.id;
  await fs.writeFile(statePath, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
  assert.equal((await fs.stat(statePath)).mode & 0o777, 0o600);
  const report = { synthetic_only: true, setup: 'Trusted local fixture constructor; normal authenticated HTTP read is checked separately',
    snapshot_id: snapshot.id, rule_id: state.ruleId, current_status: snapshot.current_status, signing_method: snapshot.signing_method,
    content_sha256: snapshot.content_sha256, created_at: snapshot.created_at };
  await fs.writeFile(path.join(root, 'docs/ux/pr14-ui/evidence/style-governance-fixture.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
main().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
