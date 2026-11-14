'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator'),{digest}=require('../src/modules/governance/content');
test('audition publication requires current agent identity while withdrawal and old reads survive',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 for(const [k,v]of Object.entries({NODE_ENV:'test',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name='jx_test_'+process.pid+'_'+randomBytes(6).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});
 let db,server;const fixtures=[];
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
  const S=await require('./helpers/auditions-seed.cjs').seedAuditions(db),{seller,outsider,reviewer,parties:P}=S;
  const org=await P.createOrganization(outsider.ctx,{display_name:'Synthetic audition agency',operation_key:key()});
  await db.execute("INSERT INTO party_capabilities(party_id,code,current_status) VALUES (?,'MCN','ACTIVE')",[org.party_id]);
  const relation=key(),data={valid_from:'2020-01-01T00:00:00.000Z',valid_until:'2099-01-01T00:00:00.000Z',accepted_by:seller.account_id};
  // Isolated fixture of an existing agency relationship; publication uses actual HTTP.
  await db.execute("INSERT INTO gig_records(id,kind,owner_party_id,counterparty_id,created_by,current_status,data_json,data_sha256) VALUES (?,'RELATION',?,?,?,'ACTIVE',?,?)",[relation,org.party_id,seller.personal_party_id,outsider.account_id,JSON.stringify(data),digest(data)]);
  const delegation=await S.artists.createDelegation(seller.ctx,{person_id:seller.person.id,party_id:seller.personal_party_id,delegation:{organization_party_id:org.party_id,relation_id:relation,actions:['MANAGE_AUDITIONS','READ_PROFILE'],valid_from:data.valid_from,valid_until:data.valid_until,evidence_asset_ids:[S.evidence.id],terms:'Synthetic audition management'},operation_key:key()});
  server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1';
  async function call(method,url,body,{user=outsider,party=org.party_id,op=key(),version}={}){
   const r=await fetch(base+url,{method,headers:{Authorization:'Bearer '+user.token,...(party?{'X-Acting-Party':party}:{}),...(body!==undefined?{'Content-Type':'application/json','Idempotency-Key':op}:{}),...(version?{'If-Match':'"'+version+'"'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});const value=await r.json();fixtures.push({method,path:new URL(base+url).pathname,schema:r.ok?'AuditionResponse':'ErrorResponse',value});return {status:r.status,...value};
  }
  const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.data;},denied=r=>{assert.equal(r.status,409,JSON.stringify(r));assert.equal(r.error.code,'VERIFIED_ADULT_REQUIRED');};
  const input={offer:{...S.offer,mode:'ONLINE_MATERIALS'}},createOp=key();let offer,person,opened;
  const publish=(op=key())=>call('POST','/auditions/offers',input,{op});
  const visibility=(public_booking,op=key(),version=offer.object_version)=>call('POST','/auditions/offers/'+offer.id+'/visibility',{public_booking,public_price:true},{op,version});
  const row=async()=>{const r=(await db.execute('SELECT current_status,object_version,data_sha256 FROM audition_records WHERE id=?',[offer.id]))[0][0];return r;};
  const counts=async()=>({offers:Number((await db.execute("SELECT COUNT(*) n FROM audition_records WHERE kind='OFFER'"))[0][0].n),commands:Number((await db.execute('SELECT COUNT(*) n FROM audition_commands'))[0][0].n)});
  await t.test('agent without own identity cannot submit an artist audition offer',async()=>{const before=await counts();denied(await publish());assert.deepEqual(await counts(),before);});
  person=await S.person(outsider,false);
  await t.test('unverified agent cannot submit despite verified artist and agency authority',async()=>{const before=await counts();denied(await publish());assert.deepEqual(await counts(),before);});
  const fingerprint=randomBytes(32).toString('hex');
  async function verify(){const r=await S.artists.prepareIdentity(outsider.ctx,{party_id:outsider.personal_party_id,person_id:person.id,session_ref:'synthetic:'+key(),operation_key:key()});await S.artists.applyIdentity(r.id,{request_key:r.data.request_key,person_id:person.id,status:'VERIFIED',issuer:'synthetic-provider',subject_fingerprint:fingerprint,age_band:'ADULT',valid_until:'2099-01-01T00:00:00.000Z',evidence_ref:'synthetic:identity',liveness_verified:true,phone_verified:true});}
  await verify();
  await t.test('verified agent submits and independent reviewer publishes the same artist offer',async()=>{
   offer=ok(await publish(createOp));assert.equal(offer.owner_party_id,seller.personal_party_id);assert.equal(offer.created_by,outsider.account_id);
   assert.equal(ok(await publish(createOp)).id,offer.id);
   offer=ok(await call('POST','/auditions/offers/'+offer.id+'/reviews',{decision:'APPROVE',reason:'Independent synthetic publication'},{user:reviewer,party:null,version:offer.object_version}));assert.equal(offer.current_status,'PUBLISHED');
   assert.equal(Number((await db.execute("SELECT COUNT(*) n FROM artist_records WHERE person_id=? AND kind='HALO'",[person.id]))[0][0].n),0);
  });
  offer=ok(await visibility(false));const openOp=key(),openVersion=offer.object_version;
  await t.test('valid agent can reopen and replay the original operation once',async()=>{opened=ok(await visibility(true,openOp,openVersion));offer=opened;assert.deepEqual(ok(await visibility(true,openOp,openVersion)),opened);});
  for(const state of ['EXPIRED','REJECTED','UNVERIFIED']){
   await db.execute("UPDATE artist_people SET identity_status=?,identity_valid_until=? WHERE id=?",[state==='EXPIRED'?'VERIFIED':state,state==='EXPIRED'?'2020-01-01 00:00:00':'2099-01-01 00:00:00',person.id]);
   for(const [label,fn]of [['new offer',()=>publish()],['successful offer replay',()=>publish(createOp)],['new reopening',()=>visibility(true)],['successful reopening replay',()=>visibility(true,openOp,openVersion)]]){
    await t.test(state+' agent cannot use '+label,async()=>{const before=await counts(),snapshot=await row();denied(await fn());assert.deepEqual(await counts(),before);assert.deepEqual(await row(),snapshot);});
    // Keep later counterexamples independent if a broken implementation mutated the record.
    offer=ok(await call('GET','/auditions/records/'+offer.id));
   }
   await t.test(state+' agent retains authorized old offer reads',async()=>{const r=ok(await call('GET','/auditions/records/'+offer.id));assert.equal(r.id,offer.id);});
  }
  await t.test('unverified agent can close booking without losing the old offer',async()=>{offer=ok(await visibility(false));assert.equal(offer.data.offer.public_booking,false);assert.equal(offer.current_status,'PUBLISHED');});
  await t.test('identity recovery allows original create replay and a fresh reopening',async()=>{await verify();assert.equal(ok(await publish(createOp)).id,offer.id);offer=ok(await visibility(true));assert.equal(offer.data.offer.public_booking,true);});
  await t.test('valid identity does not replace revoked artist delegation',async()=>{
   await db.execute("UPDATE artist_records SET current_status='REVOKED' WHERE id=?",[delegation.id]);
   for(const invoke of [()=>publish(),()=>visibility(true)]){const r=await invoke();assert.equal(r.status,403,JSON.stringify(r));assert.equal(r.error.code,'ARTIST_DELEGATION_REQUIRED');}
  });
 }finally{
  await fs.mkdir(path.resolve(__dirname,'../../../../.local'),{recursive:true});await fs.writeFile(path.resolve(__dirname,'../../../../.local/audition-publisher-identity-http.json'),JSON.stringify({synthetic_only:true,cases:fixtures},null,2)+'\n');
  if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();
 }
});
