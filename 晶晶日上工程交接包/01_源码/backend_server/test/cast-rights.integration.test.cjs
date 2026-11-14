"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator'),{digest}=require('../src/modules/governance/content');
const {createAccountApi}=require('../src/http/account-api');
test('cast rights: current archive permission and explicit face/voice use',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));for(const [k,v] of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name=`jx_test_${process.pid}_${randomBytes(6).toString('hex')}`,control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;
 try{
 await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
 const f=await require('./support/customization-delivery.cjs').seed(db),{producer,buyer,reviewer,outsider,artist}=f.people;
 server=createAccountApi({db,secret:f.secret,supplyStorageFactory:f.storageFactory,tradeEnv:{CUSTOMIZATION_MERCHANT_PARTY_ID:f.org.party_id,CUSTOMIZATION_CONTRACT_POLICY:'CONTRACT_20261029'}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1',fixtures=[];
 async function call(method,url,who=producer,body,version=null,op=key(),party=who.acting_party_id){const res=await fetch(base+url,{method,headers:{Authorization:'Bearer '+who.token,...(party?{'X-Acting-Party':party}:{}),...(body===undefined?{}:{'Content-Type':Buffer.isBuffer(body)?'application/octet-stream':'application/json','Idempotency-Key':op}),...(version?{'If-Match':'"'+version+'"'}:{})},...(body===undefined?{}:{body:Buffer.isBuffer(body)?body:JSON.stringify(body)})});const binary=!(res.headers.get('content-type')||'').includes('application/json'),value=binary?Buffer.from(await res.arrayBuffer()):await res.json();if(!binary)fixtures.push({method,path:new URL(base+url).pathname,schema:res.status===200?((url.startsWith('/customization-requests')||url.startsWith('/operations/customization-requests'))?'CustomizationRequestResponse':url.includes('/fulfillment')||['/start','/cases','/case-resolution','/refund-sync','/delivery-receipt','/reissue'].some(x=>url.endsWith(x))?'CustomizationFulfillmentResponse':url.endsWith('/story')?'ProductionStoryResponse':url.startsWith('/operations')?'OpsReadResponse':url.startsWith('/trade/')?'TradeRecordResponse':'ProductionRecordResponse'):'ErrorResponse',value});return {status:res.status,data:value.data,error:value.error,body:value};}
 const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.data;},bad=(r,code)=>assert.equal(r.error?.code,code,JSON.stringify(r.body));
 const get=p=>call('GET','/production/records/'+p.id).then(ok),flow=p=>call('GET','/production/projects/'+p.id+'/fulfillment').then(ok);
 async function command(p,action,who,body={},op=key()){return call('POST','/production/projects/'+p.id+'/'+action,who,body,(await get(p)).object_version,op,who===reviewer?null:who.acting_party_id);}
 const checks=s=>s==='SCRIPT'?{script_reviewed:true}:{script_reviewed:true,specification_reviewed:true,audio_reviewed:true,branding_reviewed:true};
 async function review(r){return ok(await call('POST','/production/records/'+r.id+'/reviews',reviewer,{decision:'APPROVED',reason:'synthetic independent review',verification:r.kind==='PROJECT'?{contract_sha256:r.data.contract_sha256,identity_verified:true,signatures_verified:true,rights_verified:true}:{...checks(r.data.stage),...(r.data.stage==='SCRIPT'?{}:{commercial_watermark_verified:true,ai_label_verified:true})}},r.object_version,key(),null));}
 function input(order,fulfillment={uses_identifiable_people:false,cast:[]}){return {order_id:order.id,line_id:'film',script_version_id:f.work.id,license_project_id:null,assignee_account_id:producer.account_id,purpose:'PRIVATE',territory:'CN',consent_ids:fulfillment.cast.map(c=>c.supply_consent_id),evidence_asset_id:f.proof.id,fulfillment};}
 async function create(options={},roster){const source=await f.newOrder(options),project=ok(await call('POST','/production/projects',producer,input(source.order,roster)));return {...source,project:await review(project)};}
 async function upload(p,stage,bytes){return ok(await call('POST','/production/projects/'+p.id+'/files?media_type='+encodeURIComponent(stage==='SCRIPT'?'text/plain':'video/mp4'),producer,Buffer.from(bytes)));}
 async function deliver(p,stage){const file=await upload(p,stage,'synthetic full '+key()),preview=stage==='SCRIPT'?file:await upload(p,stage,'synthetic watermarked preview '+key());return review(ok(await command(p,'versions',producer,{stage,file_id:file.id,preview_file_id:preview.id,note:'synthetic reviewed version'})));}
 async function content(v,variant='preview',who=buyer){return call('GET','/production/versions/'+v.id+'/content?variant='+variant,who);}
 async function accept(v,decision='ACCEPT',kind=null){return call('POST','/production/versions/'+v.id+'/feedback',buyer,{decision,note:'synthetic buyer decision',checklist:decision==='ACCEPT'?checks(v.data.stage):null,change_kind:kind},(await get(v)).object_version);}
 async function viewed(v){assert.equal((await content(v)).status,200);}

 const originalWork=(await db.execute('SELECT data_json,data_sha256 FROM supply_records WHERE id=?',[f.work.id]))[0][0],records=[];
 let cast=await f.actorCast(artist),archiveId=cast.look.data.consent_id;
 const orderRead=o=>f.trade.read(buyer.ctx,{record_id:o.id,party_id:buyer.personal_party_id});
 await t.test('withdrawn archive blocks start and files while original payment and script remain unchanged',async()=>{
  const x=await create({},cast.roster);await f.pay(x.order,'first');const before=await orderRead(x.order),saved=await flow(x.project);const running=await create({},cast.roster);await f.pay(running.order,'first');ok(await command(running.project,'start',producer));
  await cast.repo.withdraw(artist.ctx,{party_id:artist.personal_party_id,person_id:cast.person.id,record_id:archiveId,expected_version:2,reason:'Stop archive use',operation_key:key()});
  bad(await command(x.project,'start',producer),'CUSTOMIZATION_VARIANT_CONSENT_REQUIRED');
  bad(await call('POST','/production/projects/'+running.project.id+'/files?media_type=text/plain',producer,Buffer.from('blocked')),'CUSTOMIZATION_VARIANT_CONSENT_REQUIRED');
  assert.deepEqual((await orderRead(x.order)).data,before.data);
  const stored=(await db.execute('SELECT data_json FROM production_fulfillments WHERE project_id=?',[x.project.id]))[0][0].data_json,d=typeof stored==='string'?JSON.parse(stored):stored;
  assert.equal(d.started_at,null);assert.deepEqual(d.cast_snapshot,saved.cast_snapshot);records.push({case:'archive_withdrawal',project_id:x.project.id,order_id:x.order.id,received_minor:before.data.financial.received_minor,script_id:f.work.id,archive_id:archiveId});
 });
 cast=await f.actorCast(artist,cast.person);archiveId=cast.look.data.consent_id;
 await t.test('archive expiry future start wrong grantee purpose and feature reject without creating a project',async()=>{
  const raw=(await db.execute('SELECT data_json,data_sha256 FROM artist_records WHERE id=?',[archiveId]))[0][0],data=typeof raw.data_json==='string'?JSON.parse(raw.data_json):raw.data_json;
  const {order}=await f.newOrder();
  for(const change of [{valid_until:'2020-01-01T00:00:00.000Z'},{valid_from:'2098-01-01T00:00:00.000Z'},{grantee_party_id:outsider.personal_party_id},{purposes:['PROJECT_PRODUCTION']},{features:['VOICE']}]){
   const changed={...data,...change};await db.execute('UPDATE artist_records SET data_json=?,data_sha256=? WHERE id=?',[JSON.stringify(changed),digest(changed),archiveId]);
   try{bad(await call('POST','/production/projects',producer,input(order,cast.roster)),'CUSTOMIZATION_VARIANT_CONSENT_REQUIRED');}
   finally{await db.execute('UPDATE artist_records SET data_json=?,data_sha256=? WHERE id=?',[JSON.stringify(data),raw.data_sha256,archiveId]);}
  }
  assert.equal((await db.execute("SELECT id FROM production_records WHERE order_id=? AND kind='PROJECT'",[order.id]))[0].length,0);
  const p=await review(ok(await call('POST','/production/projects',producer,input(order,cast.roster))));await f.pay(order,'first');ok(await command(p,'start',producer));
  const v=await deliver(p,'SCRIPT');await viewed(v);bad(await content(v,'preview',outsider),'PRODUCTION_NOT_FOUND');
 });
 await t.test('face-only rights cannot add voice; explicit voice grants permit it and later withdrawal blocks reuse',async()=>{
  const evidence=(await db.execute("SELECT id FROM supply_assets WHERE owner_party_id=? AND purpose='CONSENT_EVIDENCE' LIMIT 1",[artist.personal_party_id]))[0][0].id;
  async function grant(grantee,purposes){let r=await cast.repo.declareConsent(artist.ctx,{party_id:artist.personal_party_id,person_id:cast.person.id,avatar_id:cast.avatar.id,consent:{features:['VOICE'],purposes,grantee_party_id:grantee,territories:['CN'],valid_from:'2020-01-01T00:00:00.000Z',valid_until:'2099-01-01T00:00:00.000Z',terms:'Named use only, no marketing or model training',evidence_asset_ids:[evidence]},operation_key:key()});return cast.repo.review(reviewer.ctx,{person_id:cast.person.id,record_id:r.id,expected_version:r.object_version,decision:'APPROVE',reason:'synthetic independent',operation_key:key()});}
  const archive=await grant(artist.personal_party_id,['PRIVATE_ARCHIVE']);
  const voice=await cast.repo.createVariant(artist.ctx,{party_id:artist.personal_party_id,person_id:cast.person.id,avatar_id:cast.avatar.id,kind:'VOICE',variant:{previous_version_id:null,display_name:'synthetic voice',material_asset_ids:cast.look.data.material_asset_ids,consent_id:archive.id},operation_key:key()});
  const roster=structuredClone(cast.roster);roster.cast[0].voice_version_id=voice.id;const {order}=await f.newOrder();
  bad(await call('POST','/production/projects',producer,input(order,roster)),'CUSTOMIZATION_FEATURE_CONSENT_REQUIRED');
  let consent=await f.supply.createConsent(artist.ctx,{consent:{avatar_id:cast.avatar.id,subject_party_id:artist.personal_party_id,features:['FACE','VOICE'],purposes:['PRIVATE'],territories:['CN'],valid_from:'2020-01-01T00:00:00.000Z',valid_until:'2099-01-01T00:00:00.000Z',terms:'Face and voice for private production',evidence_asset_ids:[evidence]},operation_key:key()});consent=await f.supply.reviewConsent(reviewer.ctx,{record_id:consent.id,expected_version:consent.object_version,decision:'APPROVED',reason:'synthetic independent',operation_key:key()});roster.cast[0].supply_consent_id=consent.id;
  bad(await call('POST','/production/projects',producer,input(order,roster)),'ARTIST_CONSENT_REQUIRED');
  const wrong=await grant(outsider.personal_party_id,['PROJECT_PRODUCTION']);roster.cast[0].artist_consent_ids.push(wrong.id);bad(await call('POST','/production/projects',producer,input(order,roster)),'ARTIST_CONSENT_REQUIRED');
  const production=await grant(f.org.party_id,['PROJECT_PRODUCTION']);roster.cast[0].artist_consent_ids[1]=production.id;
  const originalKey=key(),p=await review(ok(await call('POST','/production/projects',producer,input(order,roster),null,originalKey)));await f.pay(order,'first');ok(await command(p,'start',producer));
  const v=await deliver(p,'SCRIPT');await viewed(v);const before=await orderRead(order),saved=await flow(p);assert.deepEqual(saved.cast_snapshot[0].versions.map(v=>v.id),[cast.look.id,voice.id]);
  await cast.repo.withdraw(artist.ctx,{party_id:artist.personal_party_id,person_id:cast.person.id,record_id:production.id,expected_version:production.object_version,reason:'Stop this voice production use',operation_key:key()});
  bad(await call('POST','/production/projects/'+p.id+'/files?media_type=text/plain',producer,Buffer.from('blocked reuse')),'ARTIST_CONSENT_REQUIRED');bad(await content(v),'ARTIST_CONSENT_REQUIRED');
  assert.deepEqual((await orderRead(order)).data,before.data);const raw=(await db.execute('SELECT data_json FROM production_fulfillments WHERE project_id=?',[p.id]))[0][0].data_json;assert.deepEqual((typeof raw==='string'?JSON.parse(raw):raw).cast_snapshot,saved.cast_snapshot);
  records.push({case:'explicit_voice_then_withdrawal',project_id:p.id,order_id:order.id,received_minor:before.data.financial.received_minor,script_id:f.work.id,versions:saved.cast_snapshot[0].versions,voice_consent_id:production.id});
 });
 await t.test('another person look and new-generation use cannot be substituted into existing-material cast',async()=>{
  const other=await f.registerActor('other'),foreign=await f.actorCast(other),{order}=await f.newOrder(),roster=structuredClone(cast.roster);roster.cast[0].look_version_id=foreign.look.id;
  bad(await call('POST','/production/projects',producer,input(order,roster)),'CUSTOMIZATION_VARIANT_MISMATCH');
  roster.cast[0].look_version_id=cast.look.id;roster.cast[0].usage='NEW_GENERATION';bad(await call('POST','/production/projects',producer,input(order,roster)),'ARTIST_CONSENT_REQUIRED');
  assert.deepEqual((await db.execute('SELECT data_json,data_sha256 FROM supply_records WHERE id=?',[f.work.id]))[0][0],originalWork);
 });
 await fs.writeFile(path.resolve(__dirname,'../../../..','.local/cast-rights-records.json'),JSON.stringify({synthetic_only:true,records,original_script_id:f.work.id,original_script_sha256:originalWork.data_sha256},null,2));
 await fs.mkdir(path.resolve(__dirname,'../../../..','.local'),{recursive:true});await fs.writeFile(path.resolve(__dirname,'../../../..','.local/cast-rights-http-fixtures.json'),JSON.stringify({synthetic_only:true,cases:fixtures},null,2));
 }finally{if(server)await new Promise(r=>{server.close(r);server.closeAllConnections();});if(db)await db.close();await control.query('DROP DATABASE '+mysql.escapeId(name));await control.end();}
});
