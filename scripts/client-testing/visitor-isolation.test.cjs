'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {createPortal}=require('./server.cjs'),{sha}=require('./store.cjs'),{captureBuildManifest}=require('./build-manifest.cjs');
test('不同浏览器分配独立业务资料，切岗和重启不换到他人订单',async t=>{
 const root=path.resolve('.local/client-testing');fs.mkdirSync(root,{recursive:true});const dir=fs.mkdtempSync(path.join(root,'isolated-'));
 const upstream=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({order_owner:req.headers.authorization}));});
 await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
 const probe=http.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const origin='http://127.0.0.1:'+port,accounts={};
 for(const name of ['buyer','seller','two-buyer','two-seller'])accounts[name]={base_url:'http://127.0.0.1:'+upstream.address().port+'/api/v1',account_id:name,party_id:name,bearer_token:'private-'+name};
 const build=path.join(dir,'build');fs.mkdirSync(build);fs.writeFileSync(path.join(build,'index.html'),'<html><head></head><body>synthetic</body></html>');
 const cfg={synthetic_only:true,origin,port,version:'a'.repeat(40),expires_at:new Date(Date.now()+3600000).toISOString(),data_dir:path.join(dir,'records'),routes:[],builds:{app:build,workspace:build},accounts,invites:[{id:'reviewer',name:'测试负责人',reviewer:true,code_hash:sha(crypto.randomUUID())}],open_exploration:{visitor_secret:crypto.randomBytes(32).toString('hex'),default_account:'buyer',personas:[{account:'buyer',title:'客户',home:'/app/#/square'},{account:'seller',title:'制作方',home:'/workspace/workspace'}],visitor_slots:[{id:'one',accounts:{buyer:'buyer',seller:'seller'}},{id:'two',accounts:{buyer:'two-buyer',seller:'two-seller'}}]}};
 cfg.build_manifest=captureBuildManifest(cfg.builds,cfg.version);
 let server=createPortal(cfg);await new Promise(r=>server.listen(port,'127.0.0.1',r));
 const close=()=>new Promise(r=>{server.closeAllConnections();server.close(r);});
 function client(){const cookies=new Map();return {cookies,async call(route,body,headers={}){const res=await fetch(origin+route,{method:body===undefined?'GET':'POST',headers:{Connection:'close',Origin:origin,Cookie:[...cookies].map(([k,v])=>k+'='+v).join('; '),'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID(),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});for(const c of res.headers.getSetCookie()){const[k,v]=c.split(';')[0].split('=');cookies.set(k,v);}return {status:res.status,data:await res.json()};}};}
 const a=client(),b=client(),c=client();let first,second,issue;
 try{
  await t.test('无邀请码自动进入，各自读取独立账号的订单',async()=>{
   assert.equal((await a.call('/__test/enter',{})).status,200);assert.equal((await b.call('/__test/enter',{})).status,200);
   first=(await a.call('/__test/bootstrap')).data;second=(await b.call('/__test/bootstrap')).data;
   assert.notEqual(first.account_id,second.account_id);
   assert.equal((await a.call('/api/v1/trade/orders',undefined,{Authorization:'Bearer '+first.bearer_token})).data.order_owner,'Bearer private-buyer');
   assert.equal((await b.call('/api/v1/trade/orders',undefined,{Authorization:'Bearer '+second.bearer_token})).data.order_owner,'Bearer private-two-buyer');
  });
  await t.test('不能选择其他席位，容量满不回退到共享账号',async()=>{
   assert.equal((await a.call('/__test/enter',{account:'two-buyer'})).status,400);
   const full=await c.call('/__test/enter',{});assert.equal(full.status,503);assert.match(full.data.message,/不会共用/);
  });
  await t.test('切换制作方仍在本人资料内，旧页面令牌失效',async()=>{
   issue=(await a.call('/__test/issues',{category:'BUG',description:'同一订单的资料隔离检查',expected:'订单不串人',context:{route:'/workspace/trade/orders',reference:'synthetic-order'}})).data;
   await a.call('/__test/enter',{account:'seller'});const current=(await a.call('/__test/bootstrap')).data;
   assert.equal(current.account_id,'seller');assert.equal((await a.call('/__test/me')).data.account,'seller');
   assert.equal((await a.call('/api/v1/trade/orders',undefined,{Authorization:'Bearer '+first.bearer_token})).status,401);
   assert.equal((await a.call('/api/v1/trade/orders',undefined,{Authorization:'Bearer '+current.bearer_token})).data.order_owner,'Bearer private-seller');
   assert.equal((await a.call('/__test/issues')).data.issues[0].id,issue.id);assert.equal((await b.call('/__test/issues')).data.issues.length,0);
  });
  await t.test('重启后保留本人席位、反馈、订单归属，伪造签名不能占已有席位',async()=>{
   await close();server=createPortal(cfg);await new Promise(r=>server.listen(port,'127.0.0.1',r));
   assert.equal((await a.call('/__test/bootstrap')).status,401);await a.call('/__test/enter',{});await b.call('/__test/enter',{});
   assert.equal((await a.call('/__test/bootstrap')).data.account_id,first.account_id);assert.equal((await b.call('/__test/bootstrap')).data.account_id,second.account_id);
   assert.equal((await a.call('/__test/issues')).data.issues[0].id,issue.id);
   c.cookies.set('jx_visitor',a.cookies.get('jx_visitor').split('.')[0]+'.'+'0'.repeat(64));assert.equal((await c.call('/__test/enter',{})).status,503);
  });
  await t.test('错误共用账号配置拒绝启动',()=>{
   const bad=structuredClone(cfg);bad.accounts['two-buyer'].account_id='buyer';assert.throws(()=>createPortal(bad),/不能共用/);
   const sameParty=structuredClone(cfg);sameParty.accounts['two-buyer'].party_id='buyer';assert.throws(()=>createPortal(sameParty),/不能共用机构/);
  });
  await t.test('新增独立席位后原访客账号和反馈不变',async()=>{
   await close();for(const role of ['buyer','seller'])cfg.accounts['three-'+role]={...accounts[role],account_id:'three-'+role,party_id:'three-'+role,bearer_token:'private-three-'+role};
   cfg.open_exploration.visitor_slots.push({id:'three',accounts:{buyer:'three-buyer',seller:'three-seller'}});
   server=createPortal(cfg);await new Promise(r=>server.listen(port,'127.0.0.1',r));
   assert.equal((await c.call('/__test/enter',{})).status,200);assert.equal((await c.call('/__test/bootstrap')).data.account_id,'three-buyer');
   await a.call('/__test/enter',{});assert.equal((await a.call('/__test/bootstrap')).data.account_id,first.account_id);assert.equal((await a.call('/__test/issues')).data.issues[0].id,issue.id);
  });
  await t.test('同批次替换业务账号明确失败，不给原访客静默分新资料',async()=>{
   await close();const bad=structuredClone(cfg);bad.accounts.buyer.account_id='replaced';server=createPortal(bad);await new Promise(r=>server.listen(port,'127.0.0.1',r));
   assert.equal((await a.call('/__test/enter',{})).status,500);
  });
 }finally{await close();await new Promise(r=>upstream.close(r));assert(dir.startsWith(root+path.sep));fs.rmSync(dir,{recursive:true,force:true});}
});
