'use strict';
require('../晶晶日上工程交接包/01_源码/backend_server/scripts/test-network-guard.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),{gateway}=require('./native-login-gateway.cjs');
test('real loopback gateway cannot forward hidden files, business APIs, other phones or expired requests',async()=>{
 let forwarded=0;const config={armed:true,phone:'13900000001',expiresAt:Date.now()+60000};
 const server=gateway({config,accountApp:(_req,res)=>{forwarded++;res.end('{}')}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{
  for(const p of ['/.env','/.local/config','/api/v1/trade/orders','/api/v1/ops','/api/auth/phone'])assert.equal((await fetch(base+p)).status,404);
  assert.equal((await fetch(base+'/api/v1/auth/sms-challenges',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:'13900000002'})})).status,403);assert.equal(forwarded,0);
  assert.equal((await fetch(base+'/api/v1/auth/sms-challenges',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:config.phone})})).status,200);assert.equal(forwarded,1);
  config.armed=false;assert.equal((await fetch(base+'/download')).status,503);assert.equal((await fetch(base+'/api/v1/me')).status,503);assert.equal(forwarded,1);
  config.armed=true;config.expiresAt=0;assert.equal((await fetch(base+'/health')).status,503);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
