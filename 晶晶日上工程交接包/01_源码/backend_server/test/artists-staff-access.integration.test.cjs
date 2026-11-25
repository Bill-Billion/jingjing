'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
const {createAccountApi}=require('../src/http/account-api');
test('artist employee list and effective actions retain person and delegation boundaries',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 for(const [k,v]of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name='jx_test_artist_staff_'+randomBytes(8).toString('hex');let control,db,server,created=false;
 try{
  control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');created=true;db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
  const S=await require('./helpers/auditions-seed.cjs').seedAuditions(db),{seller,buyer,buyer2:employee,outsider:owner}=S;
  const org=await S.parties.createOrganization(owner.ctx,{display_name:'Synthetic scoped agency',operation_key:key()});
  await db.execute("INSERT INTO party_capabilities(party_id,code,current_status) VALUES (?,'MCN','ACTIVE')",[org.party_id]);
  const invitation=await S.parties.inviteMember(owner.ctx,{party_id:org.party_id,invitee_account_id:employee.account_id,expires_at:new Date(Date.now()+3600000).toISOString(),operation_key:key()});
  await S.parties.respondInvitation(employee.ctx,{party_id:org.party_id,invitation_id:invitation.invitation_id,expected_version:1,decision:'ACCEPT',operation_key:key()});
  const proof=await S.supply.upload(owner.ctx,{party_id:org.party_id,purpose:'CONSENT_EVIDENCE',media_type:'text/plain',body:Buffer.from('Synthetic agency agreement'),operation_key:key()});
  const gigs=require('../src/modules/gigs/repository').createGigsRepository(db,{resolvePrincipal:S.resolvePrincipal});
  let relation=await gigs.relation(owner.ctx,{party_id:org.party_id,artist_party_id:seller.personal_party_id,scope:'COMMERCIAL',valid_from:'2020-01-01T00:00:00.000Z',valid_until:'2099-01-01T00:00:00.000Z',exclusive:false,terms:'Synthetic existing agency relation',commission:{platform_bps:0,mcn_bps:0},evidence_asset_ids:[proof.id],operation_key:key()});
  relation=await gigs.relationDecision(seller.ctx,{record_id:relation.id,party_id:seller.personal_party_id,expected_version:relation.object_version,decision:'ACCEPT',reason:'Synthetic artist accepts',operation_key:key()});
  const mandate=await S.artists.createDelegation(seller.ctx,{person_id:seller.person.id,party_id:seller.personal_party_id,delegation:{organization_party_id:org.party_id,relation_id:relation.id,actions:['READ_PROFILE','MANAGE_MATERIALS','MANAGE_AUDITIONS'],valid_from:relation.data.valid_from,valid_until:relation.data.valid_until,evidence_asset_ids:[S.evidence.id],terms:'Only these three actions, no personal consent'},operation_key:key()});
  server=createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1';
  async function call(user,path,{body,party=org.party_id,version,operation=key()}={}){const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+user.token,'X-Acting-Party':party,...body===undefined?{}:{'Content-Type':Buffer.isBuffer(body)?'application/octet-stream':'application/json','Idempotency-Key':operation},...version?{'If-Match':'"'+version+'"'}:{}},...body===undefined?{}:{body:Buffer.isBuffer(body)?body:JSON.stringify(body)}});const bytes=Buffer.from(await r.arrayBuffer());let j;try{j=JSON.parse(bytes);}catch{}return {status:r.status,data:j?.data,error:j?.error,bytes};}
  const person='/artists/people/'+seller.person.id;
  function ok(r){assert.equal(r.status,200,JSON.stringify(r.error));return r.data;}
  async function grant(actions){return ok(await call(owner,'/engagement/mcn/staff',{body:{account_id:employee.account_id,person_ids:[seller.person.id],actions,valid_until:relation.data.valid_until}}));}
  await t.test('active member without any per-person grant has no delegated list',async()=>{assert.deepEqual(ok(await call(employee,'/artists/people')).items,[]);assert.equal((await call(employee,person)).status,403);});
  const readGrant=await grant(['READ_PROFILE']);
  await t.test('list and detail include assigned person without transferring ownership',async()=>{const list=ok(await call(employee,'/artists/people'));assert.deepEqual(list.items.map(p=>p.id),[seller.person.id]);const d=ok(await call(employee,person));assert.equal(d.person.owner_party_id,seller.personal_party_id);assert.deepEqual(d.allowed_actions,['READ_PROFILE']);assert(d.avatars.every(a=>a.owner_party_id===seller.personal_party_id));});
  await t.test('owner sees mandate actions; employee does not inherit all organization actions',async()=>{const d=ok(await call(owner,person));assert.deepEqual(new Set(d.allowed_actions),new Set(['READ_PROFILE','MANAGE_MATERIALS','MANAGE_AUDITIONS']));assert.equal((await call(employee,'/artists/people/'+buyer.person.id)).status,403);});
  await t.test('staff cannot read private consent or create personal authorization',async()=>{assert.equal((await call(employee,person+'/records?kind=CONSENT')).status,403);assert.notEqual((await call(employee,'/artists/assets/'+S.evidence.id)).status,200);const consent=Object.fromEntries(['features','purposes','grantee_party_id','territories','valid_from','valid_until','terms','evidence_asset_ids'].map(k=>[k,S.sampleConsent.data[k]]));const r=await call(employee,person+'/consents',{body:{avatar_id:S.avatar.id,consent}});assert.equal(r.status,404);assert.equal(r.error.code,'ARTIST_NOT_FOUND');});
  const materialsGrant=await grant(['MANAGE_MATERIALS']);
  let material;const uploadKey=key(),bytes=Buffer.from('Synthetic staff material remains artist owned');
  material=ok(await call(employee,person+'/assets?purpose=AVATAR_MATERIAL&media_type=text/plain',{body:bytes,operation:uploadKey}));
  await t.test('staff grant intersection enables only explicitly permitted material upload',async()=>{const d=ok(await call(employee,person));assert.deepEqual(new Set(d.allowed_actions),new Set(['READ_PROFILE','MANAGE_MATERIALS']));assert.equal(material.owner_party_id,seller.personal_party_id);assert.equal((await call(employee,'/artists/assets/'+material.id+'/content')).status,200);});
  ok(await call(owner,'/engagement/mcn/staff/'+materialsGrant.id+'/revoke',{body:{reason:'Withdraw materials only'},version:materialsGrant.object_version}));
  await t.test('material revocation removes action and rejects old-key upload replay',async()=>{assert.deepEqual(ok(await call(employee,person)).allowed_actions,['READ_PROFILE']);const r=await call(employee,person+'/assets?purpose=AVATAR_MATERIAL&media_type=text/plain',{body:bytes,operation:uploadKey});assert.equal(r.status,403);assert.equal(r.error.code,'MCN_EMPLOYEE_SCOPE_REQUIRED');assert.equal((await call(employee,'/artists/assets/'+material.id+'/content')).status,403);assert.equal((await call(seller,'/artists/assets/'+material.id+'/content',{party:seller.personal_party_id})).status,200);});
  ok(await call(owner,'/engagement/mcn/staff/'+readGrant.id+'/revoke',{body:{reason:'Withdraw profile scope'},version:readGrant.object_version}));
  await t.test('revoked staff disappears from list and cannot read previous detail',async()=>{assert.deepEqual(ok(await call(employee,'/artists/people')).items,[]);assert.equal((await call(employee,person)).status,403);});
  await grant(['READ_PROFILE']);
  await S.artists.withdraw(seller.ctx,{person_id:seller.person.id,party_id:seller.personal_party_id,record_id:mandate.id,expected_version:mandate.object_version,reason:'Artist withdraws mandate',operation_key:key()});
  await t.test('personal mandate withdrawal also removes owner and regranted employee access',async()=>{for(const u of [owner,employee]){assert.deepEqual(ok(await call(u,'/artists/people')).items,[]);assert.equal((await call(u,person)).status,403);}const self=ok(await call(seller,person,{party:seller.personal_party_id}));assert.equal(self.person.owner_party_id,seller.personal_party_id);assert.equal((await call(seller,'/artists/assets/'+material.id+'/content',{party:seller.personal_party_id})).status,200);});
 }finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await db?.close();if(created)await control.query('DROP DATABASE '+mysql.escapeId(name));await control?.end();}
});
