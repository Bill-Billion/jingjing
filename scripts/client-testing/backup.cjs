// Private test feedback backup. Does not touch business databases or running services.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const assert = require('node:assert/strict');
const { openStore } = require('./store.cjs');
const LIMIT = 160 * 1024 * 1024;
const MAGIC = Buffer.from('JXFBK001');

function name(value) {
  assert(typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9-]{0,79}$/.test(value), '批次名称无效');
  return value;
}
function directory(parent, child, create = false) {
  const base = fs.realpathSync(parent), target = path.join(base, child);
  if (create && !fs.existsSync(target)) fs.mkdirSync(target, { mode: 0o700 });
  assert(!fs.lstatSync(target).isSymbolicLink(), '不接受链接目录');
  assert(fs.realpathSync(target) === target, '目录不属于预期位置');
  return target;
}
function fileBytes(file, limit = LIMIT) {
  const stat = fs.lstatSync(file);
  assert(stat.isFile() && !stat.isSymbolicLink() && stat.size <= limit, '文件类型或大小不符合要求');
  return fs.readFileSync(file);
}
function validate(payload) {
  assert(payload.format === 1 && typeof payload.people === 'string' && typeof payload.records === 'string');
  const people = JSON.parse(payload.people), records = JSON.parse(payload.records);
  assert(people && !Array.isArray(people) && typeof people === 'object');
  const identities = Object.values(people);
  assert(identities.length > 0 && identities.every(p => p && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.code === 'string' && p.code.length >= 24));
  assert(new Set(identities.map(p => p.id)).size === identities.length);
  assert(people['feedback-reviewer'], '缺少问题负责人身份');
  assert(Array.isArray(records.issues) && Array.isArray(records.results) && records.commands && typeof records.commands === 'object');
  const ids = new Set(identities.map(p => p.id));
  assert([...records.issues, ...records.results].every(r => ids.has(r.owner)), '记录与邀请身份不一致');
  return { issues: records.issues.length, results: records.results.length, identities: identities.length };
}
function createManager(localRoot) {
  const local = fs.realpathSync(localRoot);
  const campaigns = directory(local, 'client-feedback', true);
  const backups = directory(local, 'client-backups', true);
  const keyFile = path.join(local, 'client-backup-key.bin');
  function key(create = false) {
    if (create && !fs.existsSync(keyFile)) fs.writeFileSync(keyFile, crypto.randomBytes(32), { flag: 'wx', mode: 0o600 });
    const value = fileBytes(keyFile, 32); assert(value.length === 32, '备份密钥无效'); return value;
  }
  function read(backupName) {
    assert(/^[a-zA-Z0-9-]+\.jxb$/.test(backupName), '备份文件名无效');
    const blob = fileBytes(path.join(backups, backupName));
    assert(blob.length > 36 && blob.subarray(0, 8).equals(MAGIC), '备份格式无效');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), blob.subarray(8, 20));
    decipher.setAAD(MAGIC); decipher.setAuthTag(blob.subarray(20, 36));
    const compressed = Buffer.concat([decipher.update(blob.subarray(36)), decipher.final()]);
    const payload = JSON.parse(zlib.gunzipSync(compressed, { maxOutputLength: LIMIT }).toString('utf8'));
    return { payload, counts: validate(payload) };
  }
  return {
    backup(campaign) {
      name(campaign); const dir = directory(campaigns, campaign), records = directory(dir, 'records');
      // Acquire the same exclusive lock as the portal: backup requires its writer to stop first.
      // Never remove a stale lock or stop a service automatically.
      fileBytes(path.join(records, 'records.json'));
      const store = openStore(records);
      try {
        const payload = { format: 1, campaign, created_at: new Date().toISOString(), people: fileBytes(path.join(dir, 'people.json'), 1024 * 1024).toString('utf8'), records: fileBytes(path.join(records, 'records.json')).toString('utf8') };
        const counts = validate(payload), raw = Buffer.from(JSON.stringify(payload));
        assert(raw.length <= LIMIT, '备份内容过大');
        const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key(true), iv);
        cipher.setAAD(MAGIC);
        const encrypted = Buffer.concat([cipher.update(zlib.gzipSync(raw)), cipher.final()]);
        const output = Buffer.concat([MAGIC, iv, cipher.getAuthTag(), encrypted]);
        assert(output.length <= LIMIT);
        const filename = campaign + '-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex') + '.jxb';
        fs.writeFileSync(path.join(backups, filename), output, { flag: 'wx', mode: 0o600 });
        return { file: filename, encrypted: true, ...counts };
      } finally { store.close(); }
    },
    verify(backupName) { return { valid: true, ...read(backupName).counts }; },
    restore(backupName, campaign) {
      name(campaign); const { payload, counts } = read(backupName);
      const destination = path.join(campaigns, campaign);
      // Non-recursive mkdir refuses an existing directory, including links; never overwrite.
      fs.mkdirSync(destination, { mode: 0o700 });
      const marker = path.join(destination, 'RESTORE_INCOMPLETE');
      fs.writeFileSync(marker, 'Do not use until restore succeeds.', { flag: 'wx', mode: 0o600 });
      fs.mkdirSync(path.join(destination, 'records'), { mode: 0o700 });
      fs.writeFileSync(path.join(destination, 'people.json'), payload.people, { flag: 'wx', mode: 0o600 });
      fs.writeFileSync(path.join(destination, 'records/records.json'), payload.records, { flag: 'wx', mode: 0o600 });
      fs.unlinkSync(marker);
      return { restored_to: campaign, ...counts, business_database_restored: false };
    },
  };
}
module.exports = { createManager };
if (require.main === module) {
  try {
    const [action, source, target] = process.argv.slice(2);
    assert(['backup', 'verify', 'restore'].includes(action));
    const manager = createManager(path.resolve(__dirname, '../../.local'));
    console.log(JSON.stringify(manager[action](source, target)));
  } catch {
    console.error('操作失败：请检查批次、文件、密钥和写入锁。不会覆盖已有批次；若出现RESTORE_INCOMPLETE，不得使用该目录。凭据与反馈内容不会输出。');
    process.exitCode = 1;
  }
}
