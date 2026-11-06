'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {digest}=require('../src/modules/governance/content');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
test('personal copy provides bounded records and actual private bytes without claiming complete fulfilment',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 for(const [k,v] of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name=`jx_test_${process.pid}_${randomBytes(6).toString('hex')}`,control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
  const S=await require('./support/customization-delivery.cjs').seed(db),{buyer,outsider,producer}=S.people;
  const own=await S.actorCast(buyer),other=await S.actorCast(outsider);
  const repo=require('../src/modules/privacy/repository').createPrivacyRepository(db,{resolvePrincipal:S.resolvePrincipal,storageFactory:S.storageFactory});
  const request=await repo.create(buyer.ctx,{request:{type:'COPY',scopes:['ALL'],details:'Synthetic portable personal data copy'},operation_key:key()});
  const restricted=await repo.create(buyer.ctx,{request:{type:'COPY',scopes:['PROFILE'],details:'Synthetic profile only'},operation_key:key()});
  const deletion=await repo.create(buyer.ctx,{request:{type:'DELETE',scopes:['ALL'],details:'Synthetic deletion only'},operation_key:key()});
  let afterRead=null;const storageFactory=()=>({...S.storageFactory(),async getBuffer(k){const b=await S.storageFactory().getBuffer(k);if(afterRead)await afterRead();return b;}});
  server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${server.address().port}/api/v1/privacy/requests/`,fixtures=[];
  async function get(suffix,person=buyer,r=request,party){const response=await fetch(base+r.id+suffix,{headers:{Authorization:'Bearer '+person.token,...party?{'X-Acting-Party':party}:{}}});const value=await response.json();fixtures.push({method:'GET',path:'/api/v1/privacy/requests/'+r.id+suffix.split('?')[0],schema:response.status===200?(suffix==='/copy-options'?'PrivacyCopyOptionsResponse':'PrivacyDataExportResponse'):'ErrorResponse',value});return {status:response.status,...value};}
  const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.data;};
  const bad=(r,code)=>assert.equal(r.error?.code,code,JSON.stringify(r));
  await t.test('seven categories are explicit; no automatic copy request completion',async()=>{
   const d=ok(await get('/copy-options'));assert.equal(d.categories.length,7);assert.equal(d.request_completion,'NOT_CONFIRMED');assert.ok(d.categories.every(c=>c.remaining));
   assert.deepEqual(ok(await get('/copy-options',buyer,restricted)).categories.map(c=>c.category),['PROFILE']);
   bad(await get('/copy-options',outsider),'PRIVACY_REQUEST_NOT_FOUND');bad(await get('/copy-options',producer),'PRIVACY_REQUEST_NOT_FOUND');bad(await get('/copy-options',buyer,request,buyer.personal_party_id),'ACTING_PARTY_NOT_ALLOWED');bad(await get('/copy-options',buyer,deletion),'PRIVACY_ACTION_SCOPE_MISMATCH');
  });
  await t.test('new and legacy authorizations paginate without leaking other people or review internals',async()=>{
   let cursor='',rows=[];do{const p=ok(await get('/data?category=CONTRACTS&limit=1'+(cursor?'&cursor='+cursor:'')));rows.push(...p.items);cursor=p.next_cursor;}while(cursor);
   assert.ok(rows.some(r=>r.id===own.production.id));assert.ok(rows.some(r=>r.id===own.roster.cast[0].supply_consent_id));assert.ok(!rows.some(r=>r.id===other.production.id));assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);
   assert.ok(rows.every(r=>r.records.every(x=>!('review' in x.consent)&&!('evidence_asset_ids' in x.consent))));
   assert.ok(rows.find(r=>r.id===own.production.id).records[0].consent.terms);
   bad(await get('/data?category=CONTRACTS',buyer,restricted),'PRIVACY_ACTION_SCOPE_MISMATCH');
  });
  await t.test('same ID in two record domains is grouped, not lost between pages',async()=>{
   const id=own.production.id;
   await db.execute("INSERT INTO supply_records(id,kind,stream_ref,revision,owner_party_id,created_by,current_status,object_version,data_json,data_sha256) SELECT ?,'CONSENT',?,1,owner_party_id,created_by,current_status,object_version,data_json,data_sha256 FROM supply_records WHERE id=?",[id,'synthetic-collision:'+id,own.roster.cast[0].supply_consent_id]);
   const d=ok(await get('/data?category=CONTRACTS&limit=100'));assert.equal(d.items.find(r=>r.id===id).records.length,2);
  });
  await t.test('model record belongs to consent subject, not to uploader or producer',async()=>{
   const q=await S.newOrder(),project=key(),data={buyer_party_id:buyer.personal_party_id,producer_party_id:S.org.party_id,consent_ids:[own.roster.cast[0].supply_consent_id]};
   await db.execute("INSERT INTO production_records(id,kind,order_id,created_by,current_status,data_json,data_sha256) VALUES (?,'PROJECT',?,?,'READY',?,?)",[project,q.order.id,producer.account_id,JSON.stringify(data),digest(data)]);
   const model=async(c)=>{const id=key(),d={consent_id:c.roster.cast[0].supply_consent_id,avatar_id:c.avatar.id,asset_type:'LONG_LIVED_AVATAR',upstream_asset_ref:'secret-provider-model',config_revision:'private-revision'};await db.execute("INSERT INTO production_records(id,kind,project_id,order_id,created_by,current_status,data_json,data_sha256) VALUES (?,'DIGITAL_ASSET',?,?,?,'READY',?,?)",[id,project,q.order.id,producer.account_id,JSON.stringify(d),digest(d)]);return id;};
   const mine=await model(own),foreign=await model(other);const d=ok(await get('/data?category=DIGITAL_MODELS'));
   assert.ok(d.items.some(r=>r.id===mine));assert.ok(!d.items.some(r=>r.id===foreign));assert.ok(!JSON.stringify(d).includes('secret-provider'));assert.ok(!JSON.stringify(d).includes('private-revision'));
  });
  await t.test('stored authorization corruption cannot become a trusted copy',async()=>{
   const [[old]]=await db.execute('SELECT data_sha256 FROM artist_records WHERE id=?',[own.production.id]);
   try{await db.execute('UPDATE artist_records SET data_sha256=? WHERE id=?',['0'.repeat(64),own.production.id]);assert.equal((await get('/data?category=CONTRACTS')).status,503);await assert.rejects(repo.exportData(buyer.ctx,{request_id:request.id,category:'CONTRACTS',limit:20}),e=>e.code==='STORED_CONTENT_MISMATCH');}
   finally{await db.execute('UPDATE artist_records SET data_sha256=? WHERE id=?',[old.data_sha256,own.production.id]);}
  });
  const asset=async id=>(await db.execute('SELECT id,content_sha256 FROM supply_assets WHERE id=?',[id]))[0][0];
  const material=await asset(own.look.data.material_asset_ids[0]),content=await S.upload(buyer,'WORK_CONTENT'),foreign=await asset(other.look.data.material_asset_ids[0]),evidence=await asset(own.production.data.evidence_asset_ids[0]);
  const download=(asset,category,person=buyer,r=request)=>fetch(base+r.id+'/copies/'+asset.id+'/content?category='+category,{headers:{Authorization:'Bearer '+person.token}});
  await t.test('actual file bytes match recorded hash; wrong person, purpose and request scope rejected',async()=>{
   for(const [asset,category] of [[material,'ARTIST_MATERIALS'],[content,'CONTENT']]){const response=await download(asset,category);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(require('node:crypto').createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'),asset.content_sha256);}
   for(const [asset,cat,person,r,status] of [[foreign,'ARTIST_MATERIALS',buyer,request,404],[evidence,'ARTIST_MATERIALS',buyer,request,404],[material,'CONTENT',buyer,request,404],[material,'ARTIST_MATERIALS',outsider,request,404],[material,'ARTIST_MATERIALS',producer,request,404],[material,'ARTIST_MATERIALS',buyer,restricted,409],[material,'ARTIST_MATERIALS',buyer,deletion,409]])assert.equal((await download(asset,cat,person,r)).status,status);
  });
  await t.test('withdrawn access during storage read cannot send bytes to the client',async()=>{
   afterRead=()=>db.execute("UPDATE supply_assets SET current_status='FAILED' WHERE id=?",[material.id]);
   try{const r=await download(material,'ARTIST_MATERIALS');assert.equal(r.status,409);assert.equal((await r.json()).error.code,'PRIVATE_MATERIAL_NOT_READY');}
   finally{afterRead=null;await db.execute("UPDATE supply_assets SET current_status='READY' WHERE id=?",[material.id]);}
   assert.equal((await repo.read(buyer.ctx,{request_id:request.id})).current_status,'RECEIVED');
  });
  const out=path.resolve(__dirname,'../../../..','.local/prelaunch-20261106/privacy-copy-http.json');await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify({synthetic_only:true,cases:fixtures},null,2));
 }finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
});
