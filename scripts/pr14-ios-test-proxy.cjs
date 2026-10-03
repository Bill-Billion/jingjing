'use strict';

// Phone access to the existing isolated PR14 API. Never forwards its private
// control plane, and never accepts production URLs or a wildcard listener.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');

async function main() {
  assert(process.argv.includes('--test-only'), 'Explicit --test-only is required.');
  const ip = process.env.PR14_IOS_LISTEN_IP;
  assert(ip && Object.values(os.networkInterfaces()).flat().some(item =>
    item?.family === 'IPv4' && !item.internal && item.address === ip), 'Use an actual private IPv4 interface.');
  assert(/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip), 'Private LAN only.');
  const state = JSON.parse(fs.readFileSync(process.env.PR14_UI_STATE_FILE || '.local/pr14-ui-runtime.json'));
  assert.equal(state.testOnly, true);
  assert.equal(state.apiUrl, 'http://127.0.0.1:3242');
  const marker = 'isolated-pr14-synthetic-sms-private-memory-storage';
  const response = await fetch(state.apiUrl + '/api/v1/health', { signal: AbortSignal.timeout(5000) });
  assert.equal(response.headers.get('x-test-environment'), marker, 'Isolated API marker required.');
  await response.body?.cancel();
  const server = http.createServer((req, res) => {
    if (!req.url?.startsWith('/api/v1/') || /[\\\r\n]/.test(req.url)) {
      res.writeHead(404); res.end(); return;
    }
    const upstream = http.request(state.apiUrl + req.url, {
      method: req.method,
      headers: { ...req.headers, host: '127.0.0.1:3242' },
      timeout: 15000,
    }, incoming => {
      if (incoming.headers['x-test-environment'] !== marker) {
        incoming.destroy(); res.writeHead(502); res.end(); return;
      }
      res.writeHead(incoming.statusCode, incoming.headers);
      incoming.pipe(res);
    });
    upstream.on('timeout', () => upstream.destroy());
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.on('aborted', () => upstream.destroy());
    req.pipe(upstream);
  });
  server.listen(3244, ip, () => console.log('PR14 phone API ready; private control plane is not forwarded.'));
  const close = () => { server.close(); server.closeAllConnections(); };
  process.once('SIGINT', close); process.once('SIGTERM', close);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
