'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{randomUUID:key}=require('node:crypto');
async function verify({t,base,db,applicant,claimant,handler,reviewer,other,assets,recovery,proof,setDuringRead}){
 const fixtures=[],checks=[];let request,submitted,copyBytes,copyFile;
 async function grant(user,action,enabled=true){const [[r]]=await db.execute('SELECT object_version FROM governance_operator_grants WHERE account_id=? AND action_code=?',[user.account_id,action]);await require('../../src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:user.account_id,action,enabled,expected_version:r?.object_version||0,expires_at:null,authority_ref:'synthetic:recovery-copy',reason:'Isolated same-request recovery copy'});}
 for(const [u,action] of [[handler,'PRIVACY_HANDLE'],[handler,'PRIVACY_REVIEW'],[reviewer,'PRIVACY_HANDLE'],[reviewer,'PRIVACY_REVIEW']])await grant(u,action);
 async function call(method,url,user=applicant,body,version,operation=key(),party){
  const response=await fetch(base+url,{method,headers:{Authorization:'Bearer '+user.token,...party?{'X-Acting-Party':party}:{},...body===undefined?{}:{'Content-Type':'application/json','Idempotency-Key':operation},...version===undefined?{}:{'If-Match':'"'+version+'"'}},...body===undefined?{}:{body:JSON.stringify(body)}});
  if(!(response.headers.get('content-type')||'').includes('json'))return {status:response.status,bytes:Buffer.from(await response.arrayBuffer())};
  const value=await response.json();if(url.startsWith('/privacy/'))fixtures.push({method,path:new URL(base+url).pathname,schema:response.status!==200?'ErrorResponse':url.includes('/account-data?')?'PrivacyAccountCopyPageResponse':url.endsWith('/history')?'PrivacyHistoryResponse':url.endsWith('/copy-options')?'PrivacyCopyOptionsResponse':'PrivacyRequestResponse',value});return {status:response.status,...value};
 }
 const ok=x=>{assert.equal(x.status,200,JSON.stringify(x));return x.data;};
 const create=(who=applicant,scopes=['TRANSACTIONS'])=>call('POST','/privacy/requests',who,{type:'COPY',scopes,details:'Synthetic own recovery history and reviewed copy'}).then(ok);
 const url=(req,operations=false,extra='')=>'/privacy/'+(operations?'operations/':'')+'requests/'+req.id+'/account-data?section=FINANCE_RECOVERIES'+extra;
 const sub=(name,fn)=>t.test(name,async()=>{await fn();checks.push({name,result:'PASS'});});
 await sub('personal debtor and claimant can copy their retained cases, without third-party reasons, reviewer identities or original files',async()=>{
  request=await create();const page=ok(await call('GET',url(request)));assert.equal(page.items.length,3);assert.equal(page.request_completion,'NOT_CONFIRMED');assert.equal(page.original_documents_included,false);
  assert.ok(page.items.every(x=>x.relationship==='RECIPIENT'));const complete=page.items.find(x=>x.id===recovery.id);assert.equal(complete.received_minor,200);assert.equal(complete.unlinked_claim_minor,0);assert.equal(complete.receipts.reduce((n,x)=>n+x.amount_minor,0),200);
  const closed=page.items.find(x=>x.current_status==='CANCELLED');assert.equal(closed.administratively_closed,true);assert.equal(closed.received_minor,0);assert.equal(closed.unlinked_claim_minor,200);assert.match(closed.meaning,/NOT_CURRENT_DEBT/);
  for(const row of page.items)for(const k of ['reason','review','cancellation','created_by','owner_party_id','recipient_party_id','evidence_asset_id','basis','ledger_cursor','ledger_entry_id','object_key'])assert.equal(row[k],undefined);
  const own=await create(claimant);assert.ok(ok(await call('GET',url(own),claimant)).items.every(x=>x.relationship==='CLAIMANT'));
  const unrelated=await create(handler);assert.equal(ok(await call('GET',url(unrelated),handler)).items.length,0);assert.equal((await call('GET',url(unrelated,false,'&cursor='+recovery.id),handler)).status,400);
  const options=ok(await call('GET','/privacy/requests/'+request.id+'/copy-options'));assert.match(options.categories[0].remaining,/追偿案件/);assert.equal(options.categories[0].file_copy_supported,false);
  assert.equal(ok(await call('GET','/privacy/requests/'+request.id)).current_status,'RECEIVED');
 });
 await sub('same request scope and personal identity bind all pages, including operator exports and content integrity',async()=>{
  let cursor='',all=[];do{const data=ok(await call('GET',url(request,false,'&limit=1'+(cursor?'&cursor='+cursor:''))));all.push(...data.items);cursor=data.next_cursor;}while(cursor);assert.equal(all.length,3);assert.equal(new Set(all.map(x=>x.id)).size,3);
  const limited=await create(applicant,['PROFILE']);assert.equal((await call('GET',url(limited))).status,409);assert.equal((await call('GET',url(request),other)).status,404);assert.equal((await call('GET',url(request),applicant,undefined,undefined,key(),applicant.personal_party_id)).status,400);
  assert.equal((await call('GET',url(request,true),handler)).error.code,'PRIVACY_STATE_CONFLICT');request=ok(await call('POST','/privacy/operations/requests/'+request.id+'/start',handler,{},request.object_version));
  const prepared=ok(await call('GET',url(request,true),handler));assert.deepEqual(prepared.items,all);assert.equal((await call('GET',url(request,true),other)).status,403);
  const [[stored]]=await db.execute('SELECT data_sha256 FROM finance_records WHERE id=?',[recovery.id]);try{await db.execute('UPDATE finance_records SET data_sha256=? WHERE id=?',['0'.repeat(64),recovery.id]);assert.equal((await call('GET',url(request))).status,503);}finally{await db.execute('UPDATE finance_records SET data_sha256=? WHERE id=?',[stored.data_sha256,recovery.id]);}
  await grant(handler,'PRIVACY_HANDLE',false);try{assert.equal((await call('GET',url(request,true),handler)).status,403);}finally{await grant(handler,'PRIVACY_HANDLE');}
  // Build only the actual projected records. File generation/upload is an operator helper,
  // not an automatic full export or a claim of UI support.
  copyBytes=Buffer.from(JSON.stringify({request_id:request.id,section:prepared.section,items:prepared.items,original_documents_included:false,remaining:['Original reasons, bank documents and other requested records require review']}));
  copyFile=await assets.upload(handler.ctx,{party_id:handler.personal_party_id,purpose:'REVIEW_EVIDENCE',media_type:'text/plain',body:copyBytes,operation_key:key()});
 });
 await sub('the actual same-request file remains private until independent review and revoked operator cannot preview bytes',async()=>{
  submitted=ok(await call('POST','/privacy/operations/requests/'+request.id+'/response',handler,{result:{outcome:'INFORMATION_PROVIDED',response:'Synthetic own recovery summaries; originals remain separately controlled',evidence_asset_ids:[copyFile.id],retentions:[],remaining_actions:['Original reasons, bank documents and other requested records require review']}},request.object_version));
  const file='/privacy/requests/'+request.id+'/evidence/'+copyFile.id+'/content',preview='/privacy/operations/requests/'+request.id+'/evidence/'+copyFile.id+'/content';assert.equal((await call('GET',file)).status,404);assert.equal((await call('GET',preview,reviewer)).bytes.equals(copyBytes),true);
  setDuringRead(async()=>{setDuringRead(null);await grant(reviewer,'PRIVACY_HANDLE',false);});try{assert.equal((await call('GET',preview,reviewer)).status,403);}finally{setDuringRead(null);await grant(reviewer,'PRIVACY_HANDLE');}
  const decision={decision:'APPROVED',reason:'Synthetic independently checked applicant-only recovery summary',proposal_sha256:submitted.proposal_sha256,evidence_verified:true,third_party_data_redacted:true,remaining_actions_checked:true};
  assert.equal((await call('POST','/privacy/operations/requests/'+request.id+'/review',handler,decision,submitted.object_version)).error.code,'SELF_REVIEW_FORBIDDEN');
  assert.equal((await call('POST','/privacy/operations/requests/'+request.id+'/review',reviewer,{...decision,third_party_data_redacted:false},submitted.object_version)).error.code,'MANUAL_VERIFICATION_REQUIRED');
  const operation=key();request=ok(await call('POST','/privacy/operations/requests/'+request.id+'/review',reviewer,decision,submitted.object_version,operation));assert.equal(request.current_status,'FOLLOW_UP');assert.equal(ok(await call('POST','/privacy/operations/requests/'+request.id+'/review',reviewer,decision,submitted.object_version,operation)).id,request.id);
  assert.equal((await call('GET',file)).bytes.equals(copyBytes),true);assert.equal((await call('GET',file,other)).status,404);
 });
 await sub('copy does not unlock original bank documents; original operator revocation is rechecked during download',async()=>{
  assert.equal((await call('GET','/privacy/requests/'+request.id+'/copies/'+proof.id+'/content?category=TRANSACTIONS')).status,409);
  const raw='/finance/records/'+recovery.data.receipts[0].payout_evidence_id+'/evidence/'+proof.id;assert.equal((await call('GET',raw,reviewer)).status,200);
  setDuringRead(async()=>{setDuringRead(null);await grant(reviewer,'FINANCE_REVIEW',false);});try{assert.equal((await call('GET',raw,reviewer)).status,403);}finally{setDuringRead(null);await grant(reviewer,'FINANCE_REVIEW');}
  const published='/privacy/requests/'+request.id+'/evidence/'+copyFile.id+'/content';assert.equal((await call('GET',published)).bytes.equals(copyBytes),true);
  request=ok(await call('POST','/privacy/requests/'+request.id+'/reopen',applicant,{reason:'Synthetic continue remaining originals and records'},request.object_version));assert.equal((await call('GET',published)).bytes.equals(copyBytes),true);assert.equal(ok(await call('GET','/privacy/requests/'+request.id+'/history')).responses.length,1);
  assert.equal(ok(await call('GET',url(request))).items.length,3);assert.equal((await call('GET',url(request,true),handler)).error.code,'PRIVACY_STATE_CONFLICT');
 });
 const root=path.resolve(__dirname,'../../../../..','.local');await fs.writeFile(path.join(root,'privacy-recovery-copy-http.json'),JSON.stringify({synthetic_only:true,cases:fixtures},null,2));await fs.writeFile(path.join(root,'privacy-recovery-copy-records.json'),JSON.stringify({checks,request_id:request.id,recovery_id:recovery.id,file_id:copyFile.id,final_status:request.current_status,synthetic_only:true,frontend_run:false,real_services:false,limits:['Only personal claimant/recipient summaries; no company case export','Raw reasons, reviewer identities and bank documents excluded from automatic summaries','JSON assembly/upload are operator test helpers; actual proposal, independent review and byte download use HTTP','Published own history remains available when operator roles are revoked']},null,2));
}
module.exports={verify};
