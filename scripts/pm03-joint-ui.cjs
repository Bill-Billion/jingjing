'use strict';
// Local compiled App/Web against the retained PM03 backend. No external service.
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),{randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'..'),{protectPrivateState}=require('./test-fixtures/private-state.cjs');
async function main(){
 const out=path.resolve(process.argv[2]||'');
 if(process.argv.length!==3||path.dirname(out)!==path.join(root,'.local/stock-sandbox')||!/^jx_test_stock_pm03_[a-f0-9]{24}$/.test(path.basename(out)))throw Error('OWN_BATCH_DIRECTORY_REQUIRED');
 const access=JSON.parse(await fs.readFile(path.join(out,'access.json'),'utf8'));
 if(access.mode!=='BATCH'||access.synthetic_only!==true||!/^http:\/\/127\.0\.0\.1:\d+\/api\/v1$/.test(access.base_url)||Date.parse(access.expires_at)<=Date.now())throw Error('LIVE_LOCAL_BATCH_REQUIRED');
 const accounts={},sessions=new Map();
 // Reuse valid local sessions so restarting the UI host does not resend SMS.
 for(const name of ['batch-smoke-private.json','ui-session-cache.json']){
  try{const cache=JSON.parse(await fs.readFile(path.join(out,name),'utf8'));
   for(const a of Object.values(cache.people||cache.accounts||{}))if(a.account_id&&(a.token||a.bearer_token))sessions.set(a.account_id,a.token||a.bearer_token);
  }catch(e){if(e.code!=='ENOENT')throw e;}
 }
 const cacheFile=path.join(out,'ui-session-cache.json');await fs.writeFile(cacheFile,'',{mode:0o600});await protectPrivateState(cacheFile);
 await fs.writeFile(cacheFile,JSON.stringify({accounts:Object.fromEntries([...sessions].map(([id,token])=>[id,{account_id:id,token}]))}));
 async function post(url,body){const r=await fetch(access.base_url+url,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify(body)}),j=await r.json();if(r.status!==200)throw Error('BOOTSTRAP_'+(j.error?.code||r.status));return j.data;}
 const selected=process.env.PM03_UI_ROLES?.split(',');
 if(selected?.some(r=>!access.accounts[r]))throw Error('UNKNOWN_FIXTURE_ROLE');
 for(const [role,a]of Object.entries(access.accounts).filter(([r])=>!selected||selected.includes(r))){
  if(!sessions.has(a.account_id)){
   const challenge=await post('/auth/sms-challenges',{phone:a.phone,purpose:'LOGIN'});
   const sms=JSON.parse(await fs.readFile(path.join(out,'sms',challenge.challenge_id+'.json'),'utf8'));
   const session=await post('/auth/sessions',{phone:a.phone,challenge_id:challenge.challenge_id,code:sms.code});
   if(session.account.id!==a.account_id)throw Error('BOOTSTRAP_ACCOUNT_MISMATCH');sessions.set(a.account_id,session.access_token);
   await fs.writeFile(cacheFile,JSON.stringify({accounts:Object.fromEntries([...sessions].map(([id,token])=>[id,{account_id:id,token}]))}));
  }
  accounts[role]={account_id:a.account_id,party_id:a.party_id,bearer_token:sessions.get(a.account_id)};
 }
 const ui={synthetic_only:true,base_url:'http://127.0.0.1:5500/api/v1',expires_at:access.expires_at,accounts,scenarios:access.scenarios};
 const privateFile=path.join(out,'ui-access.json');await fs.writeFile(privateFile,'',{mode:0o600});await protectPrivateState(privateFile);await fs.writeFile(privateFile,JSON.stringify(ui));
 const mime={'.js':'application/javascript','.mjs':'application/javascript','.html':'text/html','.json':'application/json','.css':'text/css','.wasm':'application/wasm','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf'};
 const servers=[];
 for(const [port,relative]of [[5500,'frontend_jingjingshangri_app/build/web'],[5173,'frontend_ops_workspace/dist']]){
  const dir=path.resolve(root,'晶晶日上工程交接包/01_源码',relative);await fs.access(path.join(dir,'index.html'));
  const server=http.createServer(async(req,res)=>{try{
   if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host)||Date.now()>=Date.parse(access.expires_at)){res.writeHead(403);res.end();return;}
   const u=new URL(req.url,'http://127.0.0.1:'+port);
   if(u.pathname.startsWith('/api/v1/')||['/health','/ready'].includes(u.pathname)){
    const target=new URL(access.base_url);const headers={...req.headers,host:target.host};delete headers.origin;delete headers.referer;
    const upstream=http.request({hostname:'127.0.0.1',port:target.port,path:req.url,method:req.method,headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});req.pipe(upstream);return;
   }
   if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
   if(port===5500&&u.pathname==='/synthetic-access.json'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(ui));return;}
   let file=path.resolve(dir,'.'+decodeURIComponent(u.pathname));if(file!==dir&&!file.startsWith(dir+path.sep)){res.writeHead(403);res.end();return;}
   try{if(!(await fs.stat(file)).isFile())file=path.join(dir,'index.html');}catch(e){if(e.code!=='ENOENT')throw e;file=path.join(dir,'index.html');}
   res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:await fs.readFile(file));
  }catch{if(!res.headersSent)res.writeHead(500);res.end();}});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)});servers.push(server);
 }
 const close=()=>{servers.forEach(s=>{s.closeAllConnections();s.close()});clearTimeout(timer)};
 const timer=setTimeout(close,Math.max(1,Date.parse(access.expires_at)-Date.now()));process.once('SIGINT',close);process.once('SIGTERM',close);
 console.log(JSON.stringify({status:'READY',app:'http://127.0.0.1:5500',ops:'http://127.0.0.1:5173',expires_at:access.expires_at,roles:Object.keys(accounts).length}));
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1});
