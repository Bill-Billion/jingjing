'use strict';
require('../晶晶日上工程交接包/01_源码/backend_server/scripts/test-network-guard.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {createGateway}=require('./mobile-fixture-gateway.cjs');
const token='Bearer '+ 'x'.repeat(43),phone='13900009801';
async function fixture(t,{upstreamHandler,expiresAt=Date.now()+60000,maxBodyBytes}={}){
 const seen=[];const upstream=http.createServer(async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);seen.push({url:req.url,headers:req.headers,body:Buffer.concat(chunks)});if(upstreamHandler)return upstreamHandler(req,res);res.setHeader('Content-Type','application/octet-stream');res.setHeader('Set-Cookie','forbidden=value');res.end(Buffer.concat(chunks));});
 await new Promise(r=>upstream.listen(0,'127.0.0.1',r));let current=true;
 const gateway=createGateway({target:'http://127.0.0.1:'+upstream.address().port,phones:[phone],expiresAt,isCurrent:()=>current,maxBodyBytes});
 await new Promise(r=>gateway.listen(0,'127.0.0.1',r));
 t.after(async()=>{for(const s of [gateway,upstream]){s.closeAllConnections();await new Promise(r=>s.close(r));}});
 return {base:'http://127.0.0.1:'+gateway.address().port,seen,invalidate:()=>current=false};
}
test('control, admin, unknown paths and wrong methods never reach fixture',async t=>{
 const f=await fixture(t);
 for(const p of ['/state','/code','/shutdown','/.local/pr20-ui-runtime.json','/api/v1/admin/provider-readiness','/api/v1/unknown','/api/v1/%6de','/api/v1/parties/a%2fb','/api/v1/auth/sessions/other'])assert.equal((await fetch(f.base+p,{headers:{Authorization:token}})).status,404,p);
 assert.equal((await fetch(f.base+'/api/v1/me',{method:'DELETE',headers:{Authorization:token}})).status,404);
 for(const p of ['/api/v1/trade/notifications/alipay','/api/v1/trade/notifications/apple'])assert.equal((await fetch(f.base+p,{method:'POST',headers:{Authorization:token}})).status,404);
 assert.equal(f.seen.length,0);
});
test('only this fixture synthetic phones can request SMS or log in',async t=>{
 const f=await fixture(t);
 for(const p of ['/api/v1/auth/sms-challenges','/api/v1/auth/sessions']){
  for(const value of ['15600000000','13900009501',null])assert.equal((await fetch(f.base+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:value})})).status,403);
  assert.equal((await fetch(f.base+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone})})).status,200);
 }
 assert.equal(f.seen.length,2);
});
test('business requires bearer, browsers rejected, identity/version/retry headers retained',async t=>{
 const f=await fixture(t);
 assert.equal((await fetch(f.base+'/api/v1/me')).status,401);
 assert.equal((await fetch(f.base+'/api/v1/me',{headers:{Authorization:token,Origin:'https://example.invalid'}})).status,403);
 const r=await fetch(f.base+'/api/v1/me',{headers:{Authorization:token,'X-Acting-Party':'party-id','If-Match':'"7"','Idempotency-Key':'retry','Cookie':'bad=yes','X-Forwarded-For':'10.1.1.1'}});
 assert.equal(r.status,200);assert.equal(r.headers.get('set-cookie'),null);assert.equal(r.headers.get('cache-control'),'no-store');
 const h=f.seen[0].headers;assert.equal(h.authorization,token);assert.equal(h['x-acting-party'],'party-id');assert.equal(h['if-match'],'"7"');assert.equal(h['idempotency-key'],'retry');assert.equal(h.cookie,undefined);assert.equal(h['x-forwarded-for'],undefined);
});
test('binary upload and partial download bytes survive the proxy',async t=>{
 const bytes=Buffer.from([0,255,13,10,128]);const f=await fixture(t,{upstreamHandler:(req,res)=>{res.writeHead(206,{'Content-Type':'application/octet-stream','Content-Range':'bytes 0-4/5'});res.end(bytes);}});
 const r=await fetch(f.base+'/api/v1/production/projects/abc/files?media_type=video%2Fmp4',{method:'POST',headers:{Authorization:token,'Content-Type':'video/mp4',Range:'bytes=0-4'},body:bytes});
 assert.equal(r.status,206);assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes);assert.deepEqual(f.seen[0].body,bytes);assert.equal(f.seen[0].headers.range,'bytes=0-4');assert.equal(r.headers.get('content-range'),'bytes 0-4/5');
});
test('backend permission failures preserved and redirects never followed',async t=>{
 for(const status of [403,404,409,503,302]){
  const f=await fixture(t,{upstreamHandler:(_req,res)=>{res.writeHead(status,{Location:'https://example.invalid'});res.end('denied');}});
  const r=await fetch(f.base+'/api/v1/me',{headers:{Authorization:token}});assert.equal(r.status,status===302?502:status);assert.equal(r.headers.get('location'),null);
 }
});
test('expired or replaced fixture is inaccessible',async t=>{
 const f=await fixture(t);f.invalidate();assert.equal((await fetch(f.base+'/health')).status,503);assert.equal((await fetch(f.base+'/api/v1/me',{headers:{Authorization:token}})).status,503);assert.equal(f.seen.length,0);
 const e=await fixture(t,{expiresAt:Date.now()+150});await new Promise(r=>setTimeout(r,200));assert.equal((await fetch(e.base+'/health')).status,503);
});
test('invalid JSON, oversized bodies and compressed requests are rejected',async t=>{
 const f=await fixture(t,{maxBodyBytes:8});
 assert.equal((await fetch(f.base+'/api/v1/auth/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'})).status,400);
 assert.equal((await fetch(f.base+'/api/v1/auth/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(8200)})).status,413);
 assert.equal((await fetch(f.base+'/api/v1/production/projects/abc/files',{method:'POST',headers:{Authorization:token},body:'x'.repeat(9)})).status,413);
 assert.equal((await fetch(f.base+'/api/v1/me',{headers:{Authorization:token,'Content-Encoding':'gzip'}})).status,415);assert.equal(f.seen.length,0);
});
test('non-loopback target and real phones cannot construct gateway',()=>{
 assert.throws(()=>createGateway({target:'https://example.invalid',phones:[phone],expiresAt:Date.now()+1000}));
 assert.throws(()=>createGateway({target:'http://127.0.0.1:3000',phones:['15600000000'],expiresAt:Date.now()+1000}));
});

test('request budget bounds repeated anonymous access',async t=>{
 const f=await fixture(t);let limited=false;
 for(let i=0;i<481;i++){const r=await fetch(f.base+'/health');await r.arrayBuffer();if(r.status===429){limited=true;break;}assert.equal(r.status,200);}
 assert(limited);assert.equal(f.seen.length,0);
});
