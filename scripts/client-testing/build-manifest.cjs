const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { isDeepStrictEqual } = require('node:util');
const { sha, fault } = require('./store.cjs');

const kinds = ['app', 'workspace'];
const portalFiles = ['index.html', 'explore.html', 'client.js', 'explore-client.js', 'style.css', 'bridge.js', 'workspace-bootstrap.js', 'test-interactions.js'];
function changed() {
  return Object.assign(fault(503, '门户或构建文件缺失或已变化，请沿用原反馈批次和原到期时间重新准备会话。'), { code: 'BUILD_FREEZE_INVALID' });
}
function readFile(root, relative) {
  const file = path.join(root, relative);
  // Reject links, including links in an ancestor, before reading the actual response bytes.
  assert(fs.realpathSync(file) === file && fs.statSync(file).isFile());
  return fs.readFileSync(file);
}
function snapshot(directory, selectedFiles) {
  assert(typeof directory === 'string' && path.isAbsolute(directory));
  const root = fs.realpathSync(directory);
  assert(fs.statSync(root).isDirectory());
  const files = {};
  function visit(relative) {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      assert(!entry.isSymbolicLink());
      const name = relative ? relative + '/' + entry.name : entry.name;
      if (entry.isDirectory()) visit(name);
      else {
        assert(entry.isFile());
        Object.defineProperty(files, name, { value: sha(readFile(root, name)), enumerable: true });
      }
    }
  }
  if (selectedFiles) for (const name of selectedFiles) files[name] = sha(readFile(root, name));
  else visit('');
  assert(Object.hasOwn(files, 'index.html'));
  return { path: path.resolve(directory), real_path: root, files };
}
function captureBuildManifest(builds, version) {
  try {
    assert(/^[a-f0-9]{7,40}$/.test(version));
    assert(isDeepStrictEqual(Object.keys(builds).sort(), kinds));
    return { format: 1, version, builds: Object.fromEntries(kinds.map(kind => [kind, snapshot(builds[kind])])), portal: snapshot(__dirname, portalFiles) };
  } catch {
    throw changed();
  }
}
function verifyBuildManifest(config) {
  if (!config.build_manifest) {
    throw Object.assign(fault(503, '旧配置缺少构建冻结证据，请沿用原反馈批次和原到期时间重新准备会话；不会自动延期。'), { code: 'BUILD_FREEZE_REQUIRED' });
  }
  const actual = captureBuildManifest(config.builds, config.version);
  if (!isDeepStrictEqual(actual, config.build_manifest)) throw changed();
  // Keep the verified snapshot independent of later changes to the caller's config object.
  const frozen = { ...actual.builds, portal: actual.portal };
  for (const build of Object.values(frozen)) { Object.freeze(build.files); Object.freeze(build); }
  return Object.freeze(frozen);
}
function loadPortalResources() {
  // Review-only sessions have no business manifest; retain these exact bytes for their lifetime.
  try {
    const root = fs.realpathSync(__dirname);
    return Object.freeze(Object.fromEntries(portalFiles.map(name => [name, readFile(root, name)])));
  } catch {
    throw changed();
  }
}
function readFrozenBuild(build, relative) {
  if (typeof relative !== 'string' || relative.includes('\\') || relative.includes('\0') || relative && relative.split('/').some(s => !s || s === '.' || s === '..')) throw fault(404, '文件未开放');
  try {
    if (fs.realpathSync(build.path) !== build.real_path) throw changed();
    let selected = relative || 'index.html';
    if (!Object.hasOwn(build.files, selected)) {
      // SPA routes may use the frozen index, but newly added files never become assets.
      if (path.extname(selected) || fs.existsSync(path.join(build.real_path, selected))) throw fault(404, '文件未开放');
      selected = 'index.html';
    }
    const bytes = readFile(build.real_path, selected);
    if (sha(bytes) !== build.files[selected]) throw changed();
    return { bytes, relative: selected };
  } catch (error) {
    if (error.status === 404) throw error;
    throw changed();
  }
}
module.exports = { captureBuildManifest, verifyBuildManifest, readFrozenBuild, loadPortalResources };
