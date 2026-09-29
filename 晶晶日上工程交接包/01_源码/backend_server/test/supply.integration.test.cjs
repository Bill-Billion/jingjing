 'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes,createHash}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
const {createPartyRepository}=require('../src/modules/party/repository'),{createAuthRepository}=require('../src/modules/auth/repository');
const {createSupplyRepository}=require('../src/modules/works/repository'),{createSupplyAssets}=require('../src/modules/works/assets');
const {maintainOperatorGrant}=require('../src/modules/governance/operator-access'),{createAccountApi}=require('../src/http/account-api');
test('supply HTTP, immutable works, private materials and personal consents with isolated MySQL',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 assert.equal(env.NODE_ENV,'test');assert.equal(env.DB_CLIENT,'mysql');assert.equal(env.MYSQL_HOST,'127.0.0.1');assert.equal(env.MYSQL_PORT,'33316');assert.equal(env.MYSQL_USER,'jx_local');assert.equal(env.MYSQL_DATABASE,'jx_dev');
 const name=`jx_test_${process.pid}_${randomBytes(6).toString('hex')}`,control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
  const principals=new Map(),resolvePrincipal=async ctx=>principals.get(ctx),parties=createPartyRepository(db,{resolvePrincipal}),secret=randomBytes(32).toString('base64'),auth=createAuthRepository(db,{secret}),repo=createSupplyRepository(db,{resolvePrincipal});
  const people=[];
  for(const label of ['author','rights','content','outsider','subject']){const ctx={};principals.set(ctx,{subject_ref:'synthetic:'+key()});const p={ctx,...await parties.registerAccount(ctx,{display_name:label}),token:randomBytes(32).toString('base64url')};people.push(p);await db.execute('INSERT INTO auth_sessions(token_hash,account_id,expires_ms) VALUES (?,?,ROUND(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000)+3600000)',[auth.secure.digest('token',p.token),p.account_id]);}
  const [author,rights,content,outsider,subject]=people;
  for(const [person,actions] of [[rights,['SUPPLY_REVIEW_PROFILE','SUPPLY_REVIEW_RIGHTS','SUPPLY_REVIEW_CONSENT']],[content,['SUPPLY_REVIEW_CONTENT']],[author,['SUPPLY_REVIEW_PROFILE','SUPPLY_REVIEW_RIGHTS','SUPPLY_REVIEW_CONSENT']]])for(const action of actions)await maintainOperatorGrant(db,{account_id:person.account_id,action,enabled:true,expires_at:null,expected_version:0,authority_ref:'synthetic:test',reason:'isolated tests only'});
  const files=new Map();let puts=0;
  const storageFactory=()=>({async put({key,body}){puts++;files.set(key,Buffer.from(body));return {key,size:body.length,sha256:createHash('sha256').update(body).digest('hex')};},async getBuffer(key){return files.get(key);}});
  const assets=createSupplyAssets({db,repository:repo,storageFactory});
  server=createAccountApi({db,secret,supplyStorageFactory:storageFactory}).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port+'/api/v1/supply',fixtures=[];
  async function request(method,url,person=author,body,partyId=person?.personal_party_id,headers={}){
   const h={...(person?{Authorization:'Bearer '+person.token}:{}),...(partyId?{'X-Acting-Party':partyId}:{}),...headers};
   if(body!==undefined)h['Content-Type']=Buffer.isBuffer(body)?'application/octet-stream':'application/json';
   const r=await fetch(base+url,{method,headers:h,...(body===undefined?{}:{body:Buffer.isBuffer(body)?body:JSON.stringify(body)})});
   const raw=await r.arrayBuffer(),isJson=(r.headers.get('content-type')||'').includes('application/json');return {status:r.status,headers:r.headers,body:isJson?JSON.parse(Buffer.from(raw).toString()):Buffer.from(raw)};
  }
  const capture=(r,schema)=>{assert.equal(r.status,200,JSON.stringify(r.body));fixtures.push({schema,value:r.body});return r.body.data;};
  async function upload(purpose,person=author,text='synthetic private bytes '+key(),op=key()){
   return capture(await request('POST','/assets?purpose='+purpose+'&media_type=text%2Fplain',person,Buffer.from(text),person.personal_party_id,{'Idempotency-Key':op}),'SupplyAssetResponse');
  }
  const proof=await upload('RIGHTS_EVIDENCE'),script=await upload('WORK_CONTENT'),image=await upload('AVATAR_MATERIAL'),consentFile=await upload('CONSENT_EVIDENCE',subject);
  let profile,first,approved,avatar,consent;
  const workInput=()=>({work_id:null,previous_version_id:null,title:'合成测试原作',kind:'ORIGINAL',source_version_id:null,project_id:null,content_asset_id:script.id,evidence_ids:[proof.id],credits:[{party_id:author.personal_party_id,role:'AUTHOR',evidence_asset_ids:[proof.id]},{party_id:subject.personal_party_id,role:'RIGHTS_HOLDER',evidence_asset_ids:[proof.id]}]});
  const review=async(path,row,person,data)=>request('POST',path+'/'+row.id+'/reviews',person,data,null,{'Idempotency-Key':key(),'If-Match':'"'+row.object_version+'"'});
  await t.test('raw private upload hashes actual bytes and repeated request does not upload twice',async()=>{
   const op=key(),before=puts,a=await upload('WORK_CONTENT',author,'same private bytes',op),b=await upload('WORK_CONTENT',author,'same private bytes',op);assert.deepEqual(a,b);assert.equal(puts,before+1);assert.equal(a.content_sha256,createHash('sha256').update('same private bytes').digest('hex'));assert.equal(a.object_key,undefined);
   const conflict=await request('POST','/assets?purpose=WORK_CONTENT&media_type=text%2Fplain',author,Buffer.from('different'),author.personal_party_id,{'Idempotency-Key':op});assert.equal(conflict.status,409);
  });
  await t.test('private bytes require ownership or permission to an actually submitted record',async()=>{
   const r=await request('GET','/assets/'+script.id+'/content');assert.equal(r.status,200);assert.match(r.headers.get('content-disposition'),/^attachment/);assert.equal(r.headers.get('cache-control'),'no-store');
   assert.equal((await request('GET','/assets/'+script.id,outsider)).status,404);
   assert.equal((await request('GET','/assets/'+script.id,rights,undefined,null)).status,404);
   assert.equal((await request('GET','/assets/'+script.id,null)).status,401);
   capture(await request('GET','/assets/'+script.id),'SupplyAssetResponse');
  });
  await t.test('profile submission preserves evidence and cannot be approved by its submitter',async()=>{
   profile=capture(await request('POST','/profiles',author,{display_name:'个人作者',description:'合成供给申请',evidence_asset_ids:[proof.id],previous_profile_id:null},author.personal_party_id,{'Idempotency-Key':key()}),'SupplyRecordResponse');
   assert.equal(profile.current_status,'PENDING_REVIEW');assert.equal((await review('/profiles',profile,author,{decision:'APPROVED',reason:'self'})).status,403);
   assert.equal((await request('POST','/work-versions',author,workInput(),author.personal_party_id,{'Idempotency-Key':key()})).status,409);
   profile=capture(await review('/profiles',profile,rights,{decision:'APPROVED',reason:'合成权利材料已核对'}),'SupplyRecordResponse');assert.equal(profile.current_status,'APPROVED');
  });
  await t.test('original work retains separate authors and rights holders, foreign private material is denied',async()=>{
   const wrong=await request('POST','/work-versions',author,{...workInput(),content_asset_id:consentFile.id},author.personal_party_id,{'Idempotency-Key':key()});assert.equal(wrong.status,409);
   const op=key(),r=await request('POST','/work-versions',author,workInput(),author.personal_party_id,{'Idempotency-Key':op});first=capture(r,'SupplyRecordResponse');assert.equal(first.current_status,'DRAFT');assert.notEqual(first.data.credits[0].party_id,first.data.credits[1].party_id);
   const repeat=await request('POST','/work-versions',author,workInput(),author.personal_party_id,{'Idempotency-Key':op});assert.deepEqual(repeat.body.data,first);
   assert.equal((await request('GET','/records/'+first.id,rights,undefined,null)).status,404);
  });
  await t.test('submission exposes materials to the appropriate reviewers, with no self approval',async()=>{
   first=capture(await request('POST','/work-versions/'+first.id+'/actions',author,{action:'SUBMIT',reason:null},author.personal_party_id,{'Idempotency-Key':key(),'If-Match':'"1"'}),'SupplyRecordResponse');
   assert.equal(first.current_status,'AWAITING_REVIEW');capture(await request('GET','/records/'+first.id,rights,undefined,null),'SupplyRecordResponse');
   assert.equal((await request('GET','/assets/'+script.id+'/content',rights,undefined,null)).status,200);
   assert.equal((await review('/work-versions',first,author,{channel:'RIGHTS',decision:'APPROVED',reason:'self'})).status,403);
   assert.equal((await review('/work-versions',first,content,{channel:'RIGHTS',decision:'APPROVED',reason:'wrong permission'})).status,403);
  });
  await t.test('rights and content approvals remain independent; no license or publishing success',async()=>{
   let row=capture(await review('/work-versions',first,rights,{channel:'RIGHTS',decision:'APPROVED',reason:'合成权属核对'}),'SupplyRecordResponse');assert.equal(row.current_status,'AWAITING_REVIEW');
   assert.equal((await review('/work-versions',first,content,{channel:'CONTENT',decision:'APPROVED',reason:'stale'})).status,412);
   approved=capture(await review('/work-versions',row,content,{channel:'CONTENT',decision:'APPROVED',reason:'合成内容核对'}),'SupplyRecordResponse');assert.equal(approved.current_status,'REVIEWS_COMPLETE');assert.equal(approved.data.license,undefined);
  });
  await t.test('concurrent revisions serialize, retain the old approved version and reset review results',async()=>{
   const input={...workInput(),work_id:approved.stream_ref,previous_version_id:approved.id,title:'合成第二稿'};
   const rows=await Promise.all([request('POST','/work-versions',author,input,author.personal_party_id,{'Idempotency-Key':key()}),request('POST','/work-versions',author,input,author.personal_party_id,{'Idempotency-Key':key()})]);assert.deepEqual(rows.map(r=>r.status).sort(),[200,409]);
   const next=rows.find(r=>r.status===200).body.data;assert.equal(next.revision,2);assert.deepEqual(next.data.version.reviews,[]);assert.deepEqual((await request('GET','/records/'+approved.id)).body.data,approved);
  });
  await t.test('adaptation fails closed without a verified project and license binding',async()=>{
   const r=await request('POST','/work-versions',author,{...workInput(),kind:'PROJECT_ADAPTATION',source_version_id:approved.id,project_id:key()},author.personal_party_id,{'Idempotency-Key':key()});assert.equal(r.status,409);assert.equal(r.body.error.code,'PROJECT_LICENSE_NOT_READY');
  });
  await t.test('list and pagination respect selected party and explicit review permissions',async()=>{
   const r=await request('GET','/records?kind=WORK_VERSION&limit=1');const page=capture(r,'SupplyRecordListResponse');assert.equal(page.items.length,1);assert.ok(page.next_cursor);
   const next=await request('GET','/records?kind=WORK_VERSION&limit=1&cursor='+page.next_cursor);assert.equal(next.status,200);assert.notEqual(next.body.data.items[0].id,page.items[0].id);
   capture(await request('GET','/records?kind=WORK_VERSION',rights,undefined,null),'SupplyRecordListResponse');assert.equal((await request('GET','/records?kind=WORK_VERSION',outsider,undefined,null)).status,403);
   assert.equal((await request('GET','/records?kind=toString')).status,400);
  });
  await t.test('avatar materials are separate from personal face/voice consent and cannot be given by an institution',async()=>{
   avatar=capture(await request('POST','/avatars',author,{display_name:'合成数字人资料',material_asset_ids:[image.id]},author.personal_party_id,{'Idempotency-Key':key()}),'SupplyRecordResponse');assert.equal(avatar.data.provider_asset_ref,null);
   const c={avatar_id:avatar.id,subject_party_id:subject.personal_party_id,features:['FACE'],purposes:['PRIVATE_CUSTOMIZATION'],territories:['CN'],valid_from:'2026-01-01T00:00:00.000Z',valid_until:'2099-01-01T00:00:00.000Z',terms:'仅为明确用途记录本人形象同意，不包含声音和发行。',evidence_asset_ids:[consentFile.id]};
   assert.equal((await request('POST','/consents',author,{consent:c},author.personal_party_id,{'Idempotency-Key':key()})).status,403);
   consent=capture(await request('POST','/consents',subject,{consent:c},subject.personal_party_id,{'Idempotency-Key':key()}),'SupplyRecordResponse');assert.equal(consent.current_status,'PENDING_REVIEW');assert.equal(consent.data.identity_verification,'NOT_VERIFIED');
   const mine=capture(await request('GET','/records?kind=CONSENT',subject),'SupplyRecordListResponse');assert.ok(mine.items.some(x=>x.id===consent.id));
  });
  await t.test('reviewed consent only matches its explicit scope; it does not enable generation or identity verification',async()=>{
   consent=capture(await review('/consents',consent,rights,{decision:'APPROVED',reason:'合成材料核对，不代替实名'}),'SupplyRecordResponse');
   const url='/consents/'+consent.id+'/scope?feature=FACE&purpose=PRIVATE_CUSTOMIZATION&territory=CN';
   const scope=capture(await request('GET',url,subject),'ConsentScopeResponse');assert.equal(scope.scope_matches,true);assert.equal(scope.usable_for_generation,false);
   assert.equal((await request('GET',url.replace('FACE','VOICE'),subject)).body.data.scope_matches,false);
   assert.equal((await request('GET',url.replace('territory=CN','territory=US'),subject)).body.data.scope_matches,false);
  });
  await t.test('withdrawal is personal, immediately stops scope matching and atomically records one pending event',async()=>{
   const broken={...db,withTransaction:work=>db.withTransaction(tx=>work({execute:async(sql,args)=>{if(sql.includes('INSERT INTO platform_outbox'))throw Error('synthetic outbox failure');return tx.execute(sql,args);}}))};
   await assert.rejects(createSupplyRepository(broken,{resolvePrincipal}).withdrawConsent(subject.ctx,{record_id:consent.id,expected_version:consent.object_version,reason:'rollback',operation_key:key()}),/synthetic outbox failure/);
   assert.equal((await repo.read(subject.ctx,{record_id:consent.id,party_id:subject.personal_party_id})).current_status,'APPROVED');
   const headers={'Idempotency-Key':key(),'If-Match':'"'+consent.object_version+'"'},url='/consents/'+consent.id+'/withdrawals';
   assert.equal((await request('POST',url,author,{reason:'not the subject'},author.personal_party_id,headers)).status,403);
   const r=await request('POST',url,subject,{reason:'本人撤回'},subject.personal_party_id,headers);capture(r,'SupplyRecordResponse');assert.equal(r.body.data.current_status,'WITHDRAWN');
   assert.deepEqual((await request('POST',url,subject,{reason:'本人撤回'},subject.personal_party_id,headers)).body.data,r.body.data);
   assert.equal((await request('GET','/consents/'+consent.id+'/scope?feature=FACE&purpose=PRIVATE_CUSTOMIZATION&territory=CN',subject)).body.data.scope_matches,false);
   const [[event]]=await db.execute('SELECT COUNT(*) n FROM platform_outbox WHERE event_key=?',['consent-withdraw:'+consent.id]);assert.equal(Number(event.n),1);
  });
  await t.test('missing real private storage configuration never creates a READY asset or fake public URL',async()=>{
   const real=createSupplyAssets({db,repository:repo,env:{NODE_ENV:'test'}}),input={party_id:author.personal_party_id,purpose:'WORK_CONTENT',media_type:'text/plain',body:Buffer.from('blocked '+key()),operation_key:key()};
   await assert.rejects(real.upload(author.ctx,input));const [[row]]=await db.execute('SELECT current_status FROM supply_assets WHERE content_sha256=?',[createHash('sha256').update(input.body).digest('hex')]);assert.equal(row.current_status,'FAILED');await assert.rejects(real.upload(author.ctx,input),{code:'UPLOAD_RECONCILIATION_REQUIRED'});
  });
  await t.test('audit failure rolls back new records and idempotency results',async()=>{
   const broken={...db,withTransaction:work=>db.withTransaction(tx=>work({execute:async(sql,args)=>{if(sql.startsWith('INSERT INTO supply_audit'))throw Error('synthetic audit failure');return tx.execute(sql,args);}}))},bad=createSupplyRepository(broken,{resolvePrincipal});
   const input={party_id:author.personal_party_id,display_name:'rollback-avatar',material_asset_ids:[image.id],operation_key:key()};await assert.rejects(bad.createAvatar(author.ctx,input),/synthetic audit failure/);const result=await repo.createAvatar(author.ctx,input);assert.equal(result.object_version,1);
  });
  await t.test('institution owners can apply but a reviewer belonging to the same institution cannot approve it',async()=>{
   const org=await parties.createOrganization(author.ctx,{display_name:'合成机构',operation_key:key()}),invite=await parties.inviteMember(author.ctx,{party_id:org.party_id,invitee_account_id:rights.account_id,expires_at:new Date(Date.now()+3600000).toISOString(),operation_key:key()});
   await parties.respondInvitation(rights.ctx,{party_id:org.party_id,invitation_id:invite.invitation_id,decision:'ACCEPT',expected_version:1,operation_key:key()});
   const file=await upload('RIGHTS_EVIDENCE',{...author,personal_party_id:org.party_id});
   const row=capture(await request('POST','/profiles',author,{display_name:'机构供给',description:'合成申请',evidence_asset_ids:[file.id],previous_profile_id:null},org.party_id,{'Idempotency-Key':key()}),'SupplyRecordResponse');
   assert.equal((await review('/profiles',row,rights,{decision:'APPROVED',reason:'same institution'})).status,403);
  });
  await t.test('work withdrawal preserves the approved original and revoked requests cannot mutate the withdrawn version',async()=>{
   const page=await repo.list(author.ctx,{party_id:author.personal_party_id,kind:'WORK_VERSION'}),draft=page.items.find(r=>r.revision===2);
   const row=capture(await request('POST','/work-versions/'+draft.id+'/actions',author,{action:'WITHDRAW',reason:'撤回合成第二稿'},author.personal_party_id,{'Idempotency-Key':key(),'If-Match':'"'+draft.object_version+'"'}),'SupplyRecordResponse');
   assert.equal(row.current_status,'WITHDRAWN');assert.deepEqual((await request('GET','/records/'+approved.id)).body.data,approved);
   assert.equal((await review('/work-versions',row,rights,{channel:'RIGHTS',decision:'APPROVED',reason:'invalid'})).status,409);
  });
  await t.test('storage corruption is refused and errors never reveal private bytes or object keys',async()=>{
   const [[asset]]=await db.execute('SELECT object_key FROM supply_assets WHERE id=?',[script.id]),original=files.get(asset.object_key);files.set(asset.object_key,Buffer.from('private-corrupted-secret'));
   const r=await request('GET','/assets/'+script.id+'/content');assert.equal(r.status,503);assert.ok(!JSON.stringify(r.body).includes('private-corrupted-secret'));fixtures.push({schema:'ErrorResponse',value:r.body});files.set(asset.object_key,original);
  });
  await t.test('removed membership, suspended accounts and revoked reviewer permissions fail on every request',async()=>{
   await maintainOperatorGrant(db,{account_id:rights.account_id,action:'SUPPLY_REVIEW_RIGHTS',enabled:false,expires_at:null,expected_version:1,authority_ref:'synthetic:test',reason:'revoked'});
   assert.equal((await request('GET','/records/'+approved.id,rights,undefined,null)).status,404);
   await db.execute("UPDATE identity_accounts SET current_status='SUSPENDED' WHERE id=?",[author.account_id]);assert.equal((await request('GET','/assets/'+script.id)).status,403);await db.execute("UPDATE identity_accounts SET current_status='ACTIVE' WHERE id=?",[author.account_id]);
   await db.execute("UPDATE party_memberships SET current_status='REVOKED' WHERE account_id=?",[author.account_id]);assert.equal((await request('GET','/records/'+approved.id)).status,403);
  });
  const out=path.resolve(__dirname,'../../../..','.local/supply-http-fixtures.json');await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify({synthetic_only:true,cases:fixtures},null,2));
 }finally{if(server)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});if(db)await db.close();await control.query('DROP DATABASE '+mysql.escapeId(name));await control.end();}
});
