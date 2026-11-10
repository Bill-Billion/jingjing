"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{randomUUID:key}=require('node:crypto');
async function verify({base,db,source,sourceId,buyer,handler,reviewer,outsider,upload}){
 const fixtures=[],grantCode=source==='COMMERCIAL'?'GIG_REVIEW':'AUDITION_SUPPORT';
 async function grant(who,action,enabled=true){const [[row]]=await db.execute('SELECT object_version FROM governance_operator_grants WHERE account_id=? AND action_code=?',[who.account_id,action]);await require('../../src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:who.account_id,action,enabled,expected_version:row?.object_version||0,expires_at:null,authority_ref:'synthetic:message-copy',reason:'Isolated scoped privacy processing'});}
 for(const [u,action] of [[handler,'PRIVACY_HANDLE'],[handler,'PRIVACY_REVIEW'],[reviewer,'PRIVACY_REVIEW']])await grant(u,action);
 async function call(method,url,who,body,version,party=null,operation=key()){
  const res=await fetch(base+url,{method,headers:{Authorization:'Bearer '+who.token,...party?{'X-Acting-Party':party}:{},...body===undefined?{}:{'Content-Type':'application/json','Idempotency-Key':operation},...version===undefined?{}:{'If-Match':'"'+version+'"'}},...body===undefined?{}:{body:JSON.stringify(body)}});
  if(!(res.headers.get('content-type')||'').includes('json'))return {status:res.status,bytes:Buffer.from(await res.arrayBuffer())};
  const value=await res.json();if(url.startsWith('/privacy/'))fixtures.push({method,path:new URL(base+url).pathname,schema:res.status!==200?'ErrorResponse':url.includes('/business-messages')?'PrivacyBusinessMessageDraftResponse':url.endsWith('/history')?'PrivacyHistoryResponse':'PrivacyRequestResponse',value});return {status:res.status,...value};
 }
 const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.data;};
 let request=ok(await call('POST','/privacy/requests',buyer,{type:'COPY',scopes:['TRANSACTIONS'],details:'Synthetic business conversation copy; third party text requires manual review'}));
 const url='/privacy/operations/requests/'+request.id+'/business-messages?'+new URLSearchParams({source,source_id:sourceId,limit:'1'});
 assert.equal((await call('GET',url,handler)).error.code,'PRIVACY_STATE_CONFLICT');
 request=ok(await call('POST','/privacy/operations/requests/'+request.id+'/start',handler,{},request.object_version));
 // The handler must join through the original participant-requested support flow.
 assert.equal((await call('GET',url,handler)).status,403);
 if(source==='COMMERCIAL'){
  const prefix='/gigs/orders/'+sourceId+'/conversation',state=ok(await call('GET',prefix+'/messages',buyer,undefined,undefined,buyer.personal_party_id));
  const r=ok(await call('POST',prefix+'/control',buyer,{action:'REQUEST_SUPPORT',reason:'Synthetic privacy preparation support'},state.object_version,buyer.personal_party_id));
  ok(await call('POST',prefix+'/control',handler,{action:'JOIN',reason:'Synthetic explicitly requested support'},r.object_version));
 }else{
  const booking=ok(await call('GET','/auditions/records/'+sourceId,buyer,undefined,undefined,buyer.personal_party_id));
  const r=ok(await call('POST','/auditions/bookings/'+sourceId+'/support',buyer,{action:'REQUEST'},booking.object_version,buyer.personal_party_id));
  ok(await call('POST','/auditions/bookings/'+sourceId+'/support',handler,{action:'JOIN'},r.object_version));
 }
 let all=[],cursor='',page;do{page=ok(await call('GET',url+(cursor?'&cursor='+cursor:''),handler));all.push(...page.items);cursor=page.next_cursor;}while(cursor);
 assert(all.length>=2);assert.equal(new Set(all.map(m=>m.id)).size,all.length);assert.equal(page.copy_kind,'BUSINESS_MESSAGE_REVIEW_DRAFT');assert.equal(page.third_party_redaction,'REQUIRES_MANUAL_REVIEW');assert.equal(page.original_attachments_included,false);
 for(const m of all)for(const field of ['created_by','account_id','owner_party_id','asset_id','asset','contacts','review','moderation'])assert.equal(Object.hasOwn(m,field),false);
 assert(all.some(m=>m.sender==='APPLICANT'&&m.body));assert(all.some(m=>m.sender==='OTHER'&&m.body));
 assert.equal((await call('GET',url,outsider)).status,403);
 assert.equal((await call('GET',url+'&account_id='+outsider.account_id,handler)).status,400);
 assert.equal((await call('GET',url,handler,undefined,undefined,handler.personal_party_id)).status,400);
 await grant(buyer,'PRIVACY_HANDLE');assert.equal((await call('GET',url,buyer)).error.code,'SELF_REVIEW_FORBIDDEN');
 const other=ok(await call('POST','/privacy/requests',outsider,{type:'COPY',scopes:['ALL'],details:'Synthetic unrelated person'}));
 ok(await call('POST','/privacy/operations/requests/'+other.id+'/start',handler,{},other.object_version));
 assert.equal((await call('GET',url.replace(request.id,other.id),handler)).error.code,'PRIVACY_TARGET_NOT_FOUND');
 const narrow=ok(await call('POST','/privacy/requests',buyer,{type:'COPY',scopes:['PROFILE'],details:'Synthetic profile scope only'}));
 ok(await call('POST','/privacy/operations/requests/'+narrow.id+'/start',handler,{},narrow.object_version));
 assert.equal((await call('GET',url.replace(request.id,narrow.id),handler)).error.code,'PRIVACY_ACTION_SCOPE_MISMATCH');
 assert.equal((await call('GET',url+'&cursor='+key(),handler)).status===200,false);
 await grant(handler,grantCode,false);try{assert.equal((await call('GET',url,handler)).status,403);}finally{await grant(handler,grantCode);}
 await grant(handler,'PRIVACY_HANDLE',false);try{assert.equal((await call('GET',url,handler)).status,403);}finally{await grant(handler,'PRIVACY_HANDLE');}
 const table=source==='COMMERCIAL'?'gig_records':'audition_records',ownMessage=all.find(m=>m.sender==='APPLICANT'&&m.body);
 const [[stored]]=await db.execute('SELECT data_sha256 FROM '+table+' WHERE id=?',[ownMessage.id]);
 try{await db.execute('UPDATE '+table+' SET data_sha256=? WHERE id=?',['0'.repeat(64),ownMessage.id]);assert.equal((await call('GET',url.replace('limit=1','limit=100'),handler)).status,503);}
 finally{await db.execute('UPDATE '+table+' SET data_sha256=? WHERE id=?',[stored.data_sha256,ownMessage.id]);}
 if(source==='COMMERCIAL'){
  const message=all.find(m=>m.sender==='OTHER'&&m.body);
  ok(await call('POST','/gigs/orders/'+sourceId+'/conversation/moderation',handler,{message_id:message.id,reason:'Synthetic hidden message must stay hidden in privacy draft'}));
  const hidden=ok(await call('GET',url.replace('limit=1','limit=100'),handler)).items.find(m=>m.id===message.id);
  assert.equal(hidden.hidden,true);assert.equal(hidden.body,null);assert.equal(hidden.attachment_present,false);
 }
 // Independent review is a real HTTP step. Selection/redaction/JSON creation and
 // upload are isolated operator helpers, not a claim of completed UI delivery.
 const selected=all.filter(m=>m.sender==='APPLICANT').map(m=>({id:m.id,kind:m.kind,at:m.at,body:m.body}));
 const text=JSON.stringify({request_id:request.id,source,source_id:sourceId,coverage:'SELECTED_APPLICANT_MESSAGES_ONLY',messages:selected,omitted:'Counterparty text and originals require separate review'});
 const file=await upload(handler,Buffer.from(text));
 request=ok(await call('POST','/privacy/operations/requests/'+request.id+'/response',handler,{result:{outcome:'INFORMATION_PROVIDED',response:'Synthetic selected applicant messages reviewed; other content still needs handling',evidence_asset_ids:[file.id],retentions:[],remaining_actions:['Counterparty messages, original files and other fields still require review']}},request.object_version));
 const fileUrl='/privacy/requests/'+request.id+'/evidence/'+file.id+'/content';assert.equal((await call('GET',fileUrl,buyer)).status,404);
 const decision={decision:'APPROVED',reason:'Synthetic independent selected content review',proposal_sha256:request.proposal_sha256,evidence_verified:true,third_party_data_redacted:true,remaining_actions_checked:true};
 assert.equal((await call('POST','/privacy/operations/requests/'+request.id+'/review',handler,decision,request.object_version)).error.code,'SELF_REVIEW_FORBIDDEN');
 assert.equal((await call('POST','/privacy/operations/requests/'+request.id+'/review',reviewer,{...decision,third_party_data_redacted:false},request.object_version)).error.code,'MANUAL_VERIFICATION_REQUIRED');
 const op=key(),version=request.object_version;request=ok(await call('POST','/privacy/operations/requests/'+request.id+'/review',reviewer,decision,version,null,op));assert.equal(request.current_status,'FOLLOW_UP');
 assert.equal(ok(await call('POST','/privacy/operations/requests/'+request.id+'/review',reviewer,decision,version,null,op)).id,request.id);
 const delivered=await call('GET',fileUrl,buyer);assert.equal(delivered.status,200);assert.equal(delivered.bytes.toString(),text);assert.equal((await call('GET',fileUrl,outsider)).status,404);
 request=ok(await call('POST','/privacy/requests/'+request.id+'/reopen',buyer,{reason:'Complete remaining messages and originals'},request.object_version));assert.equal((await call('GET',url,handler)).error.code,'PRIVACY_STATE_CONFLICT');assert.equal((await call('GET',fileUrl,buyer)).bytes.toString(),text);
 const [audit]=await db.execute("SELECT message FROM privacy_events WHERE request_id=? AND event_code='COPY_DATA_ACCESSED'",[request.id]);assert.ok(audit.length);assert(audit.every(x=>!x.message.includes(all.find(m=>m.body).body)));
 const out=path.resolve(__dirname,'../../../../..','.local/privacy-business-copy-20261110',source+'.json');await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify({synthetic_only:true,cases:fixtures},null,2));
}
module.exports={verify};
