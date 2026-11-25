'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),http=require('node:http'),{createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),load=p=>require(path.join(root,'晶晶日上工程交接包/01_源码/backend_server',p));load('scripts/test-network-guard.cjs');
async function main(){
 const [dir,out]=process.argv.slice(2).map(p=>path.resolve(p));assert.equal(process.argv.length,4);for(const p of[dir,out])assert(p.startsWith(path.join(root,'.local/qa18')+path.sep));await fs.mkdir(out);
 const read=async p=>JSON.parse(await fs.readFile(p,'utf8')),a=await read(path.join(dir,'access.json')),state=await read(path.join(dir,'STATE.private.json')),previous=await read(path.join(dir,'STATUS.json')),env=await read(process.env.JX_MYSQL_TEST_ENV_FILE);
 assert(a.synthetic_only&&/^jx_test_qa18_privacy_[a-f0-9]{20}$/.test(a.database)&&a.database===state.database&&a.database===previous.database);assert.equal(previous.status,'STOPPED');assert.equal(a.expires_at,state.expires_at);assert(Date.parse(a.session_expires_at)>Date.now()+60000);assert.throws(()=>process.kill(previous.pid,0));await assert.rejects(fetch(new URL(a.base_url).origin+'/health',{signal:AbortSignal.timeout(1500)}));
 for(const[k,v]of Object.entries({NODE_ENV:'test',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const source=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),status={...previous,source,previous_pid:previous.pid,previous_api:a.base_url,pid:process.pid,resumed_at:new Date().toISOString(),status:'RESUMING'};delete status.stopped_at;
 let db,server,timer,watch,stopping=false;const save=()=>fs.writeFile(path.join(dir,'STATUS.json'),JSON.stringify(status,null,2));
 async function secret(name,j){const p=path.join(dir,name);await fs.writeFile(p,'');await require('./test-fixtures/private-state.cjs').protectPrivateState(p);await fs.writeFile(p,JSON.stringify(j,null,2));}
 async function stop(){if(stopping)return;stopping=true;clearTimeout(timer);clearInterval(watch);if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await db?.close();status.status='STOPPED';status.stopped_at=new Date().toISOString();await save();}
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
 try{
  db=await load('src/infrastructure/database').openDatabase({...env,MYSQL_DATABASE:a.database});const auth=load('src/modules/auth/repository').createAuthRepository(db,{secret:state.secret});for(const u of Object.values(a.accounts))assert.equal((await auth.resolve(u.bearer_token)).id,u.account_id);
  const hash=b=>createHash('sha256').update(b).digest('hex'),snapshot=async()=>{const [tables]=await db.execute('SHOW TABLES');const result={};for(const r of tables){const t=Object.values(r)[0];assert(/^[a-z0-9_]+$/.test(t));const [rows]=await db.execute('SELECT * FROM `'+t+'`');result[t]={rows:rows.length,sha256:hash(JSON.stringify(rows.map(x=>JSON.stringify(x)).sort()))};}return result;};
  const before=await snapshot(),disk=await require('./test-fixtures/qa18-disk-storage.cjs').openQaStorage(path.join(dir,'private-storage'));for(const[k,v]of Object.entries(disk.inventory()))assert.equal(hash(await disk.storageFactory().getBuffer(k)),v.sha256);
  const api=load('src/http/account-api').createAccountApi({db,secret:state.secret,supplyStorageFactory:disk.storageFactory,allowedOrigins:['http://127.0.0.1:5189']});
  server=http.createServer((req,res)=>{if(Date.now()>=Date.parse(a.expires_at)){res.writeHead(410,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:{code:'QA_ENVIRONMENT_EXPIRED'}}));}return api(req,res);});await new Promise((ok,bad)=>{server.once('error',bad);server.listen(0,'127.0.0.1',ok);});
  assert.deepEqual(await snapshot(),before);await secret('PRIOR_ACCESS.private.json',a);a.base_url='http://127.0.0.1:'+server.address().port+'/api/v1';await secret('access.json',a);
  const fixture=await read(path.join(dir,'app-create-fixture.private.json'));fixture.base=new URL(a.base_url).origin;await secret('app-create-fixture.private.json',fixture);
  const joint=await read(path.join(dir,'pm04-joint-private.json'));joint.revision=source;await secret('pm04-joint-private.json',joint);
  status.status='RUNNING';status.base_url=a.base_url;await save();const proof={result:'PASS',source,database:a.database,original_process_stopped:true,previous_pid:previous.pid,pid:process.pid,all_tables_unchanged:before,table_count:Object.keys(before).length,file_count:Object.keys(disk.inventory()).length,files_verified:true,original_sessions_preserved:true,session_expires_at:a.session_expires_at,service_expires_at:a.expires_at,deadlines_unchanged:true};await fs.writeFile(path.join(out,'RESUME_PROOF.json'),JSON.stringify(proof,null,2));
  watch=setInterval(()=>fs.access(path.join(dir,'stop-resume')).then(stop).catch(e=>{if(e.code!=='ENOENT')stop();}),1000);timer=setTimeout(stop,Date.parse(a.expires_at)-Date.now());console.log(JSON.stringify({status:'READY',source,database:a.database,base_url:a.base_url,pid:process.pid,tables_preserved:proof.table_count,files_preserved:proof.file_count,expires_at:a.expires_at}));
 }catch(e){status.error=e.message;await stop();throw e;}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
