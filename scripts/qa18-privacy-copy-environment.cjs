'use strict';
// Fresh bounded fixture for the original App -> operator -> independent reviewer -> App copy test.
// The order is prepared through normal repositories, remains unpaid, and is never a billing claim.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),http=require('node:http');
const {randomBytes}=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),load=p=>require(path.join(root,'晶晶日上工程交接包/01_源码/backend_server',p));
load('scripts/test-network-guard.cjs');
async function main(){
 const dir=path.resolve(process.env.QA18_ENV_DIR||'');assert(dir.startsWith(path.join(root,'.local/qa18')+path.sep));
 await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'CREATE_ONCE'),'new synthetic privacy-copy fixture',{flag:'wx'});
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 for(const[k,v]of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const source=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),database='jx_test_qa18_privacy_'+randomBytes(10).toString('hex'),started=Date.now(),expires=new Date(started+4*3600000).toISOString();
 const status={synthetic_only:true,database,source,started_at:new Date(started).toISOString(),expires_at:expires};
 let control,db,server,timer,watch,stopping=false;
 const save=()=>fs.writeFile(path.join(dir,'STATUS.json'),JSON.stringify(status,null,2));
 async function secret(name,value){const p=path.join(dir,name);await fs.writeFile(p,'',{flag:'wx'});await require('./test-fixtures/private-state.cjs').protectPrivateState(p);await fs.writeFile(p,JSON.stringify(value,null,2));}
 async function stop(){if(stopping)return;stopping=true;clearTimeout(timer);clearInterval(watch);if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await db?.close();await control?.end();status.status='STOPPED';status.stopped_at=new Date().toISOString();await save();}
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
 try{
  const mysql=load('node_modules/mysql2/promise');control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});
  await control.query('CREATE DATABASE '+mysql.escapeId(database)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');
  db=await load('src/infrastructure/database').openDatabase({...env,MYSQL_DATABASE:database});await load('src/infrastructure/database/migrator').migrate(db);
  const S=await load('test/support/customization-delivery.cjs').seed(db),original=await S.newOrder({title:'QA40 synthetic privacy copy original unpaid order'});
  const {producer,buyer,reviewer,outsider}=S.people;
  for(const u of [producer,reviewer])for(const action of ['PRIVACY_HANDLE','PRIVACY_REVIEW'])await S.grant(u,action);
  const disk=await require('./test-fixtures/qa18-disk-storage.cjs').openQaStorage(path.join(dir,'private-storage'),{seed:S.files});
  const api=load('src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:disk.storageFactory,supplyEnv:{CUSTOMIZATION_MERCHANT_PARTY_ID:S.org.party_id},allowedOrigins:['http://127.0.0.1:5189']});
  server=http.createServer((req,res)=>{if(Date.now()>=Date.parse(expires)){res.writeHead(410,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:{code:'QA_ENVIRONMENT_EXPIRED'}}));}return api(req,res);});
  await new Promise((ok,bad)=>{server.once('error',bad);server.listen(0,'127.0.0.1',ok);});
  const base='http://127.0.0.1:'+server.address().port,people={producer,buyer,reviewer,outsider,stock_buyer:buyer,stock_outsider:outsider};
  const accounts=Object.fromEntries(Object.entries({producer,buyer,reviewer,outsider}).map(([role,u])=>[role,{account_id:u.account_id,party_id:u.acting_party_id,personal_party_id:u.personal_party_id,bearer_token:u.token}]));
  const sessionExpiry=new Date(started+3600000).toISOString();
  await secret('access.json',{synthetic_only:true,database,base_url:base+'/api/v1',expires_at:expires,session_expires_at:sessionExpiry,accounts});
  await secret('STATE.private.json',{database,secret:S.secret,expires_at:expires});
  await secret('pm04-joint-private.json',{synthetic_only:true,revision:source,order_id:original.order.id,people:Object.fromEntries(Object.entries(people).map(([role,u])=>[role,{token:u.token,account_id:u.account_id,personal_party_id:u.personal_party_id}]))});
  await secret('app-create-fixture.private.json',{base,token:buyer.token,account_id:buyer.account_id,phase:'create',output:path.join(dir,'pm04-app-privacy-create-result.json')});
  await fs.writeFile(path.join(dir,'prepared.json'),JSON.stringify({synthetic_only:true,source,database,order:original.order,quote:original.quote,files:disk.inventory(),limits:['Normal synthetic adult and original order prepared through repositories; no payment/refund or real identity provider.','App session bootstrap is a controlled fixture; privacy business HTTP uses this live isolated database.','No pre-created privacy request, response, independent review or download.','Session fixture conservatively limited to one hour; service four hours. No public listener.']},null,2));
  status.status='RUNNING';status.base_url=base+'/api/v1';status.pid=process.pid;status.session_expires_at=sessionExpiry;status.order_id=original.order.id;await save();
  watch=setInterval(()=>fs.access(path.join(dir,'stop')).then(stop).catch(e=>{if(e.code!=='ENOENT')stop();}),1000);timer=setTimeout(stop,Date.parse(expires)-Date.now());
  console.log(JSON.stringify({status:'READY',source,database,base_url:status.base_url,pid:process.pid,expires_at:expires,session_expires_at:sessionExpiry,order_id:original.order.id,privacy_requests_created:0,payments_created:0}));
 }catch(e){status.error=e.stack;await stop();throw e;}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
