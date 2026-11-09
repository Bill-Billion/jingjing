"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
test('privacy responses require the actual reviewed files before publication',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));for(const [k,v] of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name=`jx_test_${process.pid}_${randomBytes(6).toString('hex')}`,control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;
 try{await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
 const S=await require('./support/customization-delivery.cjs').seed(db),{producer,buyer,reviewer,outsider}=S.people;await S.grant(producer,'PRIVACY_HANDLE');await S.grant(producer,'PRIVACY_REVIEW');await S.grant(reviewer,'PRIVACY_HANDLE');await S.grant(reviewer,'PRIVACY_REVIEW');
 const proof=await S.assets.upload(producer.ctx,{party_id:producer.acting_party_id,purpose:'REVIEW_EVIDENCE',media_type:'text/plain',body:Buffer.from('Synthetic redacted privacy copy'),operation_key:key()});
 server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1/privacy',fixtures=[];
 async function call(method,url,who=buyer,body,version=null,operation=key(),party=null){const res=await fetch(base+url,{method,headers:{Authorization:'Bearer '+who.token,...party?{'X-Acting-Party':party}:{},...body===undefined?{}:{'Content-Type':'application/json','Idempotency-Key':operation},...version===null?{}:{'If-Match':'"'+version+'"'}},...body===undefined?{}:{body:JSON.stringify(body)}});if(!(res.headers.get('content-type')||'').includes('json'))return {status:res.status,bytes:Buffer.from(await res.arrayBuffer())};const value=await res.json();fixtures.push({method,path:new URL(base+url).pathname,schema:res.status===200?(url.startsWith('/preferences')?'PrivacyPreferencesResponse':url.endsWith('/history')?'PrivacyHistoryResponse':value.data?.items?'PrivacyListResponse':'PrivacyRequestResponse'):'ErrorResponse',value});return {status:res.status,data:value.data,error:value.error,body:value};}

 const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.data;};
 const rejects=r=>assert.notEqual(r.status,200,JSON.stringify(r));
 const create=async()=>{let r=ok(await call('POST','/requests',buyer,{type:'COPY',scopes:['PROFILE'],details:'Synthetic machine readable personal copy'}));return ok(await call('POST','/operations/requests/'+r.id+'/start',producer,{},r.object_version));};
 const propose=(r,p=proof,remaining=[])=>call('POST','/operations/requests/'+r.id+'/response',producer,{result:{response:'Synthetic personal copy; verify remaining items separately',outcome:'INFORMATION_PROVIDED',evidence_asset_ids:[p.id],retentions:[],remaining_actions:remaining}},r.object_version);
 const review=(r,op=key())=>call('POST','/operations/requests/'+r.id+'/review',reviewer,{decision:'APPROVED',reason:'Synthetic independent verification',proposal_sha256:r.proposal_sha256,evidence_verified:true,third_party_data_redacted:true,remaining_actions_checked:true},r.object_version,op);
 const current=r=>call('GET','/requests/'+r.id);
 const history=r=>call('GET','/requests/'+r.id+'/history');
 const [[file]]=await db.execute('SELECT * FROM supply_assets WHERE id=?',[proof.id]);
 const original=Buffer.from(S.files.get(file.object_key));
 await t.test('a READY metadata row without stored bytes cannot be offered as a delivered copy',async()=>{
  const r=await create();S.files.delete(file.object_key);
  try{rejects(await propose(r));assert.equal(ok(await current(r)).current_status,'PROCESSING');assert.equal(ok(await history(r)).responses.length,0);}
  finally{S.files.set(file.object_key,original);}
 });
 await t.test('missing bytes at independent review do not publish; same request recovers after restoration',async()=>{
  const r=ok(await propose(await create())),operation=key();S.files.delete(file.object_key);
  try{rejects(await review(r,operation));assert.equal(ok(await current(r)).current_status,'AWAITING_REVIEW');assert.equal(ok(await history(r)).responses.length,0);}
  finally{S.files.set(file.object_key,original);}
  const done=ok(await review(r,operation));assert.equal(done.current_status,'RESPONDED');
  assert.equal((await call('GET','/requests/'+r.id+'/evidence/'+proof.id+'/content')).bytes.toString(),original.toString());
  assert.deepEqual(ok(await review(r,operation)),done);assert.equal(ok(await history(r)).responses.length,1);
 });

 const {digest}=require('../src/modules/governance/content');
 const hash=b=>require('node:crypto').createHash('sha256').update(b).digest('hex');
 const freshProof=body=>S.assets.upload(producer.ctx,{party_id:producer.acting_party_id,purpose:'REVIEW_EVIDENCE',media_type:'text/plain',body:Buffer.from(body),operation_key:key()});
 const rejectDraft=r=>call('POST','/operations/requests/'+r.id+'/review',reviewer,{decision:'REJECTED',reason:'Replace missing or changed evidence',proposal_sha256:r.proposal_sha256},r.object_version);
 await t.test('tampered bytes cannot pass even when metadata still looks ready',async()=>{
  const r=ok(await propose(await create()));S.files.set(file.object_key,Buffer.alloc(original.length,120));
  try{const failure=await review(r);assert.equal(failure.status,503);assert.equal(failure.error.code,'SERVICE_UNAVAILABLE');assert.equal(ok(await history(r)).responses.length,0);}
  finally{S.files.set(file.object_key,original);}
 });
 await t.test('replacing both metadata and bytes cannot reuse the previously submitted digest',async()=>{
  const r=ok(await propose(await create())),replacement=Buffer.from('Different synthetic redacted copy');
  assert.equal(r.proposal.files[0].content_sha256,file.content_sha256);
  await db.execute('UPDATE supply_assets SET content_sha256=?,byte_size=? WHERE id=?',[hash(replacement),replacement.length,file.id]);S.files.set(file.object_key,replacement);
  try{assert.equal((await review(r)).error.code,'PRIVACY_EVIDENCE_CHANGED');assert.equal(ok(await current(r)).current_status,'AWAITING_REVIEW');assert.equal(ok(await history(r)).responses.length,0);}
  finally{await db.execute('UPDATE supply_assets SET content_sha256=?,byte_size=? WHERE id=?',[file.content_sha256,file.byte_size,file.id]);S.files.set(file.object_key,original);}
 });
 await t.test('restricted evidence is blocked both before submission and before approval',async()=>{
  const pending=ok(await propose(await create())),notSubmitted=await create(),hold=key();
  const execution=key(); // Synthetic existing restriction: creation workflow is separately tested.
  await db.execute("INSERT INTO privacy_executions(id,request_id,action_code,target_id,proposed_by,current_status,payload_json,payload_sha256) VALUES (?,?,?,?,?,'EXECUTED',?,?)",[execution,pending.id,'RESTRICT_CONTENT',proof.id,reviewer.account_id,'{}',digest({})]);
  await db.execute("INSERT INTO content_restrictions(id,target_kind,target_id,execution_id) VALUES (?,'ASSET',?,?)",[hold,proof.id,execution]);
  try{assert.equal((await propose(notSubmitted)).error.code,'CONTENT_RESTRICTED');assert.equal((await review(pending)).error.code,'CONTENT_RESTRICTED');assert.equal(ok(await history(pending)).responses.length,0);}
  finally{await db.execute('DELETE FROM content_restrictions WHERE id=?',[hold]);}
 });
 await t.test('legacy pending drafts require rejection and resubmission, not silent approval',async()=>{
  let r=ok(await propose(await create()));const legacy={...r.proposal};delete legacy.files;
  await db.execute('UPDATE privacy_requests SET proposal_json=?,proposal_sha256=? WHERE id=?',[JSON.stringify(legacy),digest(legacy),r.id]);r.proposal_sha256=digest(legacy);
  assert.equal((await review(r)).error.code,'PRIVACY_EVIDENCE_CHANGED');
  r=ok(await rejectDraft(r));r=ok(await propose(r));r=ok(await review(r));assert.equal(r.current_status,'RESPONDED');
 });
 await t.test('partial delivery remains follow-up; subsequent replies preserve both downloadable versions',async()=>{
  const firstProof=await freshProof('Synthetic profile subset'),secondProof=await freshProof('Synthetic supplemental subset');
  let r=ok(await propose(await create(),firstProof,['Other requested records still require review']));r=ok(await review(r));assert.equal(r.current_status,'FOLLOW_UP');
  assert.equal((await call('GET','/requests/'+r.id+'/evidence/'+firstProof.id+'/content',outsider)).error.code,'PRIVACY_REQUEST_NOT_FOUND');
  assert.equal((await call('GET','/requests/'+r.id+'/evidence/'+firstProof.id+'/content',buyer,undefined,null,key(),buyer.personal_party_id)).error.code,'ACTING_PARTY_NOT_ALLOWED');
  r=ok(await propose(r,secondProof));r=ok(await review(r));assert.equal(r.current_status,'RESPONDED');assert.equal(ok(await history(r)).responses.length,2);
  for(const [proof,bytes] of [[firstProof,'Synthetic profile subset'],[secondProof,'Synthetic supplemental subset']])assert.equal((await call('GET','/requests/'+r.id+'/evidence/'+proof.id+'/content')).bytes.toString(),bytes);
 });
 await t.test('no failed approval creates a response notification, history or successful command',async()=>{
  const r=ok(await propose(await create())),operation=key();S.files.delete(file.object_key);
  try{rejects(await review(r,operation));const [[events]]=await db.execute("SELECT COUNT(*) n FROM ops_events WHERE domain='PRIVACY' AND record_id=?",[r.id]);assert.equal(Number(events.n),0);assert.equal(ok(await history(r)).responses.length,0);}
  finally{S.files.set(file.object_key,original);}
  const attempts=await Promise.all([review(r,operation),review(r,operation)]);assert.deepEqual(ok(attempts[0]),ok(attempts[1]));assert.equal(ok(await history(r)).responses.length,1);
 });
 await t.test('clients cannot forge the server attachment snapshot or submit another operator evidence',async()=>{
  const r=await create();const forged={response:'Synthetic',outcome:'INFORMATION_PROVIDED',evidence_asset_ids:[proof.id],retentions:[],remaining_actions:[],files:[{id:proof.id}]};
  assert.notEqual((await call('POST','/operations/requests/'+r.id+'/response',producer,{result:forged},r.object_version)).status,200);
  const other=await S.upload(outsider,'REVIEW_EVIDENCE');assert.equal((await propose(r,other)).error.code,'PRIVACY_EVIDENCE_OWNER_REQUIRED');
 });

 await fs.mkdir(path.resolve(__dirname,'../../../..','.local/privacy-response-delivery-20261109'),{recursive:true});
 await fs.writeFile(path.resolve(__dirname,'../../../..','.local/privacy-response-delivery-20261109/http.json'),JSON.stringify({synthetic_only:true,cases:fixtures},null,2));
 }finally{if(server)await new Promise(r=>server.close(r));if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
});
