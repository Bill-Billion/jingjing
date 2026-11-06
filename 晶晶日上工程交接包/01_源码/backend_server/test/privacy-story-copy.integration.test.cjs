'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes,createHash}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
test('personal story copies keep drafts, formal history and private bytes separate',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 for(const [k,v] of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name=`jx_test_${process.pid}_${randomBytes(6).toString('hex')}`,control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
  const S=await require('./support/customization-delivery.cjs').seed(db),{buyer,outsider,producer}=S.people,stories=S.stories;
  const repo=require('../src/modules/privacy/repository').createPrivacyRepository(db,{resolvePrincipal:S.resolvePrincipal});
  const request=await repo.create(buyer.ctx,{request:{type:'COPY',scopes:['PRIVATE_STORY'],details:'Synthetic story archive'},operation_key:key()});
  const restricted=await repo.create(buyer.ctx,{request:{type:'COPY',scopes:['PROFILE'],details:'Synthetic profile only'},operation_key:key()});
  const deletion=await repo.create(buyer.ctx,{request:{type:'DELETE',scopes:['PRIVATE_STORY'],details:'Synthetic delete only'},operation_key:key()});
  const orgRequest=await repo.create(producer.ctx,{request:{type:'COPY',scopes:['PRIVATE_STORY'],details:'Synthetic own request not organization authority'},operation_key:key()});
  const template=await stories.publishTemplate(producer.ctx,{category_code:'synthetic_story_copy',template_version:1,template_snapshot:{title:'Synthetic story',description:'Isolated only',fields:[{key:'story',label:'Story',type:'TEXT',required:true,max_length:1000},{key:'attachment',label:'Private attachment',type:'PRIVATE_ATTACHMENT',required:false}]},source_ref:'synthetic:story-copy',operation_key:key()});
  const create=who=>stories.create(who.ctx,{party_id:who.acting_party_id,template_version_id:template.template_version_id,answers:{story:'Draft one'},operation_key:key()});
  let story=await create(buyer);const foreign=await create(outsider),organization=await create(producer),otherOwn=await create(buyer);
  const files=require('../src/modules/customization/attachments').service(stories,S.storageFactory());
  const upload=(r,who,text)=>files.upload(who.ctx,{request_id:r.id,party_id:who.acting_party_id,display_name:'synthetic.txt',media_type:'text/plain',body:Buffer.from(text),operation_key:key()});
  const first=await upload(story,buyer,'synthetic original'),foreignFile=await upload(foreign,outsider,'synthetic other'),orgFile=await upload(organization,producer,'synthetic institution');
  let afterRead=null;const storageFactory=()=>({...S.storageFactory(),async getBuffer(k){const data=await S.storageFactory().getBuffer(k);if(afterRead)await afterRead();return data;}});
  server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${server.address().port}/api/v1/privacy/requests/`,fixtures=[];
  async function page(section,{who=buyer,req=request,record=story,query='',party=null}={}){const suffix=`/stories/${record.id}/data`,r=await fetch(base+req.id+suffix+'?section='+section+query,{headers:{Authorization:'Bearer '+who.token,...party?{'X-Acting-Party':party}:{}}}),value=await r.json();fixtures.push({method:'GET',path:'/api/v1/privacy/requests/'+req.id+suffix,schema:r.status===200?'PrivacyStoryCopyPageResponse':'ErrorResponse',value});return {status:r.status,cache:r.headers.get('cache-control'),...value};}
  const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.cache,'no-store');return r.data;};
  const download=(asset,who=buyer,req=request)=>fetch(base+req.id+'/copies/'+asset.id+'/content?category=PRIVATE_STORY',{headers:{Authorization:'Bearer '+who.token}});
  await t.test('draft owner sees attachment metadata without exposing it to operations',async()=>{
   assert.equal(ok(await page('SUBMISSIONS')).items.length,0);const p=ok(await page('ATTACHMENTS'));assert.equal(p.items[0].id,first.id);assert.equal(p.request_completion,'NOT_CONFIRMED');assert.equal(p.items[0].object_key,undefined);
   await assert.rejects(stories.get(producer.ctx,{request_id:story.id}),e=>e.code==='CUSTOMIZATION_NOT_FOUND');
   assert.equal((await page('ATTACHMENTS',{who:producer})).status,404);
  });
  story=await stories.save(buyer.ctx,{request_id:story.id,party_id:buyer.personal_party_id,answers:{story:'Formal one',attachment:first.id},expected_version:story.object_version,operation_key:key()});
  story=await stories.submit(buyer.ctx,{request_id:story.id,party_id:buyer.personal_party_id,expected_version:story.object_version,operation_key:key()});
  story=await stories.intake(producer.ctx,{request_id:story.id,expected_version:story.object_version,operation_key:key()});
  const open=()=>stories.requestSupplement(producer.ctx,{request_id:story.id,items:[{field_key:'story',reason:'Synthetic clarification',instruction:'Add details'}],expected_version:story.object_version,operation_key:key()});
  let supplement=await open();const second=await upload(story,buyer,'synthetic replacement');
  supplement=await stories.saveSupplement(buyer.ctx,{request_id:story.id,party_id:buyer.personal_party_id,answers:{story:'Draft two',attachment:second.id},responses:{story:'Synthetic reply'},expected_version:supplement.object_version,operation_key:key()});
  await t.test('unsubmitted correction is copied separately; operations still see formal one',async()=>{
   const history=ok(await page('SUBMISSIONS'));assert.equal(history.items[0].answers.story,'Formal one');
   const p=ok(await page('SUPPLEMENTS'));assert.equal(p.items[0].draft_answers.story,'Draft two');assert.equal(p.items[0].response_submission_id,null);assert.equal(p.items[0].requested_by,undefined);
   assert.equal((await stories.get(producer.ctx,{request_id:story.id})).answers.story,'Formal one');
   await assert.rejects(stories.attachment(producer.ctx,{request_id:story.id,asset_id:second.id}),e=>e.code==='CUSTOMIZATION_ATTACHMENT_NOT_FOUND');
  });
  story=await stories.submitSupplement(buyer.ctx,{request_id:story.id,party_id:buyer.personal_party_id,expected_version:supplement.object_version,operation_key:key()});
  story=await stories.intake(producer.ctx,{request_id:story.id,expected_version:story.object_version,operation_key:key()});
  supplement=await open();supplement=await stories.saveSupplement(buyer.ctx,{request_id:story.id,party_id:buyer.personal_party_id,answers:{story:'Private third draft',attachment:second.id},responses:{story:'Third reply'},expected_version:supplement.object_version,operation_key:key()});
  await t.test('all formal versions and supplement rounds paginate independently and keep original content',async()=>{
   for(const section of ['SUBMISSIONS','SUPPLEMENTS','ATTACHMENTS']){let cursor='',rows=[];do{const p=ok(await page(section,{query:'&limit=1'+(cursor?'&cursor='+cursor:'')}));rows.push(...p.items);cursor=p.next_cursor;}while(cursor);assert.equal(rows.length,2);assert.equal(new Set(rows.map(x=>x.id)).size,2);
    if(section==='SUBMISSIONS'){assert.deepEqual(rows.map(x=>x.submission_number),[1,2]);assert.deepEqual(rows.map(x=>x.answers.story),['Formal one','Draft two']);assert.deepEqual(rows.map(x=>x.answers.attachment),[first.id,second.id]);}
    if(section==='SUPPLEMENTS'){assert.equal(rows[0].current_status,'RESPONDED');assert.equal(rows[0].draft_answers,null);assert.equal(rows[1].current_status,'OPEN');assert.equal(rows[1].draft_answers.story,'Private third draft');}
   }
  });
  await t.test('other people, institution-owned stories, scope and cursor misuse cannot export',async()=>{
   for(const opts of [{who:outsider},{record:foreign},{who:producer,req:orgRequest,record:organization}])assert.equal((await page('ATTACHMENTS',opts)).status,404);
   assert.equal((await page('SUBMISSIONS',{req:restricted})).status,409);assert.equal((await page('SUBMISSIONS',{req:deletion})).status,409);
   assert.equal((await page('SUBMISSIONS',{party:buyer.personal_party_id})).status,400);
   assert.equal((await page('ATTACHMENTS',{record:otherOwn,query:'&cursor='+first.id})).error.code,'INVALID_CURSOR');
   for(const section of ['unknown','__proto__'])assert.equal((await page(section)).status,400);
   assert.equal((await page('SUBMISSIONS',{query:'&limit=101'})).status,400);
   for(const [asset,who,req] of [[foreignFile,buyer,request],[orgFile,producer,orgRequest]])assert.equal((await download(asset,who,req)).status,404);
   assert.equal((await download(first,buyer,restricted)).status,409);
  });
  await t.test('stored snapshot corruption is rejected rather than becoming trusted export',async()=>{
   const [[s]]=await db.execute('SELECT id,answers_sha256 FROM customization_submissions WHERE request_id=? AND submission_number=1',[story.id]);
   try{await db.execute('UPDATE customization_submissions SET answers_sha256=? WHERE id=?',['0'.repeat(64),s.id]);assert.equal((await page('SUBMISSIONS')).status,503);}finally{await db.execute('UPDATE customization_submissions SET answers_sha256=? WHERE id=?',[s.answers_sha256,s.id]);}
  });
  await t.test('both historical and current attachment bytes match; corrupt storage fails',async()=>{
   for(const file of [first,second]){const r=await download(file);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex'),file.content_sha256);}
   const k=[...S.files.keys()].find(k=>k.endsWith('/'+first.id)),original=S.files.get(k);try{S.files.set(k,Buffer.from('broken'));assert.equal((await download(first)).status,503);}finally{S.files.set(k,original);}
  });
  await t.test('revoked file during transport is not returned; copy never completes request',async()=>{
   afterRead=()=>db.execute("UPDATE customization_attachments SET current_status='REVOKED' WHERE id=?",[first.id]);
   try{assert.equal((await download(first)).status,409);}finally{afterRead=null;await db.execute("UPDATE customization_attachments SET current_status='READY' WHERE id=?",[first.id]);}
   assert.equal((await repo.read(buyer.ctx,{request_id:request.id})).current_status,'RECEIVED');
  });
  const out=path.resolve(__dirname,'../../../..','.local/prelaunch-story-copy-20261106/http.json');await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify({synthetic_only:true,cases:fixtures},null,2));
 }finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
});
