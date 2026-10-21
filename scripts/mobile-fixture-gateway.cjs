'use strict';
// Synthetic fixtures only. Never import provider configuration or serve files.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const manifest = require('./test-fixtures/mobile-routes.json');
const contract = fs.readFileSync(path.join(root, 'contracts/openapi.yaml'), 'utf8').replaceAll('\r\n', '\n');
assert.equal(crypto.createHash('sha256').update(contract).digest('hex'), manifest.contract_sha256,
  'Interface changed: review and regenerate mobile routes before opening test access');
const routes = manifest.routes.map(([method, route]) => ({method,
  pattern: new RegExp('^' + route.split('/').map(s => /^\{\w+\}$/.test(s) ? '[A-Za-z0-9_-]+' : s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('/') + '$')}));
const loginPaths = new Set(['/api/v1/auth/sms-challenges', '/api/v1/auth/sessions']);
const requestHeaders = ['authorization', 'content-type', 'if-match', 'idempotency-key', 'x-acting-party', 'range'];
const responseHeaders = ['content-type', 'content-disposition', 'content-range', 'accept-ranges', 'etag', 'retry-after'];
function createGateway({target, phones, expiresAt, isCurrent = () => false, maxBodyBytes = 16 * 1024 * 1024}) {
  const upstream = new URL(target);
  assert.equal(upstream.protocol, 'http:'); assert.equal(upstream.hostname, '127.0.0.1');
  assert.equal(upstream.pathname, '/'); assert(!upstream.username && !upstream.password && !upstream.search && !upstream.hash);
  assert(Number.isFinite(expiresAt) && expiresAt > Date.now() && expiresAt <= Date.now() + 75 * 60000);
  assert(Array.isArray(phones) && phones.length && phones.every(p => /^13900009[568]\d{2}$/.test(p)));
  const allowedPhones = new Set(phones); let minute = 0, requests = 0;
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    const deny = status => { if (!res.headersSent) res.writeHead(status, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:{code:'SYNTHETIC_TEST_RESTRICTED',message:'本轮测试入口未开放、已过期或请求不在范围内',retryable:false,details:[]},meta:{request_id:'mobile-test'}})); };
    try {
      if (Date.now() >= expiresAt || !isCurrent()) return deny(503);
      // Reject ambiguous/encoded paths before URL normalization; no browser access.
      if (req.headers.origin || !req.url.startsWith('/') || req.url.startsWith('//')) return deny(403);
      const rawPath = req.url.split('?')[0];
      if (/[\\%]/.test(rawPath) || rawPath.split('/').some(s => s === '.' || s === '..')) return deny(404);
      const u = new URL(req.url, 'http://test.invalid');
      const nowMinute = Math.floor(Date.now()/60000); if (minute !== nowMinute) {minute = nowMinute; requests = 0;}
      if (++requests > 240) return deny(429);
      if (req.method === 'GET' && u.pathname === '/health') return res.end(JSON.stringify({testOnly:true,syntheticOnly:true,expiresAt}));
      if (!routes.some(r => r.method === req.method && r.pattern.test(u.pathname))) return deny(404);
      const login = req.method === 'POST' && loginPaths.has(u.pathname);
      if (!login && !/^Bearer [A-Za-z0-9._~-]{20,2048}$/.test(req.headers.authorization || '')) return deny(401);
      if (req.headers['content-encoding']) return deny(415);
      const limit = login ? 8192 : maxBodyBytes; let size = 0; const chunks=[];
      for await (const chunk of req) { size += chunk.length; if (size > limit) return deny(413); chunks.push(chunk); }
      const body = Buffer.concat(chunks);
      if (login) {
        if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return deny(415);
        let value; try {value=JSON.parse(body.toString('utf8'));} catch {return deny(400);}
        if (!value || !allowedPhones.has(value.phone)) return deny(403);
      }
      if (Date.now() >= expiresAt || !isCurrent()) return deny(503);
      const headers={}; for (const key of requestHeaders) if (req.headers[key]) headers[key]=req.headers[key];
      // Raw bytes, status and permission errors are preserved. Never follow redirects.
      const outgoing = http.request({hostname:'127.0.0.1',port:upstream.port,path:req.url,method:req.method,headers}, incoming => {
        if (Date.now() >= expiresAt || !isCurrent()) {incoming.destroy(); return deny(503);}
        if (incoming.statusCode >= 300 && incoming.statusCode < 400) {incoming.resume(); return deny(502);}
        for (const key of responseHeaders) if (incoming.headers[key]) res.setHeader(key,incoming.headers[key]);
        res.writeHead(incoming.statusCode);
        incoming.on('error',()=>res.destroy()); incoming.pipe(res);
      });
      outgoing.setTimeout(20000,()=>outgoing.destroy()); outgoing.on('error',()=>{if(!res.headersSent)deny(502);else res.destroy();});
      res.on('close',()=>outgoing.destroy()); outgoing.end(body);
    } catch { if(!res.headersSent)deny(400);else res.destroy(); }
  });
  server.requestTimeout=30000; server.headersTimeout=10000;
  return server;
}
const scenarios={full:{file:'pr20',api:3362,control:3363,phone:/^139000098\d{2}$/},gigs:{file:'pr17',api:3302,control:3303,phone:/^139000095\d{2}$/},projects:{file:'pr18',api:3322,control:3323,phone:/^139000096\d{2}$/}};
async function start() {
  const [scenario,flag]=process.argv.slice(2),spec=scenarios[scenario];
  assert(spec && flag==='--test-only','Use full|gigs|projects --test-only');
  const file=path.join(root,'.local',spec.file+'-ui-runtime.json');
  const state=JSON.parse(fs.readFileSync(file,'utf8'));
  assert(state.testOnly && state.syntheticOnly && Number.isSafeInteger(state.pid));
  assert(new RegExp('^jx_test_'+state.pid+'_[0-9a-f]{12}$').test(state.schema));
  assert.equal(state.apiUrl,'http://127.0.0.1:'+spec.api);assert.equal(state.controlUrl,'http://127.0.0.1:'+spec.control);
  if(scenario==='full')assert(state.scenarios.fullFlow);
  const proof=await fetch(state.controlUrl+'/state',{headers:{Authorization:'Bearer '+state.controlToken},signal:AbortSignal.timeout(5000)});
  assert.equal(proof.status,200);const live=await proof.json();assert.equal(live.pid,state.pid);assert.equal(live.schema,state.schema);
  const phones=Object.values(state.accounts).map(a=>a.phone);assert(phones.every(p=>spec.phone.test(p)));
  const isCurrent=()=>{try{const current=JSON.parse(fs.readFileSync(file,'utf8'));return current.pid===state.pid&&current.schema===state.schema&&current.controlToken===state.controlToken&&current.apiUrl===state.apiUrl;}catch{return false;}};
  const expiresAt=Date.now()+75*60000;
  const server=createGateway({target:state.apiUrl,phones,expiresAt,isCurrent});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(3380,'127.0.0.1',resolve);});
  const stop=()=>{server.closeAllConnections();server.close();};
  const timer=setTimeout(stop,75*60000);timer.unref();server.on('close',()=>clearTimeout(timer));
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  console.log(JSON.stringify({testOnly:true,syntheticOnly:true,scenario,listen:'http://127.0.0.1:3380',expiresAt,publicAccess:false}));
}
module.exports={createGateway};
if(require.main===module)start().catch(()=>{console.error('拒绝启动：请核对已启动的隔离模拟资料、场景名称和本机端口；不会输出私有运行文件。');process.exitCode=1;});
