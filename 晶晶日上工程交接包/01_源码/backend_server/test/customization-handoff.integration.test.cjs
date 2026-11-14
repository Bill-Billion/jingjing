'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator'),{createAccountApi}=require('../src/http/account-api');
test('company delivery handoff preserves first receipt, current authority and original final payment',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));for(const [k,v] of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name=`jx_test_${process.pid}_${randomBytes(6).toString('hex')}`,control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server,oldDirectory;
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});
  oldDirectory=await fs.mkdtemp(path.join(os.tmpdir(),'jx-delivery-migration-'));const migrations=path.resolve(__dirname,'../migrations/mysql-runtime');
  for(const f of await fs.readdir(migrations))if(/^\d{4}_.*\.sql$/.test(f)&&f.slice(0,4)<='0224')await fs.copyFile(path.join(migrations,f),path.join(oldDirectory,f));
  await migrate(db,{directory:oldDirectory});
  const S=await require('./support/customization-delivery.cjs').seed(db),{buyer:owner,outsider:first,artist:next,producer,reviewer}=S.people;
  const org=await S.parties.createOrganization(owner.ctx,{display_name:'Synthetic delivery handoff company',operation_key:key()}),future=()=>new Date(Date.now()+86400000).toISOString();
  for(const user of [first,next]){const inv=await S.parties.inviteMember(owner.ctx,{party_id:org.party_id,invitee_account_id:user.account_id,expires_at:future(),operation_key:key()});await S.parties.respondInvitation(user.ctx,{party_id:org.party_id,invitation_id:inv.invitation_id,decision:'ACCEPT',expected_version:1,operation_key:key()});}
  await db.execute("UPDATE parties SET current_status='ACTIVE' WHERE id=?",[org.party_id]);
  let onRead=null;const storageFactory=()=>({...S.storageFactory(),async getBuffer(k){const fn=onRead;onRead=null;if(fn)await fn();return S.files.get(k);}});
  server=createAccountApi({db,secret:S.secret,supplyStorageFactory:storageFactory,tradeEnv:{CUSTOMIZATION_MERCHANT_PARTY_ID:S.org.party_id,CUSTOMIZATION_CONTRACT_POLICY:'CONTRACT_20261029'}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port+'/api/v1',fixtures=[],checks=[];
  async function call(method,url,{user=next,party=org.party_id,body,version,op=key(),schema='ProductionRecordResponse'}={}){const r=await fetch(base+url,{method,headers:{Authorization:'Bearer '+user.token,...(party?{'X-Acting-Party':party}:{}),...(body===undefined?{}:{'Content-Type':Buffer.isBuffer(body)?'application/octet-stream':'application/json','Idempotency-Key':op}),...(version?{'If-Match':'"'+version+'"'}:{})},...(body===undefined?{}:{body:Buffer.isBuffer(body)?body:JSON.stringify(body)})});if(!r.headers.get('content-type')?.includes('json'))return {status:r.status,bytes:Buffer.from(await r.arrayBuffer())};const value=await r.json();fixtures.push({method,path:new URL(base+url).pathname,schema:r.ok?schema:'ErrorResponse',value});return {status:r.status,...value};}
  const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.data;},bad=(r,code)=>assert.equal(r.error?.code,code,JSON.stringify(r)),sub=(n,fn)=>t.test(n,async()=>{await fn();checks.push({name:n,result:'PASS'});});
  const prefix='/parties/'+org.party_id+'/representatives';
  async function grant(user){let r=ok(await call('POST',prefix,{user:owner,body:{account_id:user.account_id,scope:'TRADE',expires_at:future()},schema:'RepresentativeResponse'}));return ok(await call('POST',prefix+'/'+r.id+'/actions',{user,body:{action:'ACCEPT'},version:r.object_version,schema:'RepresentativeResponse'}));}
  const revoke=g=>call('POST',prefix+'/'+g.id+'/actions',{user:owner,body:{action:'REVOKE'},version:g.object_version,schema:'RepresentativeResponse'}).then(ok);
  let firstGrant=await grant(first),nextGrant=await grant(next);
  const merchant={user:producer,party:S.org.party_id},operator={user:reviewer,party:null},calendar=require('./support/working-calendar.cjs')();
  const {order,story}=await S.newOrder({preview:'SCRIPT_BEFORE_INTERIM',calendar,commissioner:{...owner,acting_party_id:org.party_id}}),contract=structuredClone(order.data.contract);
  let project=ok(await call('POST','/production/projects',{...merchant,body:{order_id:order.id,line_id:'film',script_version_id:S.work.id,license_project_id:null,assignee_account_id:producer.account_id,purpose:'PRIVATE',territory:'CN',consent_ids:[],evidence_asset_id:S.proof.id,fulfillment:{uses_identifiable_people:false,cast:[]}}}));
  const projectPath='/production/projects/'+project.id,read=()=>call('GET','/production/records/'+project.id,merchant).then(ok),flow=()=>call('GET',projectPath+'/fulfillment',{user:owner,schema:'CustomizationFulfillmentResponse'}).then(ok);
  const checklist=stage=>stage==='SCRIPT'?{script_reviewed:true}:{script_reviewed:true,specification_reviewed:true,audio_reviewed:true,branding_reviewed:true};
  async function review(r){return ok(await call('POST','/production/records/'+r.id+'/reviews',{...operator,version:r.object_version,body:{decision:'APPROVED',reason:'Synthetic independent',verification:r.kind==='PROJECT'?{contract_sha256:r.data.contract_sha256,identity_verified:true,signatures_verified:true,rights_verified:true}:{...checklist(r.data.stage),...(r.data.stage==='SCRIPT'?{}:{commercial_watermark_verified:true,ai_label_verified:true})}}}));}
  async function command(action,body={},extra={}){return call('POST',projectPath+'/'+action,{body,version:(await read()).object_version,schema:'CustomizationFulfillmentResponse',...extra});}
  async function deliver(stage){const file=async mark=>ok(await call('POST',projectPath+'/files?media_type='+encodeURIComponent(stage==='SCRIPT'?'text/plain':'video/mp4'),{...merchant,body:Buffer.from('Synthetic '+stage+' '+mark+' '+key())}));const final=await file('final'),preview=stage==='SCRIPT'?final:await file('preview');return review(ok(await call('POST',projectPath+'/versions',{...merchant,body:{stage,file_id:final.id,preview_file_id:preview.id,note:'Synthetic deliverable'},version:(await read()).object_version})));}
  const content=(v,user=next,variant='preview')=>call('GET','/production/versions/'+v.id+'/content?variant='+variant,{user});
  const notice=async(user=next)=>{const r=(await flow()).receipt;return call('POST','/operations/notifications/'+r.notification_event_id+'/read',{user,body:{},schema:'OpsReadResponse'});};
  const feedback=(v,user=next,extra={})=>call('POST','/production/versions/'+v.id+'/feedback',{user,body:{decision:'ACCEPT',note:'Synthetic current company decision',checklist:checklist(v.data.stage),change_kind:null},version:v.object_version,...extra});
  const views=delivery=>(db.execute('SELECT * FROM production_delivery_views WHERE delivery_id=? ORDER BY account_id',[delivery])).then(r=>r[0]);
  project=await review(project);const payments=[await S.pay(order,'first',{...owner,acting_party_id:org.party_id})];ok(await command('start',{},merchant));
  let script=await deliver('SCRIPT'),sample,rough,final,scriptDelivery,finalReceipt;
  await sub('0224 upgrades with a legacy first-reader receipt unchanged and repeated 0225 application is idempotent',async()=>{
   // This historical observation is synthetic; it is not a fresh HTTP read or a production database.
   const state=require('../src/modules/production/customization-state');
   await db.withTransaction(async tx=>{const d=await state.get(tx,project);d.receipt.buyer_account_id=first.account_id;d.receipt.view_observed_at=await state.now(tx);await state.put(tx,project,d);});
   const before=(await db.execute('SELECT data_json,data_sha256 FROM production_fulfillments WHERE project_id=?',[project.id]))[0][0];
   assert.equal(Number((await db.execute("SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='production_delivery_views'"))[0][0].n),0);
   await migrate(db);await migrate(db);
   assert.deepEqual((await db.execute('SELECT data_json,data_sha256 FROM production_fulfillments WHERE project_id=?',[project.id]))[0][0],before);
   assert.equal(Number((await db.execute("SELECT COUNT(*) n FROM platform_schema_migrations WHERE version='0225' AND status='APPLIED'"))[0][0].n),1);
   assert.deepEqual(await views((await flow()).receipt.delivery_id),[]);
  });
  await sub('a new representative must personally read the current preview and notification before taking over',async()=>{
   assert.equal((await content(script,first)).status,200);scriptDelivery=(await flow()).receipt.delivery_id;
   firstGrant=await revoke(firstGrant);bad(await command('delivery-receipt'),'CUSTOMIZATION_PREVIEW_NOT_VIEWED');bad(await feedback(script),'CUSTOMIZATION_PREVIEW_NOT_VIEWED');
   assert.equal((await content(script)).status,200);bad(await command('delivery-receipt'),'CUSTOMIZATION_NOTIFICATION_NOT_RECEIVED');ok(await notice());const result=ok(await command('delivery-receipt'));assert.equal(result.receipt.buyer_account_id,next.account_id);assert.equal(result.receipt.deadline_at,null);assert.equal(result.receipt.started_at,null);
   const list=await views(scriptDelivery);assert.deepEqual(list.map(x=>x.account_id).sort(),[first.account_id,next.account_id].sort());assert.ok(list.every(x=>x.project_id===project.id&&x.version_id===script.id&&x.buyer_party_id===org.party_id));
   assert.equal(list.find(x=>x.account_id===first.account_id).source_code,'LEGACY_RECEIPT');assert.equal(list.find(x=>x.account_id===next.account_id).source_code,'HTTP_PRIVATE_BYTES');
   assert.equal((await content(script,first)).status,403);assert.equal((await command('delivery-receipt',{}, {user:first})).status,403);
   ok(await feedback(script));payments.push(await S.pay(order,'interim',{...next,acting_party_id:org.party_id}));assert.equal(payments[1].data.amount_minor,4000);
  });
  await sub('another viewer never overwrites a completed receipt and each actor feedback uses their own read',async()=>{
   sample=await deliver('SAMPLE');assert.equal((await content(sample)).status,200);ok(await notice());ok(await command('delivery-receipt'));const original=structuredClone((await flow()).receipt);
   assert.equal((await content(sample,owner)).status,200);ok(await notice(owner));ok(await command('delivery-receipt',{}, {user:owner}));assert.deepEqual((await flow()).receipt,original);
   nextGrant=await revoke(nextGrant);assert.equal((await feedback(sample)).status,403);const f=ok(await feedback(sample,owner));assert.equal(f.created_by,owner.account_id);assert.deepEqual(f.data.acceptance_receipt,original);
  });
  await sub('failed or revoked reads do not create evidence; a reissue needs fresh bytes even for the same version',async()=>{
   nextGrant=await grant(next);rough=await deliver('ROUGH_CUT');const old=(await flow()).receipt;
   const stored=(await db.execute('SELECT data_json FROM production_records WHERE id=?',[rough.data.preview_file_id]))[0][0].data_json,metadata=typeof stored==='string'?JSON.parse(stored):stored,original=S.files.get(metadata.object_key);
   S.files.set(metadata.object_key,Buffer.from('Synthetic corrupted transport'));try{bad(await content(rough),'PRIVATE_CONTENT_MISMATCH');}finally{S.files.set(metadata.object_key,original);}
   assert.equal((await views(old.delivery_id)).length,0);
   onRead=async()=>{nextGrant=await revoke(nextGrant);};assert.equal((await content(rough)).status,403);assert.equal((await views(old.delivery_id)).length,0);
   nextGrant=await grant(next);assert.equal((await content(rough)).status,200);ok(await notice());
   ok(await command('reissue',{version_id:rough.id,reason:'Synthetic renewed formal delivery'},merchant));const current=(await flow()).receipt;assert.notEqual(current.delivery_id,old.delivery_id);ok(await notice());
   bad(await command('delivery-receipt'),'CUSTOMIZATION_PREVIEW_NOT_VIEWED');bad(await feedback(rough),'CUSTOMIZATION_PREVIEW_NOT_VIEWED');assert.equal((await views(old.delivery_id)).length,1);
   assert.equal((await content(rough)).status,200);ok(await command('delivery-receipt'));ok(await feedback(rough));
  });
  await sub('concurrent current company viewers create one observation each and one immutable final deadline',async()=>{
   final=await deliver('FINAL');await Promise.all([content(final),content(final),content(final,owner)].map(async p=>assert.equal((await p).status,200)));
   await Promise.all([notice().then(ok),notice(owner).then(ok)]);const version=(await read()).object_version;
   const calls=await Promise.all([call('POST',projectPath+'/delivery-receipt',{body:{},version,schema:'CustomizationFulfillmentResponse'}),call('POST',projectPath+'/delivery-receipt',{user:owner,body:{},version,schema:'CustomizationFulfillmentResponse'})]);assert.deepEqual(calls.map(x=>x.status).sort(),[200,412]);
   finalReceipt=structuredClone((await flow()).receipt);assert.ok(finalReceipt.started_at);assert.ok(finalReceipt.deadline_at);assert.equal(finalReceipt.deadline_basis.mode,'WORKING_DAYS');
   assert.equal((await views(finalReceipt.delivery_id)).length,2);assert.equal(Number((await db.execute("SELECT COUNT(*) n FROM platform_jobs WHERE task_type='CUSTOMIZATION_ACCEPTANCE' AND business_key=?",[finalReceipt.delivery_id]))[0][0].n),1);
   ok(await command('delivery-receipt',{}, {user:owner}));assert.deepEqual((await flow()).receipt,finalReceipt);
  });
  await sub('same company completes final acceptance and last payment; duplicate final downloads keep one completion fact',async()=>{
   bad(await content(final,owner,'final'),'FINAL_DELIVERY_NOT_READY');nextGrant=await revoke(nextGrant);assert.equal((await feedback(final)).status,403);
   const f=ok(await feedback(final,owner));assert.deepEqual(f.data.acceptance_receipt,finalReceipt);bad(await content(final,owner,'final'),'FINAL_DELIVERY_NOT_READY');
   payments.push(await S.pay(order,'last',{...owner,acting_party_id:org.party_id}));assert.deepEqual(payments.map(x=>x.data.amount_minor),[3000,4000,3000]);
   const a=await content(final,owner,'final'),b=await content(final,owner,'final');assert.equal(a.status,200);assert.deepEqual(a.bytes,b.bytes);
   assert.equal((await flow()).state,'DELIVERED');assert.equal(Number((await db.execute("SELECT COUNT(*) n FROM ops_events WHERE record_id=? AND event_code='CUSTOMIZATION_FULFILLED'",[project.id]))[0][0].n),1);
   assert.deepEqual(ok(await call('GET','/trade/records/'+order.id,{user:owner,schema:'TradeRecordResponse'})).data.contract,contract);
   assert.equal((await S.stories.get(producer.ctx,{request_id:story.id,party_id:null})).submission.content_sha256,story.submission.content_sha256);
   assert.equal((await content(final)).status,403);
  });
  const out=path.resolve(__dirname,'../../../../.local');await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'customization-handoff-http.json'),JSON.stringify({synthetic_only:true,cases:fixtures},null,2));await fs.writeFile(path.join(out,'customization-handoff-records.json'),JSON.stringify({checks,order_id:order.id,project_id:project.id,payment_ids:payments.map(x=>x.id),final_receipt:finalReceipt,synthetic_prerequisites:['company approval','specification quote and original order repository','private stored placeholder bytes','payment provider observations','working calendar'],frontend:false,real_services:false},null,2));
 }finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();if(oldDirectory){assert.equal(path.dirname(path.resolve(oldDirectory)),path.resolve(os.tmpdir()));assert.ok(path.basename(oldDirectory).startsWith('jx-delivery-migration-'));await fs.rm(oldDirectory,{recursive:true,force:true});}}
});
