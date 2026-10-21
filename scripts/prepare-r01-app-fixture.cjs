#!/usr/bin/env node
// Keep the synthetic session outside source, logs and the normal App build.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
try {
  const fixturePath = process.env.CUSTOMIZATION_ACCESS_FILE;
  if (!fixturePath) throw new Error('fixture required');
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const api = new URL(fixture.base_url);
  const buyer = fixture.accounts?.buyer;
  if (fixture.synthetic_only !== true || api.protocol !== 'http:' ||
      api.hostname !== '127.0.0.1' || api.pathname !== '/api/v1' ||
      api.username || api.password || api.search || api.hash ||
      !/^[A-Za-z0-9_-]{32,512}$/.test(buyer?.bearer_token || '') ||
      !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(buyer?.account_id || '')) {
    throw new Error('not an isolated fixture');
  }
  const target = path.join(root, '晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/.local/r01-browser-defines.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify({
    R01_SYNTHETIC_ONLY: true,
    R01_API_ORIGIN: api.origin,
    R01_BUYER_TOKEN: buyer.bearer_token,
    R01_BUYER_ACCOUNT_ID: buyer.account_id,
    R01_BUYER_PARTY_ID: buyer.party_id,
  }), { mode: 0o600 });
  console.log('Prepared ignored R01 browser definitions. Use test/support/r01_browser_main.dart on loopback port 5000.');
} catch {
  console.error('Unable to prepare the local synthetic fixture. Check CUSTOMIZATION_ACCESS_FILE and the running isolated sandbox.');
  process.exitCode = 1;
}
