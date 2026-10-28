const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
fs.mkdirSync(path.resolve('.local/client-testing'),{recursive:true});
const {createPortal,safeRoute}=require('./server.cjs');const {sha,openStore}=require('./store.cjs');
const {captureBuildManifest}=require('./build-manifest.cjs');
async function listen(s){await new Promise(r=>s.listen(0,'127.0.0.1',r));return s.address().port;}
async function close(s){s.closeAllConnections();await new Promise(r=>s.close(r));}
test('邀请隔离、反馈持久化、重试、复测和业务代理',async t=>{
 const dir=fs.mkdtempSync(path.resolve('.local/client-testing/test-'));let upstreamCalls=[];
 const upstream=http.createServer((req,res)=>{upstreamCalls.push({path:req.url,auth:req.headers.authorization,party:req.headers['x-acting-party']});res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:{id:'account-a'},method:req.method}));});const port=await listen(upstream);
 const reserve=http.createServer();const gatewayPort=await listen(reserve);await close(reserve);const origin='http://127.0.0.1:'+gatewayPort;
 const builds=path.join(dir,'build');fs.mkdirSync(builds);fs.writeFileSync(path.join(builds,'index.html'),'<html><head></head><body>test</body></html>');fs.writeFileSync(path.join(builds,'private.json'),'secret');fs.writeFileSync(path.join(builds,'secret.map'),'secret');
 const original='/* synthetic */'.repeat(2048);fs.writeFileSync(path.join(builds,'sample.js'),original);
 const invites=[{id:'a',name:'甲方甲',reviewer:false,account:'buyer',code_hash:sha('a'.repeat(32))},{id:'b',name:'甲方乙',reviewer:false,account:'buyer',code_hash:sha('b'.repeat(32))},{id:'review',name:'处理人',reviewer:true,code_hash:sha('r'.repeat(32))}];
 const cfg={synthetic_only:true,version:'767d2ffc',origin,expires_at:new Date(Date.now()+3600000).toISOString(),data_dir:path.join(dir,'store'),invites,accounts:{buyer:{base_url:'http://127.0.0.1:'+port+'/api/v1',bearer_token:'upstream-secret-not-for-browser',account_id:'account-a',party_id:'party-a',label:'买方'}},routes:[{id:'story',title:'故事',path:'/app/#/customization',accounts:['buyer']}],builds:{app:builds,workspace:builds}};
 cfg.build_manifest=captureBuildManifest(cfg.builds,cfg.version);
 let current=true,server=createPortal(cfg,{current:()=>current});await new Promise(r=>server.listen(gatewayPort,'127.0.0.1',r));t.after(async()=>{await close(server);await close(upstream);fs.rmSync(dir,{recursive:true,force:true});});
 const call=async(p,method='GET',data,who,headers={})=>{const r=await fetch(origin+p,{method,headers:{Connection:'close',...(who?{Cookie:who.cookie}:{}),...(method==='GET'?{}:{Origin:origin,'Content-Type':'application/json'}),...headers},...(data===undefined?{}:{body:JSON.stringify(data)})});let b;try{b=await r.json();}catch{}return {r,b};};
 async function login(code){const v=await call('/__test/login','POST',{code});assert.equal(v.r.status,200);const cookie=v.r.headers.get('set-cookie').split(';')[0];assert.match(v.r.headers.get('set-cookie'),/HttpOnly.*SameSite=Strict/);return {cookie};}
 const alice=await login('a'.repeat(32)),bob=await login('b'.repeat(32)),review=await login('r'.repeat(32));
 await t.test('无邀请、无Origin和跨站提交被拒绝',async()=>{assert.equal((await call('/__test/issues')).r.status,401);assert.equal((await call('/__test/login','POST',{code:'bad'})).r.status,401);assert.equal((await call('/__test/issues','POST',{},alice,{Origin:'https://evil.invalid'})).r.status,403);assert.equal((await fetch(origin+'/__test/logout',{method:'POST',headers:{Cookie:alice.cookie}})).status,403);});
 const payload={category:'BUG',description:'页面卡住了',expected:'应能继续',context:{route:'/app/?token=secret#/stock/video?listingId=test-1&access_token=secret',reference:'test-1'},image:null};let issue;
 await t.test('创建可恢复、相同请求不重复、不同内容冲突',async()=>{const key=crypto.randomUUID();let a=await call('/__test/issues','POST',payload,alice,{'Idempotency-Key':key});assert.equal(a.r.status,201);issue=a.b;const repeat=await call('/__test/issues','POST',payload,alice,{'Idempotency-Key':key});assert.equal(repeat.b.id,issue.id);assert(!JSON.stringify(issue).includes('secret'));assert.equal(issue.context.route,'/app/#/stock/video?listingId=test-1');assert.equal((await call('/__test/issues','POST',{...payload,description:'不同内容'},alice,{'Idempotency-Key':key})).r.status,409);});
 await t.test('本人隔离、负责人集中看、处理权限和版本保护',async()=>{assert.equal((await call('/__test/issues','GET',undefined,bob)).b.issues.length,0);assert.equal((await call('/__test/issues','GET',undefined,review)).b.issues.length,1);assert.equal((await call('/__test/export','GET',undefined,alice)).r.status,403);assert.equal((await call('/__test/issues/'+issue.id,'PATCH',{status:'FIXING',note:'修复'},alice,{'If-Match':'1'})).r.status,403);assert.equal((await call('/__test/issues/'+issue.id,'PATCH',{status:'RETEST',note:'请复测'},review,{'If-Match':'1'})).r.status,200);assert.equal((await call('/__test/issues/'+issue.id,'PATCH',{status:'FIXING',note:'过期'},review,{'If-Match':'1'})).r.status,409);assert.equal((await call('/__test/issues/'+issue.id,'PATCH',{status:'RESOLVED',note:'代确认'},review,{'If-Match':'2'})).r.status,403);assert.equal((await call('/__test/issues/'+issue.id,'PATCH',{status:'RESOLVED',note:'已恢复'},alice,{'If-Match':'2'})).r.status,200);});
 await t.test('截图需确认、格式校验和账号隔离',async()=>{const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2XkAAAAASUVORK5CYII=';const key=()=>({'Idempotency-Key':crypto.randomUUID()});assert.equal((await call('/__test/issues','POST',{...payload,image:png},alice,key())).r.status,400);assert.equal((await call('/__test/issues','POST',{...payload,image:'data:image/png;base64,'+Buffer.alloc(30).toString('base64'),image_confirmed:true},alice,key())).r.status,415);const im=await call('/__test/issues','POST',{...payload,image:png,image_confirmed:true},alice,key());assert.equal(im.r.status,201);assert.equal((await call('/__test/issues/'+im.b.id+'/image','GET',undefined,bob)).r.status,404);const own=await fetch(origin+'/__test/issues/'+im.b.id+'/image',{headers:{Cookie:alice.cookie}});assert.equal(own.status,200);assert.match(own.headers.get('content-type'),/image\/png/);});
 await t.test('测试路线、身份、私有文件和代理凭据隔离',async()=>{const key=()=>({'Idempotency-Key':crypto.randomUUID()});assert.equal((await call('/__test/results','POST',{scenario:'story',outcome:'PASSED',note:''},alice,key())).r.status,201);assert.equal((await call('/__test/results','POST',{scenario:'unknown',outcome:'PASSED'},alice,key())).r.status,400);const b=await call('/__test/bootstrap','GET',undefined,alice);assert(!JSON.stringify(b.b).includes('upstream-secret'));const headers={Authorization:'Bearer '+b.b.bearer_token};assert.equal((await call('/api/v1/me','GET',undefined,alice,headers)).r.status,200);assert.equal(upstreamCalls.at(-1).auth,'Bearer upstream-secret-not-for-browser');assert.equal((await call('/api/v1/me','GET',undefined,bob,headers)).r.status,401);assert.equal((await call('/api/v1/me','GET',undefined,alice,{...headers,'X-Acting-Party':'other'})).r.status,403);assert.equal((await call('/api/v1/auth/sms-challenges','POST',{},alice,headers)).r.status,403);assert.equal((await call('/__test/bootstrap','GET',undefined,review)).r.status,403);for(const p of ['/app/private.json','/app/secret.map','/app/.env','/app/%2e%2e/secret'])assert.equal((await call(p,'GET',undefined,alice)).r.status,404);});
 await t.test('静态文件压缩传输仍需邀请，解压后内容与原文件一致',async()=>{const no=await fetch(origin+'/app/sample.js',{headers:{Connection:'close','Accept-Encoding':'gzip'}});assert.equal(no.status,401);const r=await fetch(origin+'/app/sample.js',{headers:{Connection:'close',Cookie:alice.cookie,'Accept-Encoding':'gzip'}});assert.equal(r.status,200);assert.equal(r.headers.get('content-encoding'),'gzip');assert.equal(await r.text(),original);const plain=await fetch(origin+'/app/sample.js',{headers:{Connection:'close',Cookie:alice.cookie,'Accept-Encoding':'gzip;q=0'}});assert.equal(plain.headers.get('content-encoding'),null);assert.equal(await plain.text(),original);});
 await t.test('响应使用已核验字节，读取后替换文件不能偷换响应或后续HEAD',async()=>{
  const file=path.join(builds,'sample.js'),read=fs.readFileSync;let replaced=false;
  fs.readFileSync=function(target,...args){const bytes=read.call(fs,target,...args);if(target===file&&!replaced){replaced=true;fs.writeFileSync(file,'replaced after read');}return bytes;};
  try{
   const r=await fetch(origin+'/app/sample.js',{headers:{Connection:'close',Cookie:alice.cookie,'Accept-Encoding':'gzip'}});assert.equal(r.status,200);assert.equal(await r.text(),original);assert.equal(replaced,true);
   assert.equal((await call('/app/sample.js','GET',undefined,alice)).r.status,503);assert.equal((await call('/app/sample.js','HEAD',undefined,alice)).r.status,503);
  }finally{fs.readFileSync=read;fs.writeFileSync(file,original);}
 });
 await t.test('新增文件不得服务，SPA仍用冻结首页，已登记首页变化即拒绝',async()=>{
  const added=path.join(builds,'late.js'),index=path.join(builds,'index.html'),html=fs.readFileSync(index);
  try{
   fs.writeFileSync(added,'late asset');assert.equal((await call('/app/late.js','GET',undefined,alice)).r.status,404);
   const route=await fetch(origin+'/workspace/operations/customization',{headers:{Connection:'close',Cookie:alice.cookie}});assert.equal(route.status,200);assert.match(await route.text(),/bridge\.js/);
   fs.writeFileSync(index,'changed page');assert.equal((await call('/app/','GET',undefined,alice)).r.status,503);assert.equal((await call('/workspace/operations/customization','GET',undefined,alice)).r.status,503);
  }finally{fs.rmSync(added,{force:true});fs.writeFileSync(index,html);}
 });
 await t.test('门户页面或注入脚本变化时启动和活动响应都拒绝，不公开工具源码',async()=>{
  const read=fs.readFileSync,files=new Set(Object.keys(cfg.build_manifest.portal.files).map(name=>path.join(__dirname,name)));
  fs.readFileSync=function(target,...args){return files.has(target)?Buffer.from('changed portal bytes'):read.call(fs,target,...args);};
  try{
   assert.throws(()=>createPortal(cfg),{code:'BUILD_FREEZE_INVALID'});
   for(const p of ['/','/__test/client.js','/__test/explore-client.js','/__test/style.css','/__test/bridge.js','/__test/workspace-bootstrap.js','/__test/test-interactions.js'])assert.equal((await call(p,'GET',undefined,alice)).r.status,503);
   assert.equal((await call('/__test/server.cjs','GET',undefined,alice)).r.status,404);
   assert.equal((await call('/__test/portal.test.cjs','GET',undefined,alice)).r.status,404);
  }finally{fs.readFileSync=read;}
 });
 await t.test('重启保留反馈、旧会话失效、失效资料拒绝访问',async()=>{await close(server);server=createPortal(cfg,{current:()=>current});await new Promise(r=>server.listen(gatewayPort,'127.0.0.1',r));assert.equal((await call('/__test/issues','GET',undefined,alice)).r.status,401);const a=await login('a'.repeat(32)),rows=(await call('/__test/issues','GET',undefined,a)).b;assert.equal(rows.issues.length,2);assert.equal(rows.issues[0].status,'RESOLVED');assert.equal(rows.results.length,1);current=false;assert.equal((await call('/__test/issues','GET',undefined,a)).r.status,503);assert.equal((await call('/app/','GET',undefined,a)).r.status,503);await close(server);server=createPortal({...cfg,review_only:true,builds:{},build_manifest:undefined,accounts:{},routes:[],invites:[invites[2]]});await new Promise(r=>server.listen(gatewayPort,'127.0.0.1',r));const reviewer=await login('r'.repeat(32));assert.equal((await call('/__test/issues','GET',undefined,reviewer)).b.issues.length,2);assert.equal((await call('/api/v1/me','GET',undefined,reviewer)).r.status,403);});
 await t.test('纯审核门户固定启动字节，磁盘脚本变化后仍返回原页面和脚本',async()=>{
  const reviewer=await login('r'.repeat(32)),read=fs.readFileSync;
  const expected=new Map(['index.html','client.js','bridge.js'].map(name=>[path.join(__dirname,name),read(path.join(__dirname,name),'utf8')]));
  fs.readFileSync=function(target,...args){return expected.has(target)?Buffer.from('changed after reviewer startup'):read.call(fs,target,...args);};
  try{
   for(const [route,name]of [['/','index.html'],['/__test/client.js','client.js'],['/__test/bridge.js','bridge.js']]){const r=await fetch(origin+route,{headers:{Connection:'close',Cookie:reviewer.cookie}});assert.equal(r.status,200);assert.equal(await r.text(),expected.get(path.join(__dirname,name)));}
  }finally{fs.readFileSync=read;}
 });
});
test('记录目录禁止双写进程，路径移除敏感查询值',()=>{const dir=fs.mkdtempSync(path.resolve('.local/client-testing/lock-'));const s=openStore(dir);assert.throws(()=>openStore(dir),/目录已被使用/);s.close();fs.rmSync(dir,{recursive:true,force:true});assert.equal(safeRoute('https://evil.invalid/'),'/');assert.equal(safeRoute('/app/#/x?token=bad&id=good'),'/app/#/x?id=good');});

 test('作品和通告反馈保留业务定位，但不保存令牌、搜索正文或外部地址',()=>{
 assert.equal(safeRoute('/app/?token=secret#/stock/video?listingId=video-1&access_token=secret&search=private'),'/app/#/stock/video?listingId=video-1');
 assert.equal(safeRoute('/app/#/notices/detail?noticeId=notice-1&personId=person-1&token=secret'),'/app/#/notices/detail?noticeId=notice-1&personId=person-1');
 assert.equal(safeRoute('/app/#/stock/video?listingId=%3Cscript%3E&token=secret'),'/app/#/stock/video');
 assert.equal(safeRoute('//other.invalid/app?listingId=video-1'),'/');
 });
