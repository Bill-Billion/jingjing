 'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),crypto=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database');
const {migrate}=require('../src/infrastructure/database/migrator');
const {createPartyRepository}=require('../src/modules/party/repository');
const key=()=>crypto.randomUUID();
const future=()=>new Date(Date.now()+3600000).toISOString();

test('MySQL party identity, consent, authority and transactional audit',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 assert.equal(env.NODE_ENV,'test');assert.equal(env.DB_CLIENT,'mysql');assert.equal(env.MYSQL_HOST,'127.0.0.1');assert.equal(env.MYSQL_PORT,'33316');assert.equal(env.MYSQL_USER,'jx_local');assert.equal(env.MYSQL_DATABASE,'jx_dev');
 const name=`jx_test_${process.pid}_${crypto.randomBytes(6).toString('hex')}`;assert.match(name,/^jx_test_\d+_[a-f0-9]{12}$/);
 const control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});
 let db;
 try {
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');
  db=await openDatabase({...env,MYSQL_DATABASE:name});
  await t.test('upgrading from the seven prior migrations preserves data and applies only new tables',async()=>{
   const path=require('node:path');
   const oldDir=path.resolve(__dirname,'../../../..','.local/party-migration-fixtures',key());await fs.mkdir(oldDir,{recursive:true});
   const source=path.resolve(__dirname,'../migrations/mysql-runtime');
   for(const file of await fs.readdir(source))if(/^000[1-7]_/.test(file))await fs.copyFile(path.join(source,file),path.join(oldDir,file));
   await migrate(db,{directory:oldDir});
   await db.execute('INSERT INTO platform_schema_metadata(schema_key,schema_value) VALUES (?,?)',['synthetic_prior_value','preserve']);
   assert.deepEqual((await migrate(db)).applied,['0008','0009','0010','0011','0012','0013','0014']);
   assert.deepEqual((await migrate(db)).applied,[]);
   assert.equal((await db.execute('SELECT schema_value FROM platform_schema_metadata WHERE schema_key=?',['synthetic_prior_value']))[0][0].schema_value,'preserve');
  });
  const sessions=new Map();
  const resolvePrincipal=async ctx=>sessions.get(ctx)||null;
  let service=createPartyRepository(db,{resolvePrincipal});
  const read=async(sql,params=[]) => (await db.execute(sql,params))[0];
  async function scenario() {
   const actors=[];
   for(const label of ['owner','recipient','outsider']) {
    const context=Symbol(label);sessions.set(context,{subject_ref:'synthetic:'+key(),request_id:key()});
    actors.push({context,...await service.registerAccount(context,{display_name:label})});
   }
   const [owner,recipient,outsider]=actors;
   const org=await service.createOrganization(owner.context,{display_name:'Synthetic organization',operation_key:key()});
   const invite=async(extra={})=>service.inviteMember(owner.context,{party_id:org.party_id,invitee_account_id:recipient.account_id,expires_at:future(),operation_key:key(),...extra});
   const response=(inv,extra={})=>({party_id:org.party_id,invitation_id:inv.invitation_id,decision:'ACCEPT',expected_version:1,operation_key:key(),...extra});
   return {owner,recipient,outsider,org,invite,response};
  }
  await t.test('default authentication is denied and caller actor/roles cannot be injected',async()=>{
   await assert.rejects(createPartyRepository(db).registerAccount({subject_ref:'forged'},{display_name:'test'}),{code:'AUTHENTICATION_REQUIRED'});
   const s=await scenario();
   await assert.rejects(service.createOrganization(s.owner.context,{display_name:'test',operation_key:key(),actor:s.outsider.account_id}),{code:'INVALID_INPUT'});
   await assert.rejects(service.inviteMember(s.owner.context,{party_id:s.org.party_id,invitee_account_id:s.recipient.account_id,expires_at:future(),operation_key:key(),role:'OWNER'}),{code:'INVALID_INPUT'});
   await assert.rejects(service.listParties({account_id:s.owner.account_id,role:'admin'}),{code:'AUTHENTICATION_REQUIRED'});
  });
  await t.test('same verified subject registers one account and one personal party under concurrency',async()=>{
   const ctx=Symbol('register');sessions.set(ctx,{subject_ref:'synthetic:'+key(),request_id:key()});
   const results=await Promise.all([1,2].map(()=>service.registerAccount(ctx,{display_name:'合成作者🎬'})));
   assert.deepEqual(results[0],results[1]);
   const parties=await service.listParties(ctx);assert.equal(parties.length,1);assert.equal(parties[0].kind,'PERSON');assert.equal(parties[0].current_status,'PENDING_REVIEW');
   const audit=await read('SELECT * FROM party_audit_events WHERE party_id=?',[parties[0].party_id]);assert.equal(audit.length,1);
   const replay=await service.registerAccount(ctx,{display_name:'does not overwrite'});assert.deepEqual(replay,results[0]);assert.equal((await service.listParties(ctx))[0].display_name,'合成作者🎬');
  });
  await t.test('organization creation is idempotent without overwriting the personal party',async()=>{
   const s=await scenario(),input={display_name:'Second organization',operation_key:key()};
   const [a,b]=await Promise.all([1,2].map(()=>service.createOrganization(s.owner.context,input)));assert.deepEqual(a,b);
   await assert.rejects(service.createOrganization(s.owner.context,{...input,display_name:'changed'}),{code:'IDEMPOTENCY_CONFLICT'});
   assert.equal((await service.listParties(s.owner.context)).length,3);
   assert.equal(Number((await read("SELECT COUNT(*) n FROM party_audit_events WHERE party_id=?",[a.party_id]))[0].n),1);
  });
  await t.test('individual authors and organizations can request multiple capabilities without activating business',async()=>{
   const s=await scenario();
   for(const [party_id,codes] of [[s.owner.personal_party_id,['AUTHOR']],[s.org.party_id,['MCN','PRODUCER','SCRIPT_SUPPLIER']]]) {
    for(const code of codes)assert.equal((await service.requestCapability(s.owner.context,{party_id,code,operation_key:key()})).current_status,'PENDING_REVIEW');
    for(const action of ['PAY','READ_TALENT_INCOME','USE_WORK','PLATFORM_ADMIN'])await assert.rejects(service.assertPermission(s.owner.context,{party_id,action}),{code:'PARTY_ACTION_FORBIDDEN'});
   }
   const rows=await service.listParties(s.owner.context);assert.equal(rows.find(p=>p.party_id===s.org.party_id).capabilities.length,3);
   await assert.rejects(service.requestCapability(s.owner.context,{party_id:s.org.party_id,code:'ADMIN',operation_key:key()}),{code:'INVALID_CAPABILITY'});
  });
  await t.test('pending invitation grants no membership and only its intended account can respond',async()=>{
   const s=await scenario(),inv=await s.invite(),input=s.response(inv);
   await assert.rejects(service.assertPermission(s.recipient.context,{party_id:s.org.party_id,action:'READ_PARTY'}),{code:'PARTY_ACTION_FORBIDDEN'});
   for(const who of [s.owner,s.outsider])await assert.rejects(service.respondInvitation(who.context,input),{code:'INVITATION_NOT_FOUND'});
   assert.equal((await service.listInvitations(s.recipient.context)).length,1);assert.equal((await service.listInvitations(s.outsider.context)).length,0);
   await service.respondInvitation(s.recipient.context,input);
   assert.equal(await service.assertPermission(s.recipient.context,{party_id:s.org.party_id,action:'READ_PARTY'}),true);
   await assert.rejects(service.assertPermission(s.recipient.context,{party_id:s.org.party_id,action:'MANAGE_MEMBERS'}),{code:'PARTY_ACTION_FORBIDDEN'});
   await assert.rejects(service.inviteMember(s.recipient.context,{party_id:s.org.party_id,invitee_account_id:s.outsider.account_id,expires_at:future(),operation_key:key()}),{code:'PARTY_ACTION_FORBIDDEN'});
  });
  await t.test('cross-party identifiers and outsider mutation are rejected',async()=>{
   const s=await scenario(),inv=await s.invite(),other=await service.createOrganization(s.outsider.context,{display_name:'Other',operation_key:key()});
   await assert.rejects(service.respondInvitation(s.recipient.context,s.response(inv,{party_id:other.party_id})),{code:'INVITATION_NOT_FOUND'});
   await assert.rejects(service.revokeInvitation(s.outsider.context,{party_id:s.org.party_id,invitation_id:inv.invitation_id,expected_version:1,operation_key:key()}),{code:'PARTY_ACTION_FORBIDDEN'});
   await assert.rejects(service.requestCapability(s.outsider.context,{party_id:s.org.party_id,code:'MCN',operation_key:key()}),{code:'PARTY_ACTION_FORBIDDEN'});
  });
  await t.test('concurrent same-key acceptance produces one membership and one audit event',async()=>{
   const s=await scenario(),inv=await s.invite(),input=s.response(inv);
   const [a,b]=await Promise.all([1,2].map(()=>service.respondInvitation(s.recipient.context,input)));assert.deepEqual(a,b);
   const audit=await read("SELECT * FROM party_audit_events WHERE party_id=? AND event_code='INVITATION_ACCEPTED'",[s.org.party_id]);assert.equal(audit.length,1);
   assert.equal((await read('SELECT * FROM party_memberships WHERE party_id=? AND account_id=?',[s.org.party_id,s.recipient.account_id])).length,1);
   await assert.rejects(service.respondInvitation(s.recipient.context,{...input,decision:'DECLINE'}),{code:'IDEMPOTENCY_CONFLICT'});
   await assert.rejects(service.respondInvitation(s.recipient.context,{...input,operation_key:key()}),{code:'VERSION_CONFLICT'});
  });
  await t.test('concurrent invitations to the same person produce only one pending invitation',async()=>{
   const s=await scenario();const results=await Promise.allSettled([s.invite(),s.invite()]);
   assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'INVITATION_ALREADY_PENDING');
   assert.equal((await read('SELECT * FROM party_invitations WHERE party_id=?',[s.org.party_id])).length,1);
  });
  await t.test('accept and revoke races yield one transition and never create membership after revocation',async()=>{
   const s=await scenario(),inv=await s.invite();
   const results=await Promise.allSettled([service.respondInvitation(s.recipient.context,s.response(inv)),service.revokeInvitation(s.owner.context,{party_id:s.org.party_id,invitation_id:inv.invitation_id,expected_version:1,operation_key:key()})]);
   assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
   const row=(await read('SELECT * FROM party_invitations WHERE id=?',[inv.invitation_id]))[0];
   const members=await read('SELECT * FROM party_memberships WHERE consent_invitation_id=?',[inv.invitation_id]);assert.equal(members.length,row.current_status==='ACCEPTED'?1:0);
  });
  await t.test('declined, revoked, stale and expired invitations cannot activate membership',async()=>{
   for(const mode of ['DECLINE','REVOKE','EXPIRE']) {
    const s=await scenario(),inv=await s.invite();
    await assert.rejects(service.respondInvitation(s.recipient.context,s.response(inv,{expected_version:2})),{code:'VERSION_CONFLICT'});
    if(mode==='DECLINE')await service.respondInvitation(s.recipient.context,s.response(inv,{decision:'DECLINE'}));
    if(mode==='REVOKE')await service.revokeInvitation(s.owner.context,{party_id:s.org.party_id,invitation_id:inv.invitation_id,expected_version:1,operation_key:key()});
    if(mode==='EXPIRE')await db.execute('UPDATE party_invitations SET expires_at=DATE_SUB(CURRENT_TIMESTAMP(6),INTERVAL 1 SECOND) WHERE id=?',[inv.invitation_id]);
    await assert.rejects(service.respondInvitation(s.recipient.context,s.response(inv)),{code:mode==='EXPIRE'?'INVITATION_EXPIRED':'VERSION_CONFLICT'});
    assert.equal((await read('SELECT * FROM party_memberships WHERE consent_invitation_id=?',[inv.invitation_id])).length,0);
    if(mode==='EXPIRE') {
     assert.equal((await service.listInvitations(s.recipient.context))[0].current_status,'EXPIRED');
     await s.invite();assert.equal((await read('SELECT current_status FROM party_invitations WHERE id=?',[inv.invitation_id]))[0].current_status,'EXPIRED');
    }
   }
  });
  await t.test('suspended accounts and parties cannot mutate or replay successful operations',async()=>{
   const s=await scenario(),inv=await s.invite(),input=s.response(inv);await service.respondInvitation(s.recipient.context,input);
   await db.execute("UPDATE identity_accounts SET current_status='SUSPENDED' WHERE id=?",[s.recipient.account_id]);
   await assert.rejects(service.respondInvitation(s.recipient.context,input),{code:'ACCOUNT_NOT_ACTIVE'});
   await db.execute("UPDATE identity_accounts SET current_status='ACTIVE' WHERE id=?",[s.recipient.account_id]);
   await db.execute("UPDATE parties SET current_status='SUSPENDED' WHERE id=?",[s.org.party_id]);
   await assert.rejects(service.respondInvitation(s.recipient.context,input),{code:'PARTY_NOT_ACTIVE'});
   assert.deepEqual((await service.listParties(s.recipient.context)).find(p=>p.party_id===s.org.party_id).allowed_actions,[]);
  });
  await t.test('pending acceptance rechecks the inviter and idempotent replay rechecks the owner',async()=>{
   const s=await scenario(),inv=await s.invite();
   await db.execute("UPDATE identity_accounts SET current_status='SUSPENDED' WHERE id=?",[s.owner.account_id]);
   await assert.rejects(service.respondInvitation(s.recipient.context,s.response(inv)),{code:'INVITER_NO_LONGER_AUTHORIZED'});
   await db.execute("UPDATE identity_accounts SET current_status='ACTIVE' WHERE id=?",[s.owner.account_id]);
   await db.execute("UPDATE party_memberships SET current_status='SUSPENDED' WHERE party_id=? AND account_id=?",[s.org.party_id,s.owner.account_id]);
   await assert.rejects(service.respondInvitation(s.recipient.context,s.response(inv)),{code:'INVITER_NO_LONGER_AUTHORIZED'});
   const input={display_name:'Replay authorization',operation_key:key()};const org=await service.createOrganization(s.owner.context,input);
   await db.execute("UPDATE party_memberships SET current_status='SUSPENDED' WHERE party_id=? AND account_id=?",[org.party_id,s.owner.account_id]);
   await assert.rejects(service.createOrganization(s.owner.context,input),{code:'PARTY_ACTION_FORBIDDEN'});
   assert.equal((await read('SELECT * FROM party_memberships WHERE consent_invitation_id=?',[inv.invitation_id])).length,0);
  });
  await t.test('removal preserves identity/history, affects only one organization, and forbids replay after revocation',async()=>{
   const s=await scenario(),inv=await s.invite(),input=s.response(inv),accepted=await service.respondInvitation(s.recipient.context,input);
   const other=await service.createOrganization(s.owner.context,{display_name:'Another',operation_key:key()});
   const otherInv=await s.invite({party_id:other.party_id});await service.respondInvitation(s.recipient.context,s.response(otherInv,{party_id:other.party_id}));
   const before=(await read('SELECT * FROM identity_accounts WHERE id=?',[s.recipient.account_id]))[0];
   await assert.rejects(service.removeMember(s.owner.context,{party_id:s.org.party_id,account_id:s.owner.account_id,expected_version:1,operation_key:key()}),{code:'OWNER_REMOVAL_FORBIDDEN'});
   const remove={party_id:s.org.party_id,account_id:s.recipient.account_id,expected_version:accepted.membership_version,operation_key:key()};
   await assert.rejects(service.removeMember(s.outsider.context,remove),{code:'PARTY_ACTION_FORBIDDEN'});
   const removed=await service.removeMember(s.owner.context,remove);assert.deepEqual(await service.removeMember(s.owner.context,remove),removed);
   assert.deepEqual((await read('SELECT * FROM identity_accounts WHERE id=?',[s.recipient.account_id]))[0],before);
   assert.equal((await read('SELECT current_status FROM party_invitations WHERE id=?',[inv.invitation_id]))[0].current_status,'ACCEPTED');
   await assert.rejects(service.respondInvitation(s.recipient.context,input),{code:'MEMBERSHIP_NOT_ACTIVE'});
   assert.equal(await service.assertPermission(s.recipient.context,{party_id:other.party_id,action:'READ_PARTY'}),true);
   assert.equal(await service.assertPermission(s.recipient.context,{party_id:s.recipient.personal_party_id,action:'READ_PARTY'}),true);
   const again=await s.invite();await service.respondInvitation(s.recipient.context,s.response(again));
   const newMember=(await read('SELECT * FROM party_memberships WHERE id=?',[accepted.membership_id]))[0];assert.equal(newMember.object_version,3);assert.equal(newMember.consent_invitation_id,again.invitation_id);
  });
  await t.test('audit failure rolls back invitation, membership and replay result together',async()=>{
   const s=await scenario(),inv=await s.invite(),input=s.response(inv);
   const brokenDb={execute:db.execute,withTransaction:work=>db.withTransaction(tx=>work({execute:(sql,params)=>{
    if(sql.includes('INSERT INTO party_audit_events'))throw Error('synthetic audit failure');return tx.execute(sql,params);
   }}))};
   const broken=createPartyRepository(brokenDb,{resolvePrincipal});
   const before=(await read('SELECT COUNT(*) n FROM party_commands'))[0].n;
   await assert.rejects(broken.respondInvitation(s.recipient.context,input),/synthetic audit failure/);
   assert.equal((await read('SELECT current_status FROM party_invitations WHERE id=?',[inv.invitation_id]))[0].current_status,'INVITED');
   assert.equal((await read('SELECT * FROM party_memberships WHERE consent_invitation_id=?',[inv.invitation_id])).length,0);
   assert.equal((await read('SELECT COUNT(*) n FROM party_commands'))[0].n,before);
   await service.respondInvitation(s.recipient.context,input);
  });
  await t.test('input rejects missing versions, unknown fields and invalid or past expiry',async()=>{
   const s=await scenario(),inv=await s.invite();
   await assert.rejects(service.respondInvitation(s.recipient.context,s.response(inv,{expected_version:undefined})),{code:'EXPECTED_VERSION_REQUIRED'});
   await assert.rejects(s.invite({expires_at:'2026-02-30T00:00:00.000Z'}),{code:'INVALID_EXPIRY'});
   await assert.rejects(s.invite({invitee_account_id:s.outsider.account_id,expires_at:'2000-01-01T00:00:00.000Z'}),{code:'INVITATION_EXPIRED'});
   await assert.rejects(service.requestCapability(s.owner.context,{party_id:s.org.party_id,code:'MCN',operation_key:key(),current_status:'ACTIVE'}),{code:'INVALID_INPUT'});
   await assert.rejects(s.invite({party_id:s.owner.personal_party_id}),{code:'PARTY_ACTION_FORBIDDEN'});
  });
  await t.test('accepted identity and audit survive reconnect without provider calls or a process cache',async()=>{
   const s=await scenario(),inv=await s.invite(),input=s.response(inv),accepted=await service.respondInvitation(s.recipient.context,input);
   await db.close();db=await openDatabase({...env,MYSQL_DATABASE:name});service=createPartyRepository(db,{resolvePrincipal});
   assert.deepEqual(await service.respondInvitation(s.recipient.context,input),accepted);
   assert.equal(await service.assertPermission(s.recipient.context,{party_id:s.org.party_id,action:'READ_PARTY'}),true);
   const events=await read('SELECT * FROM party_audit_events WHERE party_id=?',[s.org.party_id]);assert.equal(events.length,3);
   assert.ok(events.every(e=>e.request_id&&e.actor_account_id&&e.object_version));
  });
 } finally {
  if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();
 }
});
