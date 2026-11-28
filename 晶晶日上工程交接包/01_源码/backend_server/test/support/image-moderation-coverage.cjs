'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{randomUUID:key,createHash}=require('node:crypto');
// Original ACC-DEL-24.02 image obligation: actual private image bytes, real
// database jobs and HTTP review; SDK responses remain explicitly synthetic.
module.exports=async function imageCoverage(t,F){
 const {S,db,dir,ffmpeg,base,cases,records,input,step,publication,mode,calls}=F,{buyer,outsider,reviewer}=S.people;
 const sha=b=>createHash('sha256').update(b).digest('hex'),{run}=require('../../src/modules/media/marking');
 async function api(method,url,who=buyer,body,operation=key(),party=null){
  const res=await fetch(base+'/api/v1'+url,{method,headers:{Authorization:'Bearer '+who.token,...party?{'X-Acting-Party':party}:{},...body!==undefined?{'Content-Type':'application/json','Idempotency-Key':operation}:{}},...body!==undefined?{body:JSON.stringify(body)}:{}}),value=await res.json();
  cases.push({method,path:'/api/v1'+url,schema:res.status===200?'MediaTaskResponse':'ErrorResponse',value});return {status:res.status,...value};
 }
 const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.data;};
 const taskBody=file=>{const b=input(file);delete b.party_id;delete b.operation_key;return b;};
 const images=[];
 for(const [type,name]of [['image/png','image.png'],['image/jpeg','image.jpg']]){
  await run(ffmpeg,['-nostdin','-v','error','-i','silent.mp4','-frames:v','1','-threads','1','-y',name],{cwd:dir});
  const bytes=await fs.readFile(path.join(dir,name));assert(bytes.length>50);images.push({type,bytes});
 }
 const upload=i=>S.assets.upload(buyer.ctx,{party_id:buyer.personal_party_id,purpose:'AVATAR_MATERIAL',media_type:i.type,body:i.bytes,operation_key:key()});
 await t.test('actual PNG and JPEG persist one HTTP moderation task and require independent review for uncertain image results',async()=>{
  for(const image of images){
   mode('clean');const file=await upload(image),operation=key(),body=taskBody(file),task=ok(await api('POST','/media/tasks',buyer,body,operation,buyer.personal_party_id));
   assert.equal(ok(await api('POST','/media/tasks',buyer,body,operation,buyer.personal_party_id)).id,task.id);assert.equal(task.result,null);await assert.rejects(publication(file),{code:'CONTENT_MODERATION_REQUIRED'});
   const before=calls();assert.equal((await step()).outcome.status,'SUCCEEDED');assert.equal(calls(),before+1);const clean=ok(await api('GET','/media/tasks/'+task.id));assert.equal(clean.result.decision,'PASS');assert.equal(clean.result.manual_review,'STILL_REQUIRED');assert.equal(clean.result.file_id,file.id);assert.equal(clean.result.output_sha256,sha(image.bytes));await publication(file);
   assert.equal((await api('GET','/media/tasks/'+task.id,outsider)).status,404);assert.deepEqual((await S.assets.download(buyer.ctx,file.id,buyer.personal_party_id)).body,image.bytes);
   mode('image-review');const reviewFile=await upload(image),reviewTask=ok(await api('POST','/media/tasks',buyer,taskBody(reviewFile),key(),buyer.personal_party_id));assert.equal((await step()).outcome.status,'SUCCEEDED');const pending=ok(await api('GET','/media/tasks/'+reviewTask.id));assert.equal(pending.result.decision,'REVIEW');await assert.rejects(publication(reviewFile),{code:'CONTENT_MODERATION_REQUIRED'});
   const reviewBody={decision:'APPROVE',reason:'Independent synthetic examination of exact private image',result_sha256:pending.result_sha256},reviewKey=key();
   assert.equal((await api('GET','/media/operations/tasks/'+reviewTask.id,outsider)).status,403);assert.equal((await api('POST','/media/operations/tasks/'+reviewTask.id+'/review',buyer,reviewBody)).error.code,'SELF_REVIEW_FORBIDDEN');
   assert.equal(ok(await api('GET','/media/operations/tasks/'+reviewTask.id,reviewer)).result_sha256,pending.result_sha256);
   const approved=ok(await api('POST','/media/operations/tasks/'+reviewTask.id+'/review',reviewer,reviewBody,reviewKey));assert.equal(approved.result.decision,'PASS');assert.equal(approved.result.automated_decision,'REVIEW');assert.equal(approved.result.manual_review.account_id,reviewer.account_id);assert.equal(ok(await api('POST','/media/operations/tasks/'+reviewTask.id+'/review',reviewer,reviewBody,reviewKey)).result_sha256,approved.result_sha256);await publication(reviewFile);
   records.push({image_type:image.type,actual_image_sha256:sha(image.bytes),actual_image_bytes:image.bytes.length,clean_task_id:task.id,clean_file_id:file.id,review_task_id:reviewTask.id,review_file_id:reviewFile.id,automated_decision_preserved:approved.result.automated_decision,independent_reviewer:reviewer.account_id,real_provider_called:false});
  }
 });
 await t.test('image rejection, mismatched SDK identity and missing provider configuration cannot produce approval',async()=>{
  mode('image-high');const file=await upload(images[0]),task=ok(await api('POST','/media/tasks',buyer,taskBody(file),key(),buyer.personal_party_id));assert.equal((await step()).outcome.status,'SUCCEEDED');const rejected=ok(await api('GET','/media/tasks/'+task.id));assert.equal(rejected.result.decision,'REJECT');await assert.rejects(publication(file),{code:'CONTENT_MODERATION_REQUIRED'});
  assert.equal((await api('POST','/media/operations/tasks/'+task.id+'/review',reviewer,{decision:'APPROVE',reason:'Cannot override high-risk result',result_sha256:rejected.result_sha256})).error.code,'MEDIA_REVIEW_NOT_PENDING');
  mode('wrong-data');const wrongFile=await upload(images[1]),wrong=ok(await api('POST','/media/tasks',buyer,taskBody(wrongFile),key(),buyer.personal_party_id));assert.equal((await step()).outcome.status,'BLOCKED');assert.equal(ok(await api('GET','/media/tasks/'+wrong.id)).result,null);await assert.rejects(publication(wrongFile),{code:'CONTENT_MODERATION_REQUIRED'});
  const unconfigured=require('../../src/modules/media/service').createMediaService(db,{resolvePrincipal:S.resolvePrincipal,env:{NODE_ENV:'test',MEDIA_MODERATION_ENABLED:'false'},storageFactory:F.storageFactory});const before=calls();await assert.rejects(unconfigured.create(buyer.ctx,input(wrongFile)),{code:'MODERATION_NOT_ENABLED'});assert.equal(calls(),before);
  records.push({rejected_image_task:task.id,mismatched_image_task:wrong.id,unconfigured_rejected:true,real_provider_called:false});mode('clean');
 });
};
