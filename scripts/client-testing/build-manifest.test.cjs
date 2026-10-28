const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { captureBuildManifest, verifyBuildManifest, readFrozenBuild } = require('./build-manifest.cjs');
const { createPortal } = require('./server.cjs');
const { prepare } = require('./prepare.cjs');
const { sha } = require('./store.cjs');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jx-frozen-build-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const builds = {};
  for (const kind of ['app', 'workspace']) {
    builds[kind] = path.join(dir, kind === 'app' ? 'explore-web' : 'client-web');
    fs.mkdirSync(path.join(builds[kind], 'assets'), { recursive: true });
    fs.writeFileSync(path.join(builds[kind], 'index.html'), '<html><head></head><body>' + kind + '</body></html>');
    fs.writeFileSync(path.join(builds[kind], 'assets', 'main.js'), 'original');
  }
  const config = { version: 'a'.repeat(40), builds };
  config.build_manifest = captureBuildManifest(builds, config.version);
  return { dir, config, builds };
}

test('清单绑定版本、两端最终路径及每个文件内容', t => {
  const { config, builds } = fixture(t);
  const frozen = verifyBuildManifest(JSON.parse(JSON.stringify(config)));
  assert.equal(frozen.app.path, builds.app);
  assert.equal(frozen.app.real_path, fs.realpathSync(builds.app));
  assert.equal(frozen.app.files['assets/main.js'], sha('original'));
  assert.deepEqual(Object.keys(config.build_manifest.portal.files).sort(), ['index.html', 'explore.html', 'client.js', 'explore-client.js', 'style.css', 'bridge.js', 'workspace-bootstrap.js', 'test-interactions.js'].sort());
  assert.equal(frozen.portal.files['bridge.js'], sha(fs.readFileSync(path.join(__dirname, 'bridge.js'))));
  assert.equal(readFrozenBuild(frozen.app, 'assets/main.js').bytes.toString(), 'original');
  assert.equal(readFrozenBuild(frozen.workspace, 'operations/customization').relative, 'index.html');
  config.build_manifest.builds.app.files['assets/main.js'] = sha('changed');
  assert.equal(readFrozenBuild(frozen.app, 'assets/main.js').bytes.toString(), 'original');
});

test('启动拒绝同长度篡改、缺文件、新增文件、版本或产物路径替换', t => {
  const { config, builds, dir } = fixture(t);
  const asset = path.join(builds.app, 'assets', 'main.js');
  fs.writeFileSync(asset, 'modified');
  assert.throws(() => verifyBuildManifest(config), { code: 'BUILD_FREEZE_INVALID' });
  fs.rmSync(asset);
  assert.throws(() => verifyBuildManifest(config), { code: 'BUILD_FREEZE_INVALID' });
  fs.writeFileSync(asset, 'original');
  const added = path.join(builds.workspace, 'new.js');
  fs.writeFileSync(added, 'extra');
  assert.throws(() => verifyBuildManifest(config), { code: 'BUILD_FREEZE_INVALID' });
  fs.rmSync(added);
  assert.throws(() => verifyBuildManifest({ ...config, version: 'b'.repeat(40) }), { code: 'BUILD_FREEZE_INVALID' });
  const replacement = path.join(dir, 'replacement');
  fs.cpSync(builds.app, replacement, { recursive: true });
  assert.throws(() => verifyBuildManifest({ ...config, builds: { ...builds, app: replacement } }), { code: 'BUILD_FREEZE_INVALID' });
  fs.rmSync(path.join(builds.app, 'index.html'));
  assert.throws(() => captureBuildManifest(builds, config.version), { code: 'BUILD_FREEZE_INVALID' });
});

test('运行中新增文件、越界路径和已登记文件被替换为链接不能服务', t => {
  const { config, builds } = fixture(t), frozen = verifyBuildManifest(config);
  fs.writeFileSync(path.join(builds.app, 'late.js'), 'late');
  assert.throws(() => readFrozenBuild(frozen.app, 'late.js'), { status: 404 });
  assert.throws(() => readFrozenBuild(frozen.app, '../client-web/index.html'), { status: 404 });
  const target = path.join(builds.app, 'assets');
  fs.rmSync(target, { recursive: true });
  fs.symlinkSync(path.join(builds.workspace, 'assets'), target, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => readFrozenBuild(frozen.app, 'assets/main.js'), { code: 'BUILD_FREEZE_INVALID' });
  assert.throws(() => verifyBuildManifest(config), { code: 'BUILD_FREEZE_INVALID' });
});

test('旧会话需重备，重备沿用反馈批次和原到期时间', t => {
  const { builds } = fixture(t);
  const root = path.resolve(__dirname, '../..'), local = path.join(root, '.local');
  const name = 'freeze-test-' + crypto.randomBytes(8).toString('hex');
  const data = path.join(local, name + '-fixture', 'jx_test_story_1234567890_0123456789ab');
  const folders = [name + '-old', name + '-new'], campaign = path.join(local, 'client-feedback', name);
  t.after(() => { for (const folder of [name + '-fixture', ...folders]) fs.rmSync(path.join(local, folder), { recursive: true, force: true }); fs.rmSync(campaign, { recursive: true, force: true }); });
  fs.mkdirSync(data, { recursive: true });
  const access = path.join(data, 'access.json');
  fs.writeFileSync(access, JSON.stringify({ synthetic_only: true, base_url: 'http://127.0.0.1:39998/api/v1', accounts: { buyer: { account_id: 'buyer', party_id: 'buyer', bearer_token: 'synthetic-only' } } }));
  fs.writeFileSync(path.join(data, 'status.json'), JSON.stringify({ synthetic_only: true, status: 'RUNNING', database: path.basename(data), port: 39998, expires_in_minutes: 60 }));
  const expires_at = new Date(Date.now() + 15 * 60000).toISOString();
  const initial = prepare([access], { folder: folders[0], campaign: name, expires_at, builds });
  const oldFile = path.join(root, initial.config_file), old = JSON.parse(fs.readFileSync(oldFile));
  assert.equal(old.build_manifest.builds.app.path, builds.app);
  delete old.build_manifest;
  fs.writeFileSync(oldFile, JSON.stringify(old));
  const previous = fs.readFileSync(oldFile);
  assert.throws(() => createPortal(old), error => error.code === 'BUILD_FREEZE_REQUIRED' && /原反馈批次.*原到期时间.*不会自动延期/.test(error.message));
  const start = spawnSync(process.execPath, [path.join(__dirname, 'server.cjs'), oldFile], { encoding: 'utf8' });
  assert.equal(start.status, 1);
  assert.match(start.stderr, /BUILD_FREEZE_REQUIRED/);
  assert.match(start.stderr, /原反馈批次.*原到期时间.*不会自动延期/);
  assert(!fs.existsSync(path.join(old.data_dir, 'writer.lock')));
  fs.mkdirSync(old.data_dir, { recursive: true });
  fs.writeFileSync(path.join(old.data_dir, 'preserved-feedback'), 'existing feedback');
  const next = prepare([access], { folder: folders[1], campaign: name, expires_at: old.expires_at, builds });
  const prepared = JSON.parse(fs.readFileSync(path.join(root, next.config_file)));
  assert.equal(prepared.expires_at, old.expires_at);
  assert.equal(prepared.data_dir, old.data_dir);
  assert.deepEqual(prepared.invites, old.invites);
  assert.equal(fs.readFileSync(path.join(prepared.data_dir, 'preserved-feedback'), 'utf8'), 'existing feedback');
  assert.deepEqual(fs.readFileSync(oldFile), previous);
  verifyBuildManifest(prepared);
});
