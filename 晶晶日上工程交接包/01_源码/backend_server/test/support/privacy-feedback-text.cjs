'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{randomUUID:key}=require('node:crypto');
// Operator assembly is deliberately manual. Original source access is a separate
// production permission, not a new request-bound raw-data export permission.
async function verify({t,db,base,S,applicant,other,handler,reviewer,grant,request,feedback,priorFile,priorBytes}){
 const fixtures=[],checks=[],originals=[];let rejectedFile,releasedFile,bytes;
 async function call(method,url,user=applicant,body,version,op=key()){
  const r=await fetch(base+url,{method,headers:{Authorization:'Bearer '+user.token,...(body===undefined?{}:{'Content-Type':'application/json','Idempotency-Key':op}),...(version===undefined?{}:{'If-Match':'"'+version+'"'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(!r.headers.get('content-type')?.includes('json'))return {status:r.status,bytes:Buffer.from(await r.arrayBuffer())};
  const value=await r.json(),schema=!r.ok?'ErrorResponse':url.startsWith('/production/')?'ProductionRecordResponse':url.includes('/account-data?')?'PrivacyAccountCopyPageResponse':url.endsWith('/history')?'PrivacyHistoryResponse':'PrivacyRequestResponse';
  fixtures.push({method,path:new URL(base+url).pathname,schema,value});return {status:r.status,...value};
 }
 const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.data;},sub=(name,fn)=>t.test(name,async()=>{await fn();checks.push({name,result:'PASS'});});
 const prefix='/privacy/operations/requests/'+request.id,download=f=>'/privacy/requests/'+request.id+'/evidence/'+f.id+'/content';
 const upload=body=>S.assets.upload(handler.ctx,{party_id:handler.personal_party_id,purpose:'REVIEW_EVIDENCE',media_type:'text/plain',body,operation_key:key()});
 const result=f=>({result:{outcome:'INFORMATION_PROVIDED',response:'Synthetic manually selected and redacted own feedback text',evidence_asset_ids:[f.id],retentions:[],remaining_actions:['Other personal records and controlled originals remain individually reviewable']}});
 const decision=()=>({decision:'APPROVED',reason:'Synthetic independent comparison of own source and redacted file',proposal_sha256:request.proposal_sha256,evidence_verified:true,third_party_data_redacted:true,remaining_actions_checked:true});
 await sub('same reopened request locates only authored feedback and privacy permission does not confer original source access',async()=>{
  request=ok(await call('POST',prefix+'/start',handler,{},request.object_version));
  const page=ok(await call('GET',prefix+'/account-data?section=PRODUCTION_FEEDBACK',handler));assert.deepEqual(page.items,feedback);
  await grant(handler,'PRODUCTION_REVIEW',false);
  assert.equal((await call('GET','/production/records/'+feedback[0].feedback_id,handler)).error.code,'PRODUCTION_REVIEW_FORBIDDEN');
  assert.equal((await call('GET','/production/records/'+feedback[0].feedback_id,applicant)).status,403);
  await grant(handler,'PRODUCTION_REVIEW');
  for(const row of page.items){const record=ok(await call('GET','/production/records/'+row.feedback_id,handler));assert.equal(record.kind,'FEEDBACK');assert.equal(record.created_by,applicant.account_id);assert.equal(record.project_id,row.project_id);assert.ok(record.data.note.includes('THIRD_PARTY_PLACEHOLDER'));originals.push(record);}
  assert.equal(originals.length,2);assert.deepEqual(page.items.map(x=>x.stage).sort(),['ROUGH_CUT','SCRIPT']);
 });
 await sub('corrupt original is not trusted and revoked source access is checked again',async()=>{
  const original=originals[0];await db.execute('UPDATE production_records SET data_sha256=? WHERE id=?',['0'.repeat(64),original.id]);
  try{assert.equal((await call('GET','/production/records/'+original.id,handler)).status,503);}finally{await db.execute('UPDATE production_records SET data_sha256=? WHERE id=?',[original.content_sha256,original.id]);}
  await grant(handler,'PRODUCTION_REVIEW',false);assert.equal((await call('GET','/production/records/'+original.id,handler)).status,403);await grant(handler,'PRODUCTION_REVIEW');
 });
 await sub('unreviewed text cannot be downloaded and rejected draft never enters released history',async()=>{
  // Synthetic placeholder deliberately remains in this first draft for the reviewer to reject.
  rejectedFile=await upload(Buffer.from(JSON.stringify({request_id:request.id,items:originals.map(r=>({feedback_id:r.id,note:r.data.note}))})));
  request=ok(await call('POST',prefix+'/response',handler,result(rejectedFile),request.object_version));
  assert.equal((await call('GET',download(rejectedFile))).status,404);
  assert.equal((await call('POST',prefix+'/review',handler,decision(),request.object_version)).error.code,'SELF_REVIEW_FORBIDDEN');
  assert.equal((await call('POST',prefix+'/review',reviewer,{...decision(),third_party_data_redacted:false},request.object_version)).error.code,'MANUAL_VERIFICATION_REQUIRED');
  request=ok(await call('POST',prefix+'/review',reviewer,{...decision(),decision:'REJECTED',reason:'Synthetic third-party placeholder must be removed'},request.object_version));
  assert.equal(request.current_status,'PROCESSING');assert.equal((await call('GET',download(rejectedFile))).status,404);assert.equal(ok(await call('GET','/privacy/requests/'+request.id+'/history')).responses.length,1);
 });
 await sub('revised selected text is independently released once and never includes other signers or company receipt',async()=>{
  const selected=originals.map(r=>({feedback_id:r.id,version_id:r.data.version_id,note:r.data.note.replace('THIRD_PARTY_PLACEHOLDER','[redacted]')}));
  bytes=Buffer.from(JSON.stringify({request_id:request.id,items:selected,history_complete:false,original_documents_included:false,redaction_method:'MANUAL_SELECTION_AND_REVIEW',remaining:['Other records and controlled originals remain separately reviewable']}));
  assert.ok(!bytes.includes('THIRD_PARTY_PLACEHOLDER'));for(const field of ['acceptance_receipt','buyer_party_id','created_by','answers','contract'])assert.ok(!bytes.includes('"'+field+'"'));
  releasedFile=await upload(bytes);const payload=result(releasedFile),version=request.object_version,op=key();
  request=ok(await call('POST',prefix+'/response',handler,payload,version,op));assert.deepEqual(ok(await call('POST',prefix+'/response',handler,payload,version,op)),request);
  assert.equal((await call('GET',download(releasedFile))).status,404);assert.deepEqual((await call('GET',prefix+'/evidence/'+releasedFile.id+'/content',reviewer)).bytes,bytes);
  const review=decision(),reviewVersion=request.object_version,reviewOp=key();request=ok(await call('POST',prefix+'/review',reviewer,review,reviewVersion,reviewOp));assert.deepEqual(ok(await call('POST',prefix+'/review',reviewer,review,reviewVersion,reviewOp)),request);
  assert.equal(request.current_status,'FOLLOW_UP');assert.deepEqual((await call('GET',download(releasedFile))).bytes,bytes);assert.equal((await call('GET',download(releasedFile),other)).status,404);
  const history=ok(await call('GET','/privacy/requests/'+request.id+'/history'));assert.equal(history.responses.length,2);assert.ok(history.responses.every(r=>!r.result.evidence_asset_ids.includes(rejectedFile.id)));
 });
 await sub('later source revocation and reopening preserve only the independently released historical files',async()=>{
  await grant(handler,'PRODUCTION_REVIEW',false);assert.equal((await call('GET','/production/records/'+originals[0].id,handler)).status,403);
  request=ok(await call('POST','/privacy/requests/'+request.id+'/reopen',applicant,{reason:'Synthetic request remaining personal records'},request.object_version));assert.equal(request.current_status,'REOPENED');
  assert.deepEqual((await call('GET',download(priorFile))).bytes,priorBytes);assert.deepEqual((await call('GET',download(releasedFile))).bytes,bytes);assert.equal((await call('GET',download(rejectedFile))).status,404);
  assert.equal(ok(await call('GET','/privacy/requests/'+request.id+'/history')).responses.length,2);
 });
 const root=path.resolve(__dirname,'../../../../..','.local');await fs.writeFile(path.join(root,'privacy-feedback-text-http.json'),JSON.stringify({synthetic_only:true,cases:fixtures},null,2));await fs.writeFile(path.join(root,'privacy-feedback-text-records.json'),JSON.stringify({checks,request_id:request.id,feedback_ids:originals.map(r=>r.id),prior_file_id:priorFile.id,rejected_file_id:rejectedFile.id,released_file_id:releasedFile.id,final_status:request.current_status,approved_response_count:2,synthetic_only:true,frontend_run:false,real_services:false,limitations:['Manual selection joins request summary and separately authorized original read; no new request-bound source authorization','Redaction is manual and independently asserted, not automatic content detection','Only two own feedback notes, not complete personal data or company originals','Company membership already removed; original access remains denied to applicant']},null,2));
 return request;
}
module.exports={verify};
