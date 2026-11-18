"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator'),{digest}=require('../src/modules/governance/content');
const {createAccountApi}=require('../src/http/account-api');
test('project story files: exact ordered submission and current assigned authority',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));for(const [k,v] of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name=`jx_test_${process.pid}_${randomBytes(6).toString('hex')}`,control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;
 try{
 await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
 const f=await require('./support/customization-delivery.cjs').seed(db),{producer,buyer,reviewer,outsider,artist}=f.people;
 let afterRead=null;const guardedStorage=()=>({...f.storageFactory(),async getBuffer(k){const body=await f.storageFactory().getBuffer(k);if(afterRead)await afterRead(k);return body;}});
 server=createAccountApi({db,secret:f.secret,supplyStorageFactory:guardedStorage,tradeEnv:{CUSTOMIZATION_MERCHANT_PARTY_ID:f.org.party_id,CUSTOMIZATION_CONTRACT_POLICY:'CONTRACT_20261029'}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1',fixtures=[];
 async function call(method,url,who=producer,body,version=null,op=key(),party=who.acting_party_id){const res=await fetch(base+url,{method,headers:{Authorization:'Bearer '+who.token,...(party?{'X-Acting-Party':party}:{}),...(body===undefined?{}:{'Content-Type':Buffer.isBuffer(body)?'application/octet-stream':'application/json','Idempotency-Key':op}),...(version?{'If-Match':'"'+version+'"'}:{})},...(body===undefined?{}:{body:Buffer.isBuffer(body)?body:JSON.stringify(body)})});const binary=!(res.headers.get('content-type')||'').includes('application/json'),value=binary?Buffer.from(await res.arrayBuffer()):await res.json();if(!binary)fixtures.push({method,path:new URL(base+url).pathname,schema:res.status===200?((url.startsWith('/customization-requests')||url.startsWith('/operations/customization-requests'))?'CustomizationRequestResponse':url.includes('/fulfillment')||['/start','/cases','/case-resolution','/refund-sync','/delivery-receipt','/reissue'].some(x=>url.endsWith(x))?'CustomizationFulfillmentResponse':url.endsWith('/story')?'ProductionStoryResponse':url.startsWith('/operations')?'OpsReadResponse':url.startsWith('/trade/')?'TradeRecordResponse':'ProductionRecordResponse'):'ErrorResponse',value});return {status:res.status,cache:res.headers.get('cache-control'),nosniff:res.headers.get('x-content-type-options'),data:value.data,error:value.error,body:value};}
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

 const staff=[];for(let n=0;n<2;n++){const u=await f.registerActor('worker'+n),i=await f.parties.inviteMember(producer.ctx,{party_id:f.org.party_id,invitee_account_id:u.account_id,expires_at:'2099-01-01T00:00:00.000Z',operation_key:key()});await f.parties.respondInvitation(u.ctx,{party_id:f.org.party_id,invitation_id:i.invitation_id,expected_version:1,decision:'ACCEPT',operation_key:key()});u.acting_party_id=f.org.party_id;staff.push(u);}const [worker,next]=staff;
 const template=await f.stories.publishTemplate(producer.ctx,{category_code:'project_story_files',template_version:1,template_snapshot:{title:'Private recipient story',description:'This production only',fields:[{key:'recipient',label:'Recipient',type:'TEXT',required:true},{key:'relationship',label:'Relationship for this story',type:'TEXT',required:true},{key:'material',label:'Private material',type:'PRIVATE_ATTACHMENT',required:true}]},source_ref:'synthetic:project-story-files',operation_key:key()});
 let story=await f.stories.create(buyer.ctx,{party_id:buyer.personal_party_id,template_version_id:template.template_version_id,answers:{recipient:'Synthetic aunt',relationship:'Birthday greeting'},operation_key:key()});
 const files=require('../src/modules/customization/attachments').service(f.stories,f.storageFactory());
 const uploadStory=(r,text)=>files.upload(buyer.ctx,{request_id:r.id,party_id:buyer.personal_party_id,display_name:'private.txt',media_type:'text/plain',body:Buffer.from(text),operation_key:key()});
 const oldFile=await uploadStory(story,'old submitted family reference'),unsubmitted=await uploadStory(story,'never submitted private reference');
 const answers=id=>({recipient:'Synthetic aunt',relationship:'Birthday greeting',material:id});
 story=await f.stories.save(buyer.ctx,{request_id:story.id,party_id:buyer.personal_party_id,answers:answers(oldFile.id),expected_version:story.object_version,operation_key:key()});story=await f.stories.submit(buyer.ctx,{request_id:story.id,party_id:buyer.personal_party_id,expected_version:story.object_version,operation_key:key()});story=await f.stories.intake(producer.ctx,{request_id:story.id,expected_version:story.object_version,operation_key:key()});
 const supplement=await f.stories.requestSupplement(producer.ctx,{request_id:story.id,items:[{field_key:'material',reason:'Replace only this production reference',instruction:'Provide current material'}],expected_version:story.object_version,operation_key:key()});
 const current=await uploadStory(story,'current ordered family reference');let draft=await f.stories.saveSupplement(buyer.ctx,{request_id:story.id,party_id:buyer.personal_party_id,answers:answers(current.id),responses:{material:'Replaced reference'},expected_version:supplement.object_version,operation_key:key()});
 story=await f.stories.submitSupplement(buyer.ctx,{request_id:story.id,party_id:buyer.personal_party_id,expected_version:draft.object_version,operation_key:key()});story=await f.stories.intake(producer.ctx,{request_id:story.id,expected_version:story.object_version,operation_key:key()});
 const source=await f.newOrder({sourceStory:story}),p=await review(ok(await call('POST','/production/projects',producer,{...input(source.order),assignee_account_id:worker.account_id})));
 const url=(asset=current,project=p)=>'/production/projects/'+project.id+'/story/attachments/'+asset.id+'/content';
 const observations=[];const download=async(who=worker,asset=current,project=p)=>{const r=await call('GET',url(asset,project),who,undefined,null,key(),who===reviewer?null:who.acting_party_id);observations.push({account_id:who.account_id,project_id:project.id,asset_id:asset.id,status:r.status,...Buffer.isBuffer(r.body)?{byte_size:r.body.length,sha256:require('node:crypto').createHash('sha256').update(r.body).digest('hex'),cache:r.cache,nosniff:r.nosniff}:{error:r.error?.code}});return r;};
 await t.test('assigned worker reads the bound story but has no global intake authority; project file bytes are available',async()=>{
  const d=ok(await call('GET','/production/projects/'+p.id+'/story',worker));assert.equal(d.answers.material,current.id);assert.equal(d.submission_id,story.submission.id);
  await assert.rejects(f.stories.attachment(worker.ctx,{request_id:story.id,asset_id:current.id}),{code:'CUSTOMIZATION_FORBIDDEN'});
  const r=await download();assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.toString(),'current ordered family reference');
 });

 await t.test('buyer owner merchant owner and assigned worker are allowed; other members and outsiders are refused',async()=>{
  for(const u of [buyer,producer,worker]){const r=await download(u);assert.equal(r.status,200);assert.equal(r.cache,'no-store');assert.equal(r.nosniff,'nosniff');assert.equal(r.body.toString(),'current ordered family reference');}
  assert.equal((await download(next)).status,403);assert.equal((await download(outsider)).status,404);
  assert.equal((await download(reviewer)).status,403);await f.grant(reviewer,'CUSTOMIZATION_INTAKE');assert.equal((await download(reviewer)).status,200);
  await f.grant(outsider,'CUSTOMIZATION_INTAKE');assert.equal((await call('GET',url(),outsider,undefined,null,key(),null)).status,403);
 });
 await t.test('only current ordered submission files are visible; earlier submitted and unsubmitted material stay separate',async()=>{
  for(const a of [oldFile,unsubmitted,{id:key()}]){const r=await download(worker,a);assert.equal(r.status,404);assert.equal(r.error.code,'CUSTOMIZATION_ATTACHMENT_NOT_FOUND');}
  const list=await f.stories.attachments(buyer.ctx,{request_id:story.id,party_id:buyer.personal_party_id,include_retention:true});
  assert.equal(list.items.find(x=>x.id===oldFile.id).retention_reason,'FORMAL_SUBMISSION');assert.equal(list.items.find(x=>x.id===current.id).retention_reason,'FORMAL_SUBMISSION');assert.equal(list.items.find(x=>x.id===unsubmitted.id).retention_reason,null);
  await assert.rejects(f.stories.revokeAttachment(buyer.ctx,{request_id:story.id,party_id:buyer.personal_party_id,asset_id:oldFile.id,expected_version:oldFile.object_version,operation_key:key()}),{code:'CUSTOMIZATION_ATTACHMENT_RETENTION_REQUIRED'});
  const revoked=await f.stories.revokeAttachment(buyer.ctx,{request_id:story.id,party_id:buyer.personal_party_id,asset_id:unsubmitted.id,expected_version:unsubmitted.object_version,operation_key:key()});assert.equal(revoked.current_status,'REVOKED');
  assert.equal((await call('GET',url()+'?purpose=MARKETING',worker)).status,400);
 });
 async function assign(who){return ok(await call('POST','/production/projects/'+p.id+'/assignment',producer,{assignee_account_id:who.account_id,reason:'Synthetic project assignment'},(await get(p)).object_version));}
 await t.test('transfer and transfer during transport remove former worker authority before bytes are returned',async()=>{
  await assign(next);assert.equal((await download(worker)).status,403);assert.equal((await download(next)).status,200);
  assert.equal((await call('GET','/production/projects/'+p.id+'/story',worker)).status,403);await assign(worker);
  afterRead=async()=>{afterRead=null;await assign(next);};try{assert.equal((await download(worker)).status,403);}finally{afterRead=null;}
  assert.equal((await download(next)).status,200);await assign(worker);
 });
 await t.test('removed membership and revoked review grant during transport cannot use an old session',async()=>{
  afterRead=async()=>{afterRead=null;await db.execute("UPDATE party_memberships SET current_status='REVOKED' WHERE party_id=? AND account_id=?",[f.org.party_id,worker.account_id]);};
  try{assert.equal((await download(worker)).status,403);}finally{afterRead=null;await db.execute("UPDATE party_memberships SET current_status='ACTIVE' WHERE party_id=? AND account_id=?",[f.org.party_id,worker.account_id]);}
  afterRead=async()=>{afterRead=null;await require('../src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:reviewer.account_id,action:'CUSTOMIZATION_INTAKE',enabled:false,expected_version:1,expires_at:null,authority_ref:'synthetic:revoke',reason:'No further story access'});};
  try{assert.equal((await download(reviewer)).status,403);}finally{afterRead=null;}assert.equal((await download(worker)).status,200);
 });
 await t.test('missing corrupt revoked or changed stored bytes fail without fallback',async()=>{
  const frow=(await db.execute('SELECT * FROM customization_attachments WHERE id=?',[current.id]))[0][0],saved=f.files.get(frow.object_key);
  try{f.files.delete(frow.object_key);assert.equal((await download()).status,503);f.files.set(frow.object_key,Buffer.from('corrupt'));assert.equal((await download()).status,503);}finally{f.files.set(frow.object_key,saved);}
  afterRead=async()=>{afterRead=null;await db.execute("UPDATE customization_attachments SET current_status='REVOKED' WHERE id=?",[current.id]);};
  try{assert.equal((await download()).status,409);}finally{afterRead=null;await db.execute("UPDATE customization_attachments SET current_status='READY' WHERE id=?",[current.id]);}
  afterRead=async()=>{afterRead=null;await db.execute('UPDATE customization_attachments SET content_sha256=? WHERE id=?',['0'.repeat(64),current.id]);};
  try{assert.equal((await download()).status,503);}finally{afterRead=null;await db.execute('UPDATE customization_attachments SET content_sha256=? WHERE id=?',[frow.content_sha256,current.id]);}
  assert.equal((await download()).status,200);
 });
 await t.test('another project and substituted source cannot borrow the original order binding',async()=>{
  let other=await f.stories.create(buyer.ctx,{party_id:buyer.personal_party_id,template_version_id:template.template_version_id,answers:{recipient:'Synthetic colleague',relationship:'Different project'},operation_key:key()});const otherFile=await uploadStory(other,'different project file');
  other=await f.stories.save(buyer.ctx,{request_id:other.id,party_id:buyer.personal_party_id,answers:{recipient:'Synthetic colleague',relationship:'Different project',material:otherFile.id},expected_version:other.object_version,operation_key:key()});other=await f.stories.submit(buyer.ctx,{request_id:other.id,party_id:buyer.personal_party_id,expected_version:other.object_version,operation_key:key()});other=await f.stories.intake(producer.ctx,{request_id:other.id,expected_version:other.object_version,operation_key:key()});
  const second=await f.newOrder({sourceStory:other}),otherProject=await review(ok(await call('POST','/production/projects',producer,{...input(second.order),assignee_account_id:next.account_id})));
  assert.equal((await download(worker,otherFile,p)).status,404);assert.equal((await download(worker,otherFile,otherProject)).status,403);assert.equal((await download(next,otherFile,otherProject)).status,200);
  const raw=(await db.execute('SELECT * FROM production_fulfillments WHERE project_id=?',[p.id]))[0][0],data=typeof raw.data_json==='string'?JSON.parse(raw.data_json):raw.data_json,changed={...data,source:second.order.data.quote.customization};
  await db.execute('UPDATE production_fulfillments SET data_json=?,data_sha256=? WHERE project_id=?',[JSON.stringify(changed),digest(changed),p.id]);
  try{assert.equal((await download(worker,otherFile,p)).status,404);}finally{await db.execute('UPDATE production_fulfillments SET data_json=?,data_sha256=? WHERE project_id=?',[JSON.stringify(data),raw.data_sha256,p.id]);}
  const original=(await db.execute('SELECT answers_sha256 FROM customization_submissions WHERE id=?',[story.submission.id]))[0][0];await db.execute('UPDATE customization_submissions SET answers_sha256=? WHERE id=?',['0'.repeat(64),story.submission.id]);
  try{assert.equal((await download()).status,503);}finally{await db.execute('UPDATE customization_submissions SET answers_sha256=? WHERE id=?',[original.answers_sha256,story.submission.id]);}
  assert.equal((await download()).status,200);assert.equal((await f.trade.read(buyer.ctx,{record_id:source.order.id,party_id:buyer.personal_party_id})).data.contract.content_sha256,source.order.data.contract.content_sha256);
 });
 await fs.writeFile(path.resolve(__dirname,'../../../..','.local/story-scope-records.json'),JSON.stringify({synthetic_only:true,project_id:p.id,order_id:source.order.id,request_id:story.id,submission_id:story.submission.id,ordered_file_id:current.id,old_file_id:oldFile.id,unsubmitted_file_id:unsubmitted.id,observations},null,2));
 await fs.mkdir(path.resolve(__dirname,'../../../..','.local'),{recursive:true});await fs.writeFile(path.resolve(__dirname,'../../../..','.local/story-scope-http-fixtures.json'),JSON.stringify({synthetic_only:true,cases:fixtures},null,2));
 }finally{if(server)await new Promise(r=>{server.close(r);server.closeAllConnections();});if(db)await db.close();await control.query('DROP DATABASE '+mysql.escapeId(name));await control.end();}
});
