const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { createManager } = require('./backup.cjs');
const { openStore } = require('./store.cjs');
function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jx-feedback-backup-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, 'client-feedback/original');
  fs.mkdirSync(path.join(dir, 'records'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'people.json'), JSON.stringify({ buyer: { id: 'buyer', name: '测试客户', code: 'PRIVATE-TEST-INVITE-1234567890' }, 'feedback-reviewer': { id: 'reviewer', name: '问题负责人', code: 'PRIVATE-REVIEW-INVITE-1234567890' } }));
  const store = openStore(path.join(dir, 'records'));
  const issue = store.create({ id: 'buyer', name: '测试客户' }, 'test-command-1234567890', { description: '测试反馈原文', image: { type: 'image/png', data: 'synthetic-image' } });
  store.update({ id: 'reviewer', name: '问题负责人', reviewer: true }, issue.id, 1, { status: 'RETEST', note: '请复测' });
  store.close();
  return { root, dir, manager: createManager(root) };
}
test('加密备份恢复保留邀请、截图、历史、版本和去重记录', t => {
  const { root, dir, manager } = setup(t), snapshot = manager.backup('original');
  assert.equal(snapshot.issues, 1);
  const bytes = fs.readFileSync(path.join(root, 'client-backups', snapshot.file));
  assert(!bytes.includes(Buffer.from('PRIVATE-TEST-INVITE'))); assert(!bytes.includes(Buffer.from('测试反馈原文')));
  assert.equal(manager.verify(snapshot.file).valid, true);
  manager.restore(snapshot.file, 'recovered');
  for (const file of ['people.json', 'records/records.json']) assert.deepEqual(fs.readFileSync(path.join(dir, file)), fs.readFileSync(path.join(root, 'client-feedback/recovered', file)));
  assert(!fs.existsSync(path.join(root, 'client-feedback/recovered/records/writer.lock')));
  const reopened = openStore(path.join(root, 'client-feedback/recovered/records'));
  assert.equal(reopened.list({ id: 'buyer' }).issues[0].status, 'RETEST'); reopened.close();
});
test('备份不得与运行中的写入进程并发，不覆盖已有批次', t => {
  const { dir, manager } = setup(t), store = openStore(path.join(dir, 'records'));
  assert.throws(() => manager.backup('original'), /目录已被使用/); store.close();
  const snapshot = manager.backup('original'), before = fs.readFileSync(path.join(dir, 'records/records.json'));
  assert.throws(() => manager.restore(snapshot.file, 'original'));
  assert.deepEqual(fs.readFileSync(path.join(dir, 'records/records.json')), before);
  assert.throws(() => manager.restore(snapshot.file, '../escape'));
  assert.throws(() => manager.verify('../outside.jxb'));
});
test('篡改、错误密钥及记录身份缺失均拒绝，恢复失败不新建目标', t => {
  const { root, dir, manager } = setup(t), snapshot = manager.backup('original');
  const file = path.join(root, 'client-backups', snapshot.file), original = fs.readFileSync(file), bad = Buffer.from(original);
  bad[bad.length - 1] ^= 1; fs.writeFileSync(file, bad);
  assert.throws(() => manager.restore(snapshot.file, 'tampered')); assert(!fs.existsSync(path.join(root, 'client-feedback/tampered')));
  fs.writeFileSync(file, original); fs.writeFileSync(path.join(root, 'client-backup-key.bin'), Buffer.alloc(32));
  assert.throws(() => manager.verify(snapshot.file));
  const people = JSON.parse(fs.readFileSync(path.join(dir, 'people.json'))); delete people.buyer;
  fs.writeFileSync(path.join(dir, 'people.json'), JSON.stringify(people));
  assert.throws(() => manager.backup('original'), /记录与邀请身份不一致/);
  assert(!fs.existsSync(path.join(dir, 'records/writer.lock')));
});
