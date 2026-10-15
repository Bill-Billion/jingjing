'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
const {createPartyRepository}=require('../src/modules/party/repository'),{createAuthRepository}=require('../src/modules/auth/repository');
const {createCustomizationRepository}=require('../src/modules/customization/repository');
const {maintainOperatorGrant}=require('../src/modules/governance/operator-access'),{createAccountApi}=require('../src/http/account-api');

test('story intake HTTP, privacy, immutable submissions and rollback in isolated MySQL',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 // This guard is deliberately stricter than runtime configuration: no production connections.
 assert.equal(env.NODE_ENV,'test');assert.equal(env.DB_CLIENT,'mysql');assert.equal(env.MYSQL_HOST,'127.0.0.1');
 assert.equal(env.MYSQL_PORT,'33316');assert.equal(env.MYSQL_USER,'jx_local');assert.equal(env.MYSQL_DATABASE,'jx_dev');
 const name=`jx_test_${process.pid}_${randomBytes(6).toString('hex')}`;
 const control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});
 let db,server;
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');
  db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
  const principals=new Map(),resolvePrincipal=async ctx=>principals.get(ctx),parties=createPartyRepository(db,{resolvePrincipal});
  const secret=randomBytes(32).toString('base64'),auth=createAuthRepository(db,{secret}),repo=createCustomizationRepository(db,{resolvePrincipal});
  const people=[];
  for(const label of ['buyer-a','buyer-b','operator','publisher','member']){
   const ctx={};principals.set(ctx,{subject_ref:'synthetic:'+key()});
   const person={ctx,...await parties.registerAccount(ctx,{display_name:label}),token:randomBytes(32).toString('base64url')};people.push(person);
   await db.execute('INSERT INTO auth_sessions(token_hash,account_id,expires_ms) VALUES (?,?,ROUND(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000)+3600000)',[auth.secure.digest('token',person.token),person.account_id]);
  }
  const [buyer,other,operator,publisher,member]=people;
  async function grant(person,action,enabled=true,expected_version=0){return maintainOperatorGrant(db,{account_id:person.account_id,action,enabled,expected_version,expires_at:null,authority_ref:'synthetic:story-tests',reason:'isolated test fixture only'});}
  await grant(operator,'CUSTOMIZATION_INTAKE');await grant(publisher,'CUSTOMIZATION_TEMPLATE_PUBLISH');
  const org=await parties.createOrganization(buyer.ctx,{display_name:'合成故事测试机构',operation_key:key()});
  const invite=await parties.inviteMember(buyer.ctx,{party_id:org.party_id,invitee_account_id:member.account_id,expires_at:new Date(Date.now()+3600000).toISOString(),operation_key:key()});
  await parties.respondInvitation(member.ctx,{party_id:org.party_id,invitation_id:invite.invitation_id,decision:'ACCEPT',expected_version:1,operation_key:key()});
  server=createAccountApi({db,secret}).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port+'/api/v1',fixtures=[];
  async function request(method,url,person=buyer,body,partyId=person?.personal_party_id,headers={}){
   const h={...(person?{Authorization:'Bearer '+person.token}:{}),...(partyId?{'X-Acting-Party':partyId}:{}),...headers};
   if(body!==undefined)h['Content-Type']='application/json';
   const response=await fetch(base+url,{method,headers:h,...(body===undefined?{}:{body:JSON.stringify(body)})});
   return {status:response.status,headers:response.headers,body:await response.json()};
  }
  function capture(response,schema){assert.equal(response.status,200,JSON.stringify(response.body));fixtures.push({schema,value:response.body});return response.body.data;}
  function failed(response,status){assert.equal(response.status,status,JSON.stringify(response.body));fixtures.push({schema:'ErrorResponse',value:response.body});return response;}
  const headers=(row,operation_key=key())=>({'Idempotency-Key':operation_key,...(row?{'If-Match':'"'+row.object_version+'"'}:{})});
  const fullAnswers={story:'这是隔离测试的合成故事，不是私人经历。',tone:'温暖'};
  const snapshot={title:'合成婚礼故事',description:'仅用于隔离测试',fields:[
   {key:'story',label:'共同经历',type:'TEXT',required:true,max_length:12000},
   {key:'tone',label:'氛围',type:'CHOICE',required:true,options:['温暖','纪实']},
   {key:'notes',label:'补充',type:'TEXT',required:false,max_length:500}
  ]};
  const publish=(category_code,template_snapshot=snapshot,template_version=1)=>repo.publishTemplate(publisher.ctx,{category_code,template_version,template_snapshot,source_ref:'synthetic:customization-tests',operation_key:key()});
  let wedding,pet,attachment,draft,submitted,intaken;
  const make=async(answers={},person=buyer,partyId=person.personal_party_id,template=wedding,operation_key=key())=>capture(await request('POST','/customization-requests',person,{template_version_id:template.template_version_id,answers},partyId,headers(null,operation_key)),'CustomizationRequestResponse');
  const save=async(row,answers,person=buyer,partyId=person.personal_party_id,operation_key=key())=>request('PATCH','/customization-requests/'+row.id,person,{answers},partyId,headers(row,operation_key));
  const submit=async(row,person=buyer,partyId=person.personal_party_id,operation_key=key())=>request('POST','/customization-requests/'+row.id+'/submissions',person,{},partyId,headers(row,operation_key));
  const intake=async(row,person=operator,operation_key=key())=>request('POST','/operations/customization-requests/'+row.id+'/intake',person,{},null,headers(row,operation_key));
  const count=async table=>Number((await db.execute('SELECT COUNT(*) n FROM '+mysql.escapeId(table)))[0][0].n);

  await t.test('empty configuration exposes no fabricated categories; only a publisher can publish immutable template versions',async()=>{
   const empty=capture(await request('GET','/customization-categories',buyer,undefined,null),'CustomizationCategoryPageResponse');assert.deepEqual(empty.items,[]);
   await assert.rejects(repo.publishTemplate(operator.ctx,{category_code:'wedding',template_version:1,template_snapshot:snapshot,source_ref:'synthetic:unauthorized',operation_key:key()}),e=>e.status===403);
   wedding=await publish('wedding');
   pet=await publish('pet',{title:'合成宠物故事',description:'仅用于隔离测试',fields:[{key:'pet_story',label:'相处故事',type:'TEXT',required:true,max_length:2000}]});
   attachment=await publish('with_material',{...snapshot,title:'合成必填材料故事',fields:[...snapshot.fields,{key:'portrait',label:'私有材料',type:'PRIVATE_ATTACHMENT',required:true}]});
   const cats=capture(await request('GET','/customization-categories',buyer,undefined,null),'CustomizationCategoryPageResponse');
   assert.equal(cats.items.length,3);assert.equal(cats.items.find(x=>x.template_version_id===attachment.template_version_id).submission_available,false);
   assert.notDeepEqual(cats.items.find(x=>x.category_code==='wedding').template_snapshot.fields,cats.items.find(x=>x.category_code==='pet').template_snapshot.fields);
   await assert.rejects(publish('wedding',{...snapshot,title:'企图覆盖旧版本'}),e=>e.status===409);
  });
  await t.test('an incomplete draft is private and can be restored, deliberately emptied and saved without old-value substitution',async()=>{
   draft=await make({story:'未完成的合成草稿'});assert.equal(draft.current_status,'DRAFT');assert.equal(draft.submission,null);
   const restored=capture(await request('GET','/customization-requests/'+draft.id),'CustomizationRequestResponse');assert.equal(restored.answers.story,'未完成的合成草稿');
   draft=capture(await save(draft,{story:'',notes:''}),'CustomizationRequestResponse');assert.deepEqual(draft.answers,{story:'',notes:''});
   const again=capture(await request('GET','/customization-requests/'+draft.id),'CustomizationRequestResponse');assert.deepEqual(again.answers,{story:'',notes:''});
   const denied=failed(await submit(draft),422);assert.ok(denied.body.error.details.some(x=>x.field==='answers.story'&&x.reason==='REQUIRED'));
   assert.equal((await repo.get(buyer.ctx,{request_id:draft.id,party_id:buyer.personal_party_id})).current_status,'DRAFT');
  });
  await t.test('listing returns necessary summaries without private answers or submission bodies',async()=>{
   const list=capture(await request('GET','/customization-requests'),'CustomizationRequestPageResponse');
   assert.ok(list.items.some(x=>x.id===draft.id));for(const item of list.items){assert.equal(item.answers,undefined);assert.equal(item.submission,undefined);assert.equal(item.template_snapshot,undefined);}
   failed(await request('GET','/customization-requests/'+draft.id,other),404);
   failed(await request('GET','/customization-requests/'+draft.id,buyer,undefined,org.party_id),404);
   failed(await request('GET','/customization-requests/'+draft.id,operator,undefined,null),404);
   const inbox=capture(await request('GET','/operations/customization-requests',operator,undefined,null),'CustomizationRequestPageResponse');assert.equal(inbox.items.some(x=>x.id===draft.id),false);
   failed(await request('GET','/operations/customization-requests',other,undefined,null),403);
  });
  await t.test('publishing a newer category does not silently migrate existing drafts or their questions',async()=>{
   const newer=await publish('wedding',{...snapshot,title:'第二版合成婚礼故事',fields:[...snapshot.fields,{key:'occasion',label:'场景',type:'TEXT',required:true,max_length:200}]},2);
   const cats=capture(await request('GET','/customization-categories',buyer,undefined,null),'CustomizationCategoryPageResponse');
   assert.equal(cats.items.filter(x=>x.category_code==='wedding').length,1);assert.equal(cats.items.find(x=>x.category_code==='wedding').template_version_id,newer.template_version_id);
   const prior=capture(await request('GET','/customization-requests/'+draft.id),'CustomizationRequestResponse');assert.equal(prior.template_version_id,wedding.template_version_id);assert.deepEqual(prior.template_snapshot,snapshot);
   draft=capture(await save(draft,fullAnswers),'CustomizationRequestResponse');
  });
  await t.test('submit creates one immutable version and exposes that exact text to the intake operator',async()=>{
   const operation_key=key(),originalVersion=draft.object_version;
   submitted=capture(await submit(draft,buyer,buyer.personal_party_id,operation_key),'CustomizationRequestResponse');assert.equal(submitted.current_status,'SUBMITTED');assert.equal(submitted.object_version,originalVersion+1);
   assert.equal(submitted.submission.submitted_by,buyer.account_id);assert.deepEqual(submitted.submission.answers,fullAnswers);assert.deepEqual(submitted.submission.template_snapshot,snapshot);assert.match(submitted.submission.content_sha256,/^[a-f0-9]{64}$/);
   assert.deepEqual(capture(await submit(draft,buyer,buyer.personal_party_id,operation_key),'CustomizationRequestResponse'),submitted);
   const [[versions]]=await db.execute('SELECT COUNT(*) n FROM customization_submissions WHERE request_id=?',[submitted.id]);assert.equal(Number(versions.n),1);
   const visible=capture(await request('GET','/customization-requests/'+submitted.id,operator,undefined,null),'CustomizationRequestResponse');assert.deepEqual(visible.submission,submitted.submission);
   failed(await request('GET','/customization-requests/'+submitted.id,other,undefined,null),403);
   failed(await save(submitted,{story:'不能改写正式提交'}),409);
   failed(await submit(submitted),409);
  });
  await t.test('intake records a responsible operator without rewriting the submission or implying payment/production approval',async()=>{
   const operation_key=key();intaken=capture(await intake(submitted,operator,operation_key),'CustomizationRequestResponse');
   assert.equal(intaken.current_status,'INTAKE');assert.equal(intaken.intake_by,operator.account_id);assert.ok(intaken.intake_at);assert.deepEqual(intaken.submission,submitted.submission);
   assert.deepEqual(capture(await intake(submitted,operator,operation_key),'CustomizationRequestResponse'),intaken);
   assert.deepEqual(intaken.answers,fullAnswers);assert.equal(intaken.allowed_actions.includes('SUBMIT'),false);
   failed(await intake(intaken),409);failed(await intake(submitted,publisher),403);
  });
  await t.test('idempotency protects a create or save from double creation and refuses changed content under the same key',async()=>{
   const operation_key=key(),first=await make({story:'同一个合成草稿'},buyer,buyer.personal_party_id,wedding,operation_key);
   assert.deepEqual(await make({story:'同一个合成草稿'},buyer,buyer.personal_party_id,wedding,operation_key),first);
   failed(await request('POST','/customization-requests',buyer,{template_version_id:wedding.template_version_id,answers:{story:'不同内容'}},buyer.personal_party_id,headers(null,operation_key)),409);
   const saveKey=key(),saved=capture(await save(first,{story:'更完整'},buyer,buyer.personal_party_id,saveKey),'CustomizationRequestResponse');
   assert.deepEqual(capture(await save(first,{story:'更完整'},buyer,buyer.personal_party_id,saveKey),'CustomizationRequestResponse'),saved);
   failed(await save(first,{story:'第二份内容'},buyer,buyer.personal_party_id,saveKey),409);
   const changedVersion=failed(await submit({...draft,object_version:draft.object_version+10},buyer,buyer.personal_party_id,key()),412);assert.equal(changedVersion.body.error.code,'VERSION_CONFLICT');
  });
  await t.test('two concurrent saves with the same version cannot silently overwrite one another',async()=>{
   const row=await make({story:'待竞争草稿'}),results=await Promise.all([save(row,{story:'写入甲'}),save(row,{story:'写入乙'})]);
   assert.deepEqual(results.map(x=>x.status).sort(),[200,412]);const winner=results.find(x=>x.status===200).body.data;
   assert.equal(winner.object_version,row.object_version+1);assert.deepEqual((await request('GET','/customization-requests/'+row.id)).body.data.answers,winner.answers);
  });
  await t.test('concurrent submission with different keys creates exactly one submitted version',async()=>{
   const row=await make(fullAnswers),results=await Promise.all([submit(row),submit(row)]);assert.deepEqual(results.map(x=>x.status).sort(),[200,412]);
   const [[versions]]=await db.execute('SELECT COUNT(*) n FROM customization_submissions WHERE request_id=?',[row.id]);assert.equal(Number(versions.n),1);
  });
  await t.test('institution membership does not expose another member\'s private story, even to the institution owner',async()=>{
   const ownerStory=await make(fullAnswers,buyer,org.party_id),memberStory=await make({story:'普通成员自己的草稿'},member,org.party_id);
   failed(await request('GET','/customization-requests/'+ownerStory.id,member,undefined,org.party_id),404);
   failed(await request('GET','/customization-requests/'+memberStory.id,buyer,undefined,org.party_id),404);
   failed(await save(ownerStory,fullAnswers,member,org.party_id),404);
   const memberList=capture(await request('GET','/customization-requests',member,undefined,org.party_id),'CustomizationRequestPageResponse');assert.deepEqual(memberList.items.map(x=>x.id),[memberStory.id]);
   failed(await request('GET','/customization-requests/'+memberStory.id,member,undefined,member.personal_party_id),404);
  });
  await t.test('removing membership immediately denies reads, writes and previously successful idempotent replays',async()=>{
   const operation_key=key(),row=await make(fullAnswers,member,org.party_id,wedding,operation_key),saveKey=key();
   capture(await save(row,{...fullAnswers,notes:'之前有权限'},member,org.party_id,saveKey),'CustomizationRequestResponse');
   await db.execute("UPDATE party_memberships SET current_status='REVOKED' WHERE party_id=? AND account_id=?",[org.party_id,member.account_id]);
   failed(await request('GET','/customization-requests/'+row.id,member,undefined,org.party_id),403);
   failed(await request('POST','/customization-requests',member,{template_version_id:wedding.template_version_id,answers:fullAnswers},org.party_id,headers(null,operation_key)),403);
   failed(await save(row,{...fullAnswers,notes:'之前有权限'},member,org.party_id,saveKey),403);
  });
  await t.test('revoked operator grants deny detail, inbox and replay of a previously successful intake',async()=>{
   const row=await make(fullAnswers),ready=capture(await submit(row),'CustomizationRequestResponse'),operation_key=key();capture(await intake(ready,operator,operation_key),'CustomizationRequestResponse');
   await grant(operator,'CUSTOMIZATION_INTAKE',false,1);
   failed(await request('GET','/customization-requests/'+ready.id,operator,undefined,null),403);
   failed(await request('GET','/operations/customization-requests',operator,undefined,null),403);
   failed(await intake(ready,operator,operation_key),403);
   await grant(operator,'CUSTOMIZATION_INTAKE',true,2);
  });
  await t.test('suspended accounts cannot replay an old creation or read previously accessible content',async()=>{
   const operation_key=key(),row=await make({},other,other.personal_party_id,wedding,operation_key);
   await db.execute("UPDATE identity_accounts SET current_status='SUSPENDED' WHERE id=?",[other.account_id]);
   failed(await request('GET','/customization-requests/'+row.id,other),403);
   failed(await request('POST','/customization-requests',other,{template_version_id:wedding.template_version_id,answers:{}},other.personal_party_id,headers(null,operation_key)),403);
   await db.execute("UPDATE identity_accounts SET current_status='ACTIVE' WHERE id=?",[other.account_id]);
  });
  await t.test('required attachments remain unavailable and cannot be smuggled in as a URL or forged evidence identifier',async()=>{
   const row=await make(fullAnswers,buyer,buyer.personal_party_id,attachment);const missing=failed(await submit(row),422);
   assert.ok(missing.body.error.details.some(x=>x.reason==='ATTACHMENT_SUBMISSION_NOT_READY'));
   for(const portrait of ['https://example.invalid/public.jpg',key()])failed(await save(row,{...fullAnswers,portrait}),400);
   assert.equal((await request('GET','/customization-requests/'+row.id)).body.data.current_status,'DRAFT');
  });
  await t.test('a valid long story can submit and replay even when the response contains more than 64 KiB of immutable content',async()=>{
   const template=await publish('long_story',{title:'合成长故事',description:'仅用于隔离字节边界测试',fields:['beginning','middle','ending'].map(key=>({key,label:key,type:'TEXT',required:true,max_length:5000}))});
   const answers={beginning:'甲'.repeat(5000),middle:'乙'.repeat(5000),ending:'丙'.repeat(5000)},row=await make(answers,buyer,buyer.personal_party_id,template),operation_key=key();
   const result=capture(await submit(row,buyer,buyer.personal_party_id,operation_key),'CustomizationRequestResponse');
   assert.ok(Buffer.byteLength(JSON.stringify(result),'utf8')>64*1024);assert.deepEqual(result.submission.answers,answers);
   assert.deepEqual(capture(await submit(row,buyer,buyer.personal_party_id,operation_key),'CustomizationRequestResponse'),result);
   assert.deepEqual(capture(await request('GET','/customization-requests/'+row.id,operator,undefined,null),'CustomizationRequestResponse').submission.answers,answers);
  });
  await t.test('client-supplied state, authority and undeclared fields never become accepted story answers',async()=>{
   failed(await request('POST','/customization-requests',buyer,{template_version_id:wedding.template_version_id,answers:{story:'test'},current_status:'PAID'},buyer.personal_party_id,headers()),400);
   failed(await request('POST','/customization-requests',buyer,{template_version_id:wedding.template_version_id,answers:{story:'test',payment_verified:'true'}},buyer.personal_party_id,headers()),400);
   const row=await make();failed(await save(row,{story:{secret:'not a string'}}),400);
   failed(await save(row,{tone:'不存在的选项'}),422);
   failed(await request('POST','/customization-requests/'+row.id+'/submissions',buyer,{approved:true},buyer.personal_party_id,headers(row)),400);
  });
  await t.test('HTTP commands require authentication, an explicit party, idempotency and version headers',async()=>{
   failed(await request('GET','/customization-categories',null,undefined,null),401);
   failed(await request('GET','/customization-requests',buyer,undefined,null),400);
   const row=await make();failed(await request('GET','/customization-requests/'+row.id,buyer,undefined,null),403);
   failed(await request('POST','/customization-requests',buyer,{template_version_id:wedding.template_version_id,answers:{}}),400);
   failed(await request('PATCH','/customization-requests/'+row.id,buyer,{answers:{}},buyer.personal_party_id,{'Idempotency-Key':key()}),428);
   failed(await request('POST','/customization-requests/'+row.id+'/submissions',buyer,{},buyer.personal_party_id,{'Idempotency-Key':key(),'If-Match':'W/"1"'}),400);
   failed(await request('PATCH','/customization-requests/'+row.id,buyer,{answers:{}},buyer.personal_party_id,{'Idempotency-Key':key(),'If-Match':'"0"'}),400);
   failed(await request('GET','/customization-requests/'+key()),404);
  });
  await t.test('HTTP enforces the 64 KiB JSON boundary and returns only fixed validation reasons, never story text',async()=>{
   const marker='PRIVATE_SYNTHETIC_MARKER_',response=failed(await request('POST','/customization-requests',buyer,{template_version_id:wedding.template_version_id,answers:{story:marker+'汉'.repeat(30000)}},buyer.personal_party_id,headers()),413);
   assert.equal(JSON.stringify(response.body).includes(marker),false);
   const invalid=failed(await request('POST','/customization-requests',buyer,{template_version_id:pet.template_version_id,answers:{pet_story:{private:marker}}},buyer.personal_party_id,headers()),400);assert.equal(JSON.stringify(invalid.body).includes(marker),false);
  });
  await t.test('pagination binds signed cursors to user, party, list type and filter',async()=>{
   const first=capture(await request('GET','/customization-requests?limit=1'),'CustomizationRequestPageResponse');assert.equal(first.items.length,1);assert.ok(first.next_cursor);
   const cursor=encodeURIComponent(first.next_cursor),next=capture(await request('GET','/customization-requests?limit=1&cursor='+cursor),'CustomizationRequestPageResponse');assert.notEqual(next.items[0].id,first.items[0].id);
   failed(await request('GET','/customization-requests?limit=1&cursor='+cursor,other),400);
   failed(await request('GET','/customization-requests?limit=1&cursor='+cursor,buyer,undefined,org.party_id),400);
   failed(await request('GET','/customization-requests?limit=1&current_status=DRAFT&cursor='+cursor),400);
   failed(await request('GET','/operations/customization-requests?limit=1&cursor='+cursor,operator,undefined,null),400);
   failed(await request('GET','/customization-requests?cursor='+cursor.slice(0,-1)+'z'),400);
   for(const suffix of ['limit=0','limit=101','limit=1&limit=2','current_status=PAID','unknown=true'])failed(await request('GET','/customization-requests?'+suffix),400);
   failed(await request('GET','/operations/customization-requests?current_status=DRAFT',operator,undefined,null),400);
  });
  await t.test('failed audit rolls back creation and its deduplication record so a safe retry creates one draft',async()=>{
   const broken={...db,withTransaction:work=>db.withTransaction(tx=>work({execute:async(sql,args)=>{if(sql.includes('INSERT INTO customization_audit'))throw Error('synthetic audit failure');return tx.execute(sql,args);}}))};
   const bad=createCustomizationRepository(broken,{resolvePrincipal}),input={party_id:buyer.personal_party_id,template_version_id:wedding.template_version_id,answers:{story:'atomic creation'},operation_key:key()};
   const before=await count('customization_requests'),commands=await count('customization_commands');
   await assert.rejects(bad.create(buyer.ctx,input),/synthetic audit failure/);assert.equal(await count('customization_requests'),before);assert.equal(await count('customization_commands'),commands);
   const result=await repo.create(buyer.ctx,input);assert.equal(result.object_version,1);assert.equal(await count('customization_requests'),before+1);
  });
  await t.test('failed submission audit rolls back state, immutable version and operation record together',async()=>{
   const row=await make(fullAnswers),input={party_id:buyer.personal_party_id,request_id:row.id,expected_version:row.object_version,operation_key:key()};
   const broken={...db,withTransaction:work=>db.withTransaction(tx=>work({execute:async(sql,args)=>{if(sql.includes('INSERT INTO customization_audit'))throw Error('synthetic submission audit failure');return tx.execute(sql,args);}}))};
   const before=await count('customization_submissions');await assert.rejects(createCustomizationRepository(broken,{resolvePrincipal}).submit(buyer.ctx,input),/synthetic submission audit failure/);
   assert.equal(await count('customization_submissions'),before);assert.deepEqual(await repo.get(buyer.ctx,{request_id:row.id,party_id:buyer.personal_party_id}),row);
   assert.equal((await repo.submit(buyer.ctx,input)).current_status,'SUBMITTED');assert.equal(await count('customization_submissions'),before+1);
  });
  // Second-round supplement cases reuse only the same isolated identities and fixture API.
  const issues=[{field_key:'story',reason:'合成测试：时间线不清楚',instruction:'补充事件先后，并逐项说明补充情况'}];
  const openSupplement=(row,items=issues,person=operator,k=key())=>request('POST','/operations/customization-requests/'+(row.id||row.request_id)+'/supplements',person,{items},null,headers(row,k));
  const getSupplement=(id,person=buyer,party=person.personal_party_id)=>request('GET','/customization-requests/'+id+'/supplement',person,undefined,party);
  const saveSupplement=(row,answers,responses,person=buyer,party=person.personal_party_id,k=key())=>request('PATCH','/customization-requests/'+row.request_id+'/supplement',person,{answers,responses},party,headers(row,k));
  const finishSupplement=(row,person=buyer,party=person.personal_party_id,k=key())=>request('POST','/customization-requests/'+row.request_id+'/supplement-submissions',person,{},party,headers(row,k));
  const readyStory=async()=>capture(await intake(capture(await submit(await make(fullAnswers)),'CustomizationRequestResponse')),'CustomizationRequestResponse');
  let amended,openCard,savedCard,revised;
  await t.test('only a current operator can request scoped supplements after actual intake; request replay is stable',async()=>{
   const draftOnly=await make(fullAnswers);failed(await openSupplement(draftOnly),404);
   const pending=capture(await submit(draftOnly),'CustomizationRequestResponse');failed(await openSupplement(pending),409);
   amended=capture(await intake(pending),'CustomizationRequestResponse');
   failed(await openSupplement(amended,issues,buyer),403);
   const empty=capture(await getSupplement(amended.id),'CustomizationSupplementContextResponse');assert.equal(empty.supplement,null);
   failed(await openSupplement(amended,[...issues,...issues]),400);
   failed(await openSupplement(amended,[{...issues[0],field_key:'unknown'}]),400);
   const k=key();openCard=capture(await openSupplement(amended,issues,operator,k),'CustomizationSupplementContextResponse');
   assert.equal(openCard.supplement.current_status,'OPEN');assert.equal(openCard.draft,null);
   assert.deepEqual(capture(await openSupplement(amended,issues,operator,k),'CustomizationSupplementContextResponse'),openCard);
   failed(await openSupplement({...openCard,id:amended.id}),409);
   failed(await openSupplement(amended,[{...issues[0],reason:'changed'}],operator,k),409);
  });
  await t.test('supplement draft edits and responses are private and do not overwrite the submitted story',async()=>{
   const card=capture(await getSupplement(amended.id),'CustomizationSupplementContextResponse');assert.deepEqual(card.draft.answers,fullAnswers);
   savedCard=capture(await saveSupplement(card,{...fullAnswers,story:'PRIVATE_SYNTHETIC_DRAFT'},{story:'PRIVATE_SYNTHETIC_REPLY'}),'CustomizationSupplementContextResponse');
   const ops=capture(await getSupplement(amended.id,operator,null),'CustomizationSupplementContextResponse');assert.equal(ops.draft,null);assert.equal(JSON.stringify(ops).includes('PRIVATE_SYNTHETIC'),false);
   const published=capture(await request('GET','/customization-requests/'+amended.id,operator,undefined,null),'CustomizationRequestResponse');assert.deepEqual(published.answers,fullAnswers);
   failed(await getSupplement(amended.id,other),404);failed(await saveSupplement(savedCard,fullAnswers,{},other),404);
   failed(await save({...amended,object_version:savedCard.object_version},fullAnswers),409);
  });
  await t.test('every requested item needs an explicit response; clearing remains empty and never silently closes a request',async()=>{
   savedCard=capture(await saveSupplement(savedCard,{...fullAnswers,story:''},{story:''}),'CustomizationSupplementContextResponse');
   assert.equal(savedCard.draft.answers.story,'');failed(await finishSupplement(savedCard),422);
   savedCard=capture(await saveSupplement(savedCard,fullAnswers,{story:''}),'CustomizationSupplementContextResponse');
   const response=failed(await finishSupplement(savedCard),422);assert.ok(response.body.error.details.some(x=>x.field==='responses.story'&&x.reason==='REQUIRED'));
   assert.equal((await getSupplement(amended.id)).body.data.supplement.current_status,'OPEN');
   failed(await saveSupplement(savedCard,fullAnswers,{notes:'not requested'}),400);
   savedCard=capture(await saveSupplement(savedCard,{...fullAnswers,story:'第二次正式提交的合成内容'},{story:'已经逐项补充时间线'}),'CustomizationSupplementContextResponse');
  });
  await t.test('resubmission freezes a new version, preserves the first, and returns to operations without marking the material approved',async()=>{
   const k=key();revised=capture(await finishSupplement(savedCard,buyer,buyer.personal_party_id,k),'CustomizationRequestResponse');
   assert.equal(revised.current_status,'SUBMITTED');assert.equal(revised.intake_by,null);assert.equal(revised.intake_at,null);
   assert.notEqual(revised.submission.id,amended.submission.id);
   assert.deepEqual(capture(await finishSupplement(savedCard,buyer,buyer.personal_party_id,k),'CustomizationRequestResponse'),revised);
   const response=capture(await getSupplement(amended.id,operator,null),'CustomizationSupplementContextResponse');assert.equal(response.supplement.current_status,'RESPONDED');assert.equal(response.draft,null);assert.equal(response.supplement.response.responses.story,'已经逐项补充时间线');
   const old=capture(await request('GET','/customization-requests/'+amended.id+'/submissions/'+amended.submission.id),'CustomizationSubmissionVersionResponse');assert.deepEqual(old.submission,amended.submission);assert.equal(old.supplement_response,null);
   const latest=capture(await request('GET','/customization-requests/'+amended.id+'/submissions/'+revised.submission.id,operator,undefined,null),'CustomizationSubmissionVersionResponse');assert.equal(latest.submission_number,2);assert.deepEqual(latest.supplement_response.items,issues);
   failed(await finishSupplement({...savedCard,object_version:revised.object_version}),409);
  });
  await t.test('multiple supplement rounds retain all published versions and private history stays scoped to the request',async()=>{
   const accepted=capture(await intake(revised),'CustomizationRequestResponse');
   let card=capture(await openSupplement(accepted),'CustomizationSupplementContextResponse');
   card=capture(await saveSupplement(card,revised.answers,{story:'复核后确认上述内容，无需再次改写'}),'CustomizationSupplementContextResponse');
   const third=capture(await finishSupplement(card),'CustomizationRequestResponse');assert.equal(third.current_status,'SUBMITTED');
   const first=capture(await request('GET','/customization-requests/'+amended.id+'/submissions?limit=1'),'CustomizationSubmissionHistoryResponse');assert.equal(first.items[0].submission_number,1);assert.ok(first.next_cursor);assert.equal(first.items[0].answers,undefined);
   const cursor=encodeURIComponent(first.next_cursor),url='/customization-requests/'+amended.id+'/submissions?limit=1&cursor='+cursor;
   const second=capture(await request('GET',url),'CustomizationSubmissionHistoryResponse');assert.equal(second.items[0].submission_number,2);
   failed(await request('GET',url,other),400);
   failed(await request('GET','/customization-requests/'+intaken.id+'/submissions?cursor='+cursor),400);
   failed(await request('GET','/customization-requests/'+amended.id+'/submissions?current_status=INTAKE'),400);
   failed(await request('GET','/customization-requests/'+amended.id+'/submissions/'+intaken.submission.id),404);
   failed(await request('GET','/customization-requests/'+amended.id+'/submissions/'+amended.submission.id,other),404);
   const old=capture(await request('GET','/customization-requests/'+amended.id+'/submissions/'+revised.submission.id),'CustomizationSubmissionVersionResponse');assert.equal(old.supplement_response.responses.story,'已经逐项补充时间线');
  });
  await t.test('concurrent requests, draft saves and submissions each have a single winner',async()=>{
   const story=await readyStory();let results=await Promise.all([openSupplement(story),openSupplement(story)]);assert.deepEqual(results.map(x=>x.status).sort(),[200,412]);
   const card=results.find(x=>x.status===200).body.data;
   results=await Promise.all([saveSupplement(card,fullAnswers,{story:'A'}),saveSupplement(card,fullAnswers,{story:'B'})]);assert.deepEqual(results.map(x=>x.status).sort(),[200,412]);
   const saved=results.find(x=>x.status===200).body.data;
   results=await Promise.all([finishSupplement(saved),finishSupplement(saved)]);assert.deepEqual(results.map(x=>x.status).sort(),[200,412]);
   const [[count]]=await db.execute('SELECT COUNT(*) n FROM customization_submissions WHERE request_id=?',[story.id]);assert.equal(Number(count.n),2);
  });
  await t.test('revoked membership and operator grants block supplement reads and old command replay',async()=>{
   const story=await readyStory(),k=key(),card=capture(await openSupplement(story,issues,operator,k),'CustomizationSupplementContextResponse');
   const saveKey=key(),saved=capture(await saveSupplement(card,fullAnswers,{story:'response'},buyer,buyer.personal_party_id,saveKey),'CustomizationSupplementContextResponse');
   await db.execute("UPDATE party_memberships SET current_status='REVOKED' WHERE party_id=? AND account_id=?",[buyer.personal_party_id,buyer.account_id]);
   try{failed(await getSupplement(story.id),403);failed(await saveSupplement(card,fullAnswers,{story:'response'},buyer,buyer.personal_party_id,saveKey),403);failed(await finishSupplement(saved),403);}
   finally{await db.execute("UPDATE party_memberships SET current_status='ACTIVE' WHERE party_id=? AND account_id=?",[buyer.personal_party_id,buyer.account_id]);}
   await grant(operator,'CUSTOMIZATION_INTAKE',false,3);
   try{failed(await getSupplement(story.id,operator,null),403);failed(await openSupplement(story,issues,operator,k),403);failed(await request('GET','/customization-requests/'+story.id+'/submissions',operator,undefined,null),403);}
   finally{await grant(operator,'CUSTOMIZATION_INTAKE',true,4);}
  });
  await t.test('audit failure rolls back supplement request, private save and resubmission as complete transactions',async()=>{
   const story=await readyStory(),broken={...db,withTransaction:work=>db.withTransaction(tx=>work({execute:async(sql,args)=>{if(sql.includes('INSERT INTO customization_audit'))throw Error('supplement audit failure');return tx.execute(sql,args);}}))},bad=createCustomizationRepository(broken,{resolvePrincipal});
   const input={request_id:story.id,items:issues,expected_version:story.object_version,operation_key:key()},before=await count('customization_supplements');
   await assert.rejects(bad.requestSupplement(operator.ctx,input),/supplement audit failure/);assert.equal(await count('customization_supplements'),before);
   const card=await repo.requestSupplement(operator.ctx,input),saveInput={request_id:story.id,party_id:buyer.personal_party_id,answers:fullAnswers,responses:{story:'valid reply'},expected_version:card.object_version,operation_key:key()};
   await assert.rejects(bad.saveSupplement(buyer.ctx,saveInput),/supplement audit failure/);assert.deepEqual((await repo.getSupplement(buyer.ctx,{request_id:story.id,party_id:buyer.personal_party_id})).draft.responses,{});
   const saved=await repo.saveSupplement(buyer.ctx,saveInput),finish={request_id:story.id,party_id:buyer.personal_party_id,expected_version:saved.object_version,operation_key:key()},versions=await count('customization_submissions');
   await assert.rejects(bad.submitSupplement(buyer.ctx,finish),/supplement audit failure/);assert.equal(await count('customization_submissions'),versions);assert.equal((await repo.getSupplement(buyer.ctx,{request_id:story.id,party_id:buyer.personal_party_id})).supplement.current_status,'OPEN');
   const complete=await repo.submitSupplement(buyer.ctx,finish);assert.equal(complete.current_status,'SUBMITTED');
  });
  await t.test('supplements cannot request unavailable attachments, change template fields or accept a forged status',async()=>{
   const template=await publish('optional_material',{...snapshot,fields:[...snapshot.fields,{key:'portrait',label:'未开放附件',type:'PRIVATE_ATTACHMENT',required:false}]});
   const story=capture(await intake(capture(await submit(await make(fullAnswers,buyer,buyer.personal_party_id,template)),'CustomizationRequestResponse')),'CustomizationRequestResponse');
   failed(await openSupplement(story,[{...issues[0],field_key:'portrait'}]),422);
   failed(await request('POST','/operations/customization-requests/'+story.id+'/supplements',operator,{items:issues,approved:true},null,headers(story)),400);
   failed(await request('POST','/operations/customization-requests/'+story.id+'/supplements',operator,{items:issues},null,{'Idempotency-Key':key()}),428);
  });
  await t.test('story intake has no order, payment, refund or production side effects',async()=>{
   for(const table of ['trade_records','trade_journal','production_records'])assert.equal(await count(table),0,table+' must remain empty');
   const current=capture(await request('GET','/customization-requests/'+intaken.id),'CustomizationRequestResponse');assert.deepEqual(current.submission,submitted.submission);
   assert.equal(current.payment,undefined);assert.equal(current.production_id,undefined);
   assert.equal((await request('GET','/customization-requests/'+intaken.id)).headers.get('cache-control'),'no-store');
  });
  fixtures.push({schema:'CreateCustomizationRequest',value:{template_version_id:wedding.template_version_id,answers:{}}},{schema:'UpdateCustomizationRequest',value:{answers:{story:''}}},{schema:'CustomizationEmptyCommand',value:{}});
  const out=path.resolve(__dirname,'../../../..','.local/customization-http-fixtures.json');await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify({synthetic_only:true,cases:fixtures},null,2));
 }finally{
  if(server)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
  if(db)await db.close();await control.query('DROP DATABASE '+mysql.escapeId(name));await control.end();
 }
});
