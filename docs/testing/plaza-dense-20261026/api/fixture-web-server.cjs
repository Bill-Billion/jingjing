'use strict';
// Serves the separate test build and runtime-only credentials on loopback.
// Never copy access.json into build/web, source control, or screenshot evidence.
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../../../..');
const app = path.join(root, '晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app');
async function main() {
  assert(process.env.PLAZA_ACCESS_FILE, 'Set the current joint PLAZA_ACCESS_FILE');
  const accessFile = path.resolve(root, process.env.PLAZA_ACCESS_FILE);
  const build = await fs.realpath(path.resolve(root, process.env.PLAZA_APP_BUILD_DIR || path.join(app, '.local/plaza-browser-final')));
  assert.equal(path.dirname(path.dirname(accessFile)), path.join(root, '.local/plaza-dense-sandbox'));
  assert.equal(path.basename(accessFile), 'access.json');
  assert.match(path.basename(path.dirname(accessFile)), /^jx_test_plaza_[0-9]+_[a-f0-9]{12}$/);
  const source = JSON.parse(await fs.readFile(accessFile, 'utf8'));
  const url = new URL(source.base_url);
  assert.equal(source.synthetic_only, true);
  assert.equal(url.protocol, 'http:');
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.pathname, '/api/v1');
  assert.equal(JSON.parse(await fs.readFile(path.join(path.dirname(accessFile), 'status.json'), 'utf8')).status, 'RUNNING');
  const bundle = await fs.readFile(path.join(build, 'main.dart.js'));
  const proof = { synthetic_only: true, bundle: 'main.dart.js', bytes: bundle.length,
    sha256: createHash('sha256').update(bundle).digest('hex'), origin: 'http://127.0.0.1:5500', backend_origin: url.origin };
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
    '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.css': 'text/css',
    '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
  const server = http.createServer(async (req, res) => {
    try {
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
      // The test entry is deliberately limited to this exact loopback origin.
      if (!['127.0.0.1:5500', 'localhost:5500'].includes(req.headers.host)) { res.writeHead(403); res.end(); return; }
      const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1:5500').pathname);
      const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
      if (pathname === '/synthetic-access.json') {
        const data = await fs.readFile(accessFile);
        res.writeHead(200, { ...headers, 'Content-Type': 'application/json' }); res.end(req.method === 'HEAD' ? undefined : data); return;
      }
      if (pathname === '/__fixture-proof') {
        res.writeHead(200, { ...headers, 'Content-Type': 'application/json' }); res.end(req.method === 'HEAD' ? undefined : JSON.stringify(proof)); return;
      }
      const file = path.resolve(build, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(build + path.sep) || path.basename(file).startsWith('synthetic-')) { res.writeHead(403); res.end(); return; }
      const actual = await fs.realpath(file);
      if (!actual.startsWith(build + path.sep)) { res.writeHead(403); res.end(); return; }
      const bytes = await fs.readFile(actual);
      res.writeHead(200, { ...headers, 'Content-Type': types[path.extname(actual)] || 'application/octet-stream' });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch (e) { res.writeHead(e.code === 'ENOENT' ? 404 : 500, { 'Cache-Control': 'no-store' }); res.end(); }
  });
  server.listen(5500, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  console.log(JSON.stringify({ status: 'READY', ...proof }));
  const close = () => { server.closeAllConnections(); server.close(); };
  process.once('SIGINT', close); process.once('SIGTERM', close);
}
main().catch(e => { console.error(e.code || e.message); process.exitCode = 1; });
