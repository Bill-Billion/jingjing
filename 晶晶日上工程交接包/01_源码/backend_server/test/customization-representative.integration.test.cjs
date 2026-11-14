'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
const {createAccountApi}=require('../src/http/account-api');
test('enterprise customization: current trade authority, fulfillment and private author boundaries',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 for(const [k,v] of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name=`jx_test_${process.pid}_${randomBytes(6).toString('hex')}`,control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
  const S=await require('./support/customization-delivery.cjs').seed(db),{buyer:owner,outsider:delegate,artist:colleague,producer,reviewer}=S.people;
  const org=await S.parties.createOrganization(owner.ctx,{display_name:'Synthetic customization buyer',operation_key:key()}),future=()=>new Date(Date.now()+86400000).toISOString();
  for(const user of [delegate,colleague]){const inv=await S.parties.inviteMember(owner.ctx,{party_id:org.party_id,invitee_account_id:user.account_id,expires_at:future(),operation_key:key()});await S.parties.respondInvitation(user.ctx,{party_id:org.party_id,invitation_id:inv.invitation_id,decision:'ACCEPT',expected_version:1,operation_key:key()});}
  // Reviewed company is a synthetic prerequisite. No real verification or external payment is performed.
  await db.execute("UPDATE parties SET current_status='ACTIVE' WHERE id=?",[org.party_id]);
  const second=await S.parties.createOrganization(delegate.ctx,{display_name:'Synthetic second subject',operation_key:key()});
  const template=await S.stories.publishTemplate(producer.ctx,{category_code:'synthetic_delegate',template_version:1,template_snapshot:{title:'Synthetic private story',description:'Isolated only',fields:[{key:'story',label:'Story',type:'TEXT',required:true,max_length:1000},{key:'material',label:'Private reference',type:'PRIVATE_ATTACHMENT',required:true}]},source_ref:'synthetic:delegate',operation_key:key()});
  let onRead=null;const storageFactory=()=>({...S.storageFactory(),async getBuffer(k){const fn=onRead;onRead=null;if(fn)await fn();return S.files.get(k);}});
  server=createAccountApi({db,secret:S.secret,supplyStorageFactory:storageFactory,tradeEnv:{CUSTOMIZATION_MERCHANT_PARTY_ID:S.org.party_id,CUSTOMIZATION_CONTRACT_POLICY:'CONTRACT_20261029'}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port+'/api/v1',fixtures=[],records=[];
  async function call(method,url,{user=delegate,party=org.party_id,body,version,op=key(),schema}={}){
   const r=await fetch(base+url,{method,headers:{Authorization:'Bearer '+user.token,...(party?{'X-Acting-Party':party}:{}),...(body===undefined?{}:{'Content-Type':Buffer.isBuffer(body)?'application/octet-stream':'application/json','Idempotency-Key':op}),...(version?{'If-Match':'"'+version+'"'}:{})},...(body===undefined?{}:{body:Buffer.isBuffer(body)?body:JSON.stringify(body)})});
   if(!r.headers.get('content-type')?.includes('json'))return {status:r.status,bytes:Buffer.from(await r.arrayBuffer())};
   const value=await r.json();if(r.ok)assert.ok(schema,'Successful response needs schema: '+url);fixtures.push({method,path:new URL(base+url).pathname,schema:r.ok?schema:'ErrorResponse',value});return {status:r.status,...value};
  }
  const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.data;},sub=(n,fn)=>t.test(n,async()=>{await fn();records.push({name:n,result:'PASS'});});
  const prefix='/parties/'+org.party_id+'/representatives',offer=(scope='TRADE',user=delegate)=>call('POST',prefix,{user:owner,body:{account_id:user.account_id,scope,expires_at:future()},schema:'RepresentativeResponse'});
  const act=(g,action,user=delegate)=>call('POST',prefix+'/'+g.id+'/actions',{user,body:{action},version:g.object_version,schema:'RepresentativeResponse'});
  const createBody={template_version_id:template.template_version_id,answers:{story:'Synthetic delegate authored story'}},createKey=key();
  const create=(extra={})=>call('POST','/customization-requests',{body:createBody,op:createKey,schema:'CustomizationRequestResponse',...extra});
  let grant,otherGrant,story,asset,project,order,version,contractBefore,submissionBefore,feedbackInput;
  const bytes=Buffer.from('Synthetic private story reference'),merchant={user:producer,party:S.org.party_id},operator={user:reviewer,party:null};
  const projectRead=(extra={})=>call('GET','/production/records/'+project.id,{schema:'ProductionRecordResponse',...extra});
  const projectPath=()=>'/production/projects/'+project.id,storyPath=()=>projectPath()+'/story',attachmentPath=()=>storyPath()+'/attachments/'+asset.id+'/content';
  async function projectCommand(action,body,extra={}){const p=ok(await projectRead(merchant));return call('POST',projectPath()+'/'+action,{body,version:p.object_version,schema:'CustomizationFulfillmentResponse',...extra});}
  async function review(r){return ok(await call('POST','/production/records/'+r.id+'/reviews',{...operator,body:{decision:'APPROVED',reason:'Synthetic independent review',verification:r.kind==='PROJECT'?{contract_sha256:r.data.contract_sha256,identity_verified:true,signatures_verified:true,rights_verified:true}:{script_reviewed:true}},version:r.object_version,schema:'ProductionRecordResponse'}));}
  await sub('ordinary member and invoice-only authority cannot create a company customization request',async()=>{
   assert.equal((await create()).status,403);const invoice=ok(await offer('INVOICES'));ok(await act(invoice,'ACCEPT'));assert.equal((await create()).status,403);
  });
  await sub('offered authority is insufficient; accepted current trade authority creates one author-owned request',async()=>{
   grant=ok(await offer());assert.equal((await create()).status,403);grant=ok(await act(grant,'ACCEPT'));
   await db.execute("UPDATE parties SET current_status='PENDING_REVIEW' WHERE id=?",[org.party_id]);try{assert.equal((await create()).status,403);}finally{await db.execute("UPDATE parties SET current_status='ACTIVE' WHERE id=?",[org.party_id]);}
   story=ok(await create());assert.equal(ok(await create()).id,story.id);assert.equal(story.created_by,delegate.account_id);
  });
  await sub('author uploads and submits private bytes; a second trade delegate and owner cannot read raw request drafts',async()=>{
   otherGrant=ok(await offer('TRADE',colleague));otherGrant=ok(await act(otherGrant,'ACCEPT',colleague));
   for(const user of [owner,colleague])assert.equal((await call('GET','/customization-requests/'+story.id,{user,schema:'CustomizationRequestResponse'})).status,404);
   asset=ok(await call('POST','/customization-requests/'+story.id+'/attachments?display_name=synthetic.txt&media_type=text%2Fplain',{body:bytes,schema:'CustomizationAttachmentResponse'}));
   story=ok(await call('GET','/customization-requests/'+story.id,{schema:'CustomizationRequestResponse'}));
   story=ok(await call('PATCH','/customization-requests/'+story.id,{body:{answers:{...createBody.answers,material:asset.id}},version:story.object_version,schema:'CustomizationRequestResponse'}));
   story=ok(await call('POST','/customization-requests/'+story.id+'/submissions',{body:{},version:story.object_version,schema:'CustomizationRequestResponse'}));
   story=await S.stories.intake(producer.ctx,{request_id:story.id,expected_version:story.object_version,operation_key:key()});
   submissionBefore=story.submission.content_sha256;
  });
  await sub('original company order proceeds to independently reviewed manual project without granting producer powers',async()=>{
   ({order}=await S.newOrder({sourceStory:story,preview:'SCRIPT_BEFORE_INTERIM',commissioner:{...delegate,acting_party_id:org.party_id}}));contractBefore=structuredClone(order.data.contract);
   assert.equal(ok(await call('GET','/trade/records/'+order.id,{schema:'TradeRecordResponse'})).id,order.id);
   project=ok(await call('POST','/production/projects',{...merchant,body:{order_id:order.id,line_id:'film',script_version_id:S.work.id,license_project_id:null,assignee_account_id:producer.account_id,purpose:'PRIVATE',territory:'CN',consent_ids:[],evidence_asset_id:S.proof.id,fulfillment:{uses_identifiable_people:false,cast:[]}},schema:'ProductionRecordResponse'}));project=await review(project);
   await S.pay(order,'first',{...delegate,acting_party_id:org.party_id});ok(await projectCommand('start',{},merchant));
   assert.equal((await projectCommand('assignment',{assignee_account_id:delegate.account_id,reason:'Cannot assign merchant team'})).status,403);
   assert.equal((await call('POST',projectPath()+'/files?media_type=text/plain',{body:bytes,schema:'ProductionRecordResponse'})).status,403);
   assert.equal((await call('POST','/production/records/'+project.id+'/reviews',{body:{decision:'APPROVED',reason:'Cannot self review',verification:null},version:project.object_version,party:null,schema:'ProductionRecordResponse'})).status,403);
  });
  await sub('accepted representatives list and read fulfillment; only original author can read private story via buyer delegation',async()=>{
   assert.equal(ok(await projectRead()).id,project.id);
   assert.ok(ok(await call('GET','/production/projects',{schema:'ProductionListResponse'})).items.some(r=>r.id===project.id));
   assert.equal(ok(await call('GET',projectPath()+'/fulfillment',{user:colleague,schema:'CustomizationFulfillmentResponse'})).order_id,order.id);
   assert.equal(ok(await call('GET',storyPath(),{schema:'ProductionStoryResponse'})).answers.story,createBody.answers.story);
   assert.deepEqual((await call('GET',attachmentPath())).bytes,bytes);
   for(const url of [storyPath(),attachmentPath()])assert.equal((await call('GET',url,{user:colleague,schema:'ProductionStoryResponse'})).status,404);
   // Preserve existing company-owner and assigned-producer access to the contracted submission.
   assert.equal((await call('GET',storyPath(),{user:owner,schema:'ProductionStoryResponse'})).status,200);
   assert.equal((await call('GET',storyPath(),{...merchant,schema:'ProductionStoryResponse'})).status,200);
   assert.equal((await projectRead({party:second.party_id})).status,404);
   assert.equal((await call('GET','/customization-requests/'+story.id,{party:second.party_id,schema:'CustomizationRequestResponse'})).status,404);
  });
  await sub('representative views independent delivery and accepts the same script to unlock contractual interim payment',async()=>{
   const file=ok(await call('POST',projectPath()+'/files?media_type=text/plain',{...merchant,body:Buffer.from('Synthetic delivered script'),schema:'ProductionRecordResponse'}));
   const p=ok(await projectRead(merchant));version=await review(ok(await call('POST',projectPath()+'/versions',{...merchant,body:{stage:'SCRIPT',file_id:file.id,preview_file_id:file.id,note:'Synthetic reviewed script'},version:p.object_version,schema:'ProductionRecordResponse'})));
   assert.equal((await call('GET','/production/versions/'+version.id+'/content?variant=preview')).status,200);
   const flow=ok(await call('GET',projectPath()+'/fulfillment',{schema:'CustomizationFulfillmentResponse'}));
   ok(await call('POST','/operations/notifications/'+flow.receipt.notification_event_id+'/read',{body:{},schema:'OpsReadResponse'}));
   assert.ok(ok(await projectCommand('delivery-receipt',{})).receipt.started_at);
   feedbackInput={body:{decision:'ACCEPT',note:'Synthetic delegated acceptance',checklist:{script_reviewed:true},change_kind:null},version:version.object_version,op:key(),schema:'ProductionRecordResponse'};
   ok(await call('POST','/production/versions/'+version.id+'/feedback',feedbackInput));
   const payment=await S.pay(order,'interim',{...delegate,acting_party_id:org.party_id});assert.equal(payment.data.amount_minor,4000);
  });
  await sub('company project pagination includes delegated orders without opening the other author story',async()=>{
   const other=await S.newOrder({commissioner:{...owner,acting_party_id:org.party_id}});
   const p=ok(await call('POST','/production/projects',{...merchant,body:{order_id:other.order.id,line_id:'film',script_version_id:S.work.id,license_project_id:null,assignee_account_id:producer.account_id,purpose:'PRIVATE',territory:'CN',consent_ids:[],evidence_asset_id:S.proof.id,fulfillment:{uses_identifiable_people:false,cast:[]}},schema:'ProductionRecordResponse'}));
   const first=ok(await call('GET','/production/projects?limit=1',{schema:'ProductionListResponse'}));assert.equal(first.items.length,1);assert.ok(first.next_cursor);
   const next=ok(await call('GET','/production/projects?limit=1&cursor='+encodeURIComponent(first.next_cursor),{schema:'ProductionListResponse'}));assert.deepEqual([first.items[0].id,next.items[0].id].sort(),[p.id,project.id].sort());
   assert.equal((await call('GET','/production/projects/'+p.id+'/story',{schema:'ProductionStoryResponse'})).status,404);
  });
  await sub('revocation during original attachment download blocks bytes; reads, lists and successful write replays recheck current authority',async()=>{
   onRead=async()=>{grant=ok(await act(grant,'REVOKE',owner));};assert.equal((await call('GET',attachmentPath())).status,403);
   for(const url of ['/customization-requests/'+story.id,'/customization-requests/'+story.id+'/attachments/'+asset.id+'/content','/production/records/'+project.id,projectPath()+'/fulfillment','/production/versions/'+version.id+'/content?variant=preview'])assert.equal((await call('GET',url,{schema:'ProductionRecordResponse'})).status,403,url);
   assert.equal((await create()).status,403);assert.equal((await call('POST','/production/versions/'+version.id+'/feedback',feedbackInput)).status,403);
   assert.equal(ok(await call('GET','/production/projects',{schema:'ProductionListResponse'})).items.some(r=>r.id===project.id),false);
   const empty=ok(await call('GET','/production/projects?limit=1',{schema:'ProductionListResponse'}));assert.deepEqual(empty.items,[]);assert.ok(empty.next_cursor);
   const last=ok(await call('GET','/production/projects?limit=1&cursor='+encodeURIComponent(empty.next_cursor),{schema:'ProductionListResponse'}));assert.deepEqual(last.items,[]);assert.equal(last.next_cursor,null);
   assert.equal(ok(await projectRead({user:colleague})).id,project.id);
   assert.deepEqual(ok(await call('GET','/trade/records/'+order.id,{user:owner,schema:'TradeRecordResponse'})).data.contract,contractBefore);
   assert.equal((await S.stories.get(producer.ctx,{request_id:story.id,party_id:null})).submission.content_sha256,submissionBefore);
  });
  await sub('expired grants and changed owner membership block delegates without deleting original records',async()=>{
   await db.execute("UPDATE party_representations SET expires_at='2000-01-01' WHERE id=?",[otherGrant.id]);try{assert.equal((await projectRead({user:colleague})).status,403);}finally{await db.execute('UPDATE party_representations SET expires_at=? WHERE id=?',[future().slice(0,23).replace('T',' '),otherGrant.id]);}
   await db.execute("UPDATE party_memberships SET object_version=object_version+1 WHERE party_id=? AND account_id=?",[org.party_id,owner.account_id]);assert.equal((await projectRead({user:colleague})).status,403);assert.equal((await projectRead({user:owner})).status,200);
  });
  const out=path.resolve(__dirname,'../../../../.local');await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'customization-representative-http.json'),JSON.stringify({cases:fixtures},null,2));await fs.writeFile(path.join(out,'customization-representative-records.json'),JSON.stringify({records,project_id:project?.id,order_id:order?.id,request_id:story?.id,synthetic_prerequisites:['company approval','trade specification/quote and intake repository','payment provider receipts'],frontend:false,real_services:false},null,2));
 }finally{if(server)await new Promise(r=>server.close(r));if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
});
