'use strict';

// Same-origin Android/Vue gateway for one existing PM03 batch. It has no
// session injection, provider keys, or API outside the loopback batch.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { root, load, read } = require('./test-fixtures/qa18-s4-delta-clone.cjs');

const address = '127.0.0.1:54418';
const origin = 'http://' + address;

async function main() {
  const batch = await fs.realpath(path.resolve(process.argv[2]));
  const out = await fs.realpath(path.resolve(process.argv[3]));
  assert.equal(path.dirname(batch), path.join(root, '.local/stock-sandbox'));
  assert.match(path.basename(batch), /^jx_test_stock_pm03_[a-f0-9]{24}$/);
  assert(out.startsWith(path.join(root, '.local/qa18') + path.sep));
  const access = await read(path.join(batch, 'access.json'));
  assert(access.synthetic_only && access.mode === 'BATCH');
  const base = new URL(access.base_url);
  assert(base.protocol === 'http:' && base.hostname === '127.0.0.1' && base.port !== '54418');
  const expires = Math.min(Date.parse(access.expires_at), Date.now() + 90 * 60_000);
  assert(expires > Date.now() && Number.isFinite(expires));
  const website = path.join(out, 'vue');
  await fs.access(path.join(website, 'index.html'));
  const express = load('node_modules/express');
  const app = express();
  app.disable('x-powered-by');
  const requestLog = path.join(out, 'traffic.jsonl');
  const log = await fs.open(requestLog, 'wx');
  const server = http.createServer(app);

  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.headers.host !== address) return res.sendStatus(403);
    if (Date.now() >= expires) return res.status(410).json({error:{code:'LOCAL_S4B_EXPIRED'}});
    next();
  });

  app.use((req, res, next) => {
    if (!req.path.startsWith('/api/v1/') && !['/ready','/health'].includes(req.path)) return next();
    const surface = /\bEdg\//.test(req.get('user-agent') || '') ? 'vue' : 'android-or-host';
    res.on('finish', () => {
      const event = { time:new Date().toISOString(), surface, method:req.method,
        path:req.path, status:res.statusCode, request_id:res.get('X-Request-Id') };
      void log.appendFile(JSON.stringify(event) + '\n').catch(() => { process.exitCode = 1; });
    });
    const {origin: _origin, referer: _referer, ...headers} = req.headers;
    const upstream = http.request({ hostname:base.hostname, port:base.port,
      method:req.method, path:req.originalUrl, headers:{...headers, host:base.host} },
    reply => {
      res.writeHead(reply.statusCode, reply.headers);
      reply.pipe(res);
    });
    upstream.setTimeout(30_000, () => upstream.destroy());
    upstream.on('error', () => { if (!res.headersSent) res.status(502); res.end(); });
    req.on('aborted', () => upstream.destroy());
    req.pipe(upstream);
  });
  app.use(express.static(website, { dotfiles:'deny', redirect:false, index:false, fallthrough:true }));
  app.use((req, res) => {
    if (req.method !== 'GET' || path.extname(req.path)) return res.sendStatus(404);
    res.sendFile('index.html', { root:website });
  });

  let closing;
  let watcher;
  function stop() {
    return closing ??= (async () => {
      clearInterval(watcher);
      await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
      await log.close();
    })();
  }
  async function watch() {
    if (Date.now() >= expires || await fs.access(path.join(out,'gateway.stop')).then(() => true, () => false)) {
      await stop();
    }
  }
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(54418,'127.0.0.1',resolve); });
    for (const signal of ['SIGINT','SIGTERM']) process.once(signal, () => void stop().catch(console.error));
    watcher = setInterval(() => void watch().catch(console.error), 1000);
    const receipt = { origin, expires_at:new Date(expires).toISOString(), source:access.revision,
      backend_digest:access.source_sha256, versions:access.versions, database:path.basename(batch), synthetic_only:true };
    await fs.writeFile(path.join(out,'GATEWAY.json'), JSON.stringify(receipt,null,2)+'\n', {flag:'wx'});
    console.log(JSON.stringify(receipt));
  } catch (error) {
    await stop();
    throw error;
  }
}
main().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
