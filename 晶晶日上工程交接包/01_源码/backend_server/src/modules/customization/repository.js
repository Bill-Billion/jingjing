'use strict';
const {randomUUID,createHash}=require('node:crypto');
const {id,ref,shape,version,error}=require('../party/policy');
const {canonical,digest}=require('../governance/content');
const {authorizeOperator}=require('../governance/operator-access');
const P=require('./policy');
const S=require('./supplement-policy');
const one=async(tx,sql,args=[])=>(await tx.execute(sql,args))[0][0];
const parse=value=>typeof value==='string'?JSON.parse(value):value;
const sha=text=>createHash('sha256').update(text,'utf8').digest('hex');
const instant=value=>value===null?null:new Date(value.replace(' ','T')+'Z').toISOString();
const stored=(value,expected)=>{const body=parse(value);if(digest(body)!==expected)throw error('STORED_CONTENT_MISMATCH',503);return body;};

function createCustomizationRepository(db,{resolvePrincipal=async()=>null}={}){
 async function actor(tx,ctx){
  const principal=await resolvePrincipal(ctx);if(!principal)throw error('AUTHENTICATION_REQUIRED',401);
  const a=await one(tx,'SELECT id,current_status FROM identity_accounts WHERE subject_ref=? FOR SHARE',[ref(principal.subject_ref)]);
  if(!a||a.current_status!=='ACTIVE')throw error('ACCOUNT_NOT_ACTIVE');
  return {...a,request_ref:ref(principal.request_id||randomUUID())};
 }
 async function activeParty(tx,partyId){
  const p=await one(tx,'SELECT id,current_status FROM parties WHERE id=? FOR SHARE',[id(partyId)]);
  if(!p||['SUSPENDED','CLOSED'].includes(p.current_status))throw error('PARTY_NOT_ACTIVE');return p;
 }
 async function member(tx,a,partyId){
  await activeParty(tx,partyId);
  const m=await one(tx,'SELECT current_status FROM party_memberships WHERE party_id=? AND account_id=? FOR SHARE',[partyId,a.id]);
  if(!m||m.current_status!=='ACTIVE')throw error('CUSTOMIZATION_FORBIDDEN');
 }
 async function operator(tx,a,action='CUSTOMIZATION_INTAKE'){
  if(!await authorizeOperator(tx,{account_id:a.id,action}))throw error('CUSTOMIZATION_FORBIDDEN');
 }
 async function load(tx,requestId,lock='FOR SHARE'){
  const r=await one(tx,'SELECT * FROM customization_requests WHERE id=? '+lock,[id(requestId)]);
  if(!r)throw error('CUSTOMIZATION_NOT_FOUND',404);return r;
 }
 function creator(a,r,partyId){if(r.created_by!==a.id||r.party_id!==partyId)throw error('CUSTOMIZATION_NOT_FOUND',404);}
 async function visible(tx,a,r,partyId){
  if(partyId){await member(tx,a,partyId);creator(a,r,partyId);}
  else {await operator(tx,a);if(r.current_status==='DRAFT')throw error('CUSTOMIZATION_NOT_FOUND',404);await activeParty(tx,r.party_id);}
 }
 function actions(r,operations=false){
  if(operations)return r.current_status==='SUBMITTED'?['READ','INTAKE']:['READ'];
  return r.current_status==='DRAFT'?['READ','SAVE','SUBMIT']:['READ'];
 }
 function summary(r,operations=false){return {id:r.id,party_id:r.party_id,template_version_id:r.template_version_id,category_title:r.category_title,current_status:r.current_status,object_version:r.object_version,submitted_at:instant(r.submitted_at),intake_at:instant(r.intake_at),allowed_actions:actions(r,operations)};}
 function submissionHash(s){return digest({format:'customization-submission-v1',id:s.id,request_id:s.request_id,template_version_id:s.template_version_id,template_sha256:s.template_sha256,answers_sha256:s.answers_sha256,submitted_by:s.submitted_by,submitted_at:instant(s.submitted_at)});}
 async function detail(tx,r,operations=false){
  const template=stored(r.template_snapshot_json,r.template_sha256);
  let answers,submission=null;
  if(r.submission_number>0){
   const s=await one(tx,'SELECT * FROM customization_submissions WHERE request_id=? AND submission_number=?',[r.id,r.submission_number]);
   if(!s||s.template_version_id!==r.template_version_id||submissionHash(s)!==s.content_sha256)throw error('STORED_CONTENT_MISMATCH',503);
   const snapshot=stored(s.template_snapshot_json,s.template_sha256),submittedAnswers=stored(s.answers_json,s.answers_sha256);
   if(s.template_sha256!==r.template_sha256||instant(s.submitted_at)!==instant(r.submitted_at))throw error('STORED_CONTENT_MISMATCH',503);
   submission={id:s.id,answers:submittedAnswers,template_snapshot:snapshot,content_sha256:s.content_sha256,submitted_by:s.submitted_by,submitted_at:instant(s.submitted_at)};
  }
  // Operations read only the immutable submitted content, never a user's editable draft.
  if(operations){if(!submission)throw error('CUSTOMIZATION_NOT_FOUND',404);answers=submission.answers;}
  else answers=stored(r.answers_json,r.answers_sha256);
  return {id:r.id,created_by:r.created_by,party_id:r.party_id,template_version_id:r.template_version_id,template_snapshot:operations?submission.template_snapshot:template,answers,current_status:r.current_status,object_version:r.object_version,submission,submitted_at:instant(r.submitted_at),intake_at:instant(r.intake_at),intake_by:r.intake_by,allowed_actions:actions(r,operations)};
 }
 async function audit(tx,a,{request_id=null,template_version_id=null,event_code,object_version,content_sha256=null}){
  await tx.execute('INSERT INTO customization_audit(id,request_id,template_version_id,actor_account_id,event_code,object_version,content_sha256,request_ref) VALUES (?,?,?,?,?,?,?,?)',[randomUUID(),request_id,template_version_id,a.id,event_code,object_version,content_sha256,a.request_ref]);
 }
 async function command(tx,a,operation,scope,input,work,replay=async()=>{}){
  const key=digest([a.id,operation,scope,P.operationKey(input.operation_key)]),fingerprint=digest(input);
  try {await tx.execute('INSERT INTO customization_commands(id,actor_account_id,operation_code,fingerprint) VALUES (?,?,?,?)',[key,a.id,operation,fingerprint]);}
  catch(e){
   if(e.code!=='ER_DUP_ENTRY')throw e;
   const old=await one(tx,'SELECT fingerprint,result_json,result_sha256 FROM customization_commands WHERE id=?',[key]);
   if(!old||old.fingerprint!==fingerprint)throw error('IDEMPOTENCY_CONFLICT',409);
   if(old.result_json===null)throw error('IDEMPOTENCY_IN_PROGRESS',409);
   // MEDIUMTEXT preserves the exact serialized result, including large DTOs with two content copies.
   if(sha(old.result_json)!==old.result_sha256)throw error('STORED_CONTENT_MISMATCH',503);
   const result=JSON.parse(old.result_json);await replay(result);return result;
  }
  const result=await work(),json=JSON.stringify(result);
  await tx.execute('UPDATE customization_commands SET result_json=?,result_sha256=? WHERE id=?',[json,sha(json),key]);return result;
 }
 function match(r,expected){if(r.object_version!==version(expected))throw error('VERSION_CONFLICT',412);if(r.object_version>=4294967294)throw error('OBJECT_VERSION_EXHAUSTED',409);}
 function draft(r){if(r.current_status!=='DRAFT')throw error('CUSTOMIZATION_NOT_DRAFT',409);}
 function inputCopy(input,keys){shape(input,keys);try{return JSON.parse(canonical(input));}catch(e){if(e.code&&e.status)throw e;throw error('INVALID_INPUT',400);}}
 function category(r){const template=stored(r.template_snapshot_json,r.template_sha256);return {template_version_id:r.id,category_code:r.category_code,template_version:r.template_version,template_snapshot:template,...P.availability(template)};}

 async function latestSupplement(tx,r){return one(tx,'SELECT * FROM customization_supplements WHERE request_id=? ORDER BY opened_version DESC LIMIT 1',[r.id]);}
 function supplementData(r,s,operations){
  let supplement=null,draft=null;
  if(s){
   const items=stored(s.items_json,s.items_sha256);
   supplement={id:s.id,base_submission_id:s.base_submission_id,items,current_status:s.current_status,requested_by:s.requested_by,requested_at:instant(s.requested_at),response:null};
   if(s.current_status==='OPEN'&&!operations)draft={answers:stored(s.draft_answers_json,s.draft_answers_sha256),responses:stored(s.responses_json,s.responses_sha256)};
   if(s.current_status==='RESPONDED')supplement.response={submission_id:s.response_submission_id,responses:stored(s.responses_json,s.responses_sha256),submitted_at:instant(s.responded_at)};
  }
  const pending=s?.current_status==='OPEN';
  return {request_id:r.id,object_version:r.object_version,supplement,draft,allowed_actions:['READ',...(pending&&!operations?['SAVE_SUPPLEMENT','SUBMIT_SUPPLEMENT']:[]),...(!pending&&operations&&r.current_status==='INTAKE'?['REQUEST_SUPPLEMENT']:[])]};
 }
 function pendingSupplement(r,s){if(r.current_status!=='INTAKE'||!s||s.current_status!=='OPEN')throw error('SUPPLEMENT_NOT_OPEN',409);}
 async function submittedVersion(tx,r,submissionId){
  const s=await one(tx,'SELECT * FROM customization_submissions WHERE id=? AND request_id=?',[id(submissionId),r.id]);
  if(!s)throw error('CUSTOMIZATION_NOT_FOUND',404);
  if(submissionHash(s)!==s.content_sha256)throw error('STORED_CONTENT_MISMATCH',503);
  const supplement=await one(tx,'SELECT * FROM customization_supplements WHERE request_id=? AND response_submission_id=?',[r.id,s.id]);
  return {request_id:r.id,submission_number:s.submission_number,submission:{id:s.id,answers:stored(s.answers_json,s.answers_sha256),template_snapshot:stored(s.template_snapshot_json,s.template_sha256),content_sha256:s.content_sha256,submitted_by:s.submitted_by,submitted_at:instant(s.submitted_at)},supplement_response:supplement?{supplement_id:supplement.id,base_submission_id:supplement.base_submission_id,items:stored(supplement.items_json,supplement.items_sha256),responses:stored(supplement.responses_json,supplement.responses_sha256),requested_by:supplement.requested_by,requested_at:instant(supplement.requested_at)}:null};
 }
 return Object.freeze({
  async quotes(ctx,{request_id,party_id=null,after='',limit=20}){
   id(request_id);if(party_id!==null)id(party_id);P.page({after,limit});
   return db.withTransaction(async tx=>{
    const a=await actor(tx,ctx),r=await load(tx,request_id);await visible(tx,a,r,party_id);
    const [rows]=await tx.execute('SELECT q.*,b.submission_id AS linked_submission_id,o.order_id AS linked_order_id FROM customization_quotes b JOIN trade_records q ON q.id=b.quote_id LEFT JOIN customization_orders o ON o.quote_id=q.id WHERE b.request_id=? AND q.id>? ORDER BY q.id LIMIT ?',[r.id,after,limit+1]);
    const latest=r.submission_number?await one(tx,'SELECT id FROM customization_submissions WHERE request_id=? AND submission_number=?',[r.id,r.submission_number]):null;
    return {items:rows.slice(0,limit).map(q=>{const data=stored(q.data_json,q.data_sha256),s=data.customization;if(!s||s.request_id!==r.id||s.submission_id!==q.linked_submission_id)throw error('STORED_CONTENT_MISMATCH',503);return {id:q.id,submission_id:s.submission_id,source_content_sha256:s.content_sha256,source_is_current:s.submission_id===latest?.id,current_status:q.current_status,object_version:q.object_version,content_sha256:q.data_sha256,order_id:q.linked_order_id||null};}),next_cursor:rows.length>limit?rows[limit-1].id:null};
   });
  },
  async getSupplement(ctx,{request_id,party_id=null}){
   id(request_id);if(party_id!==null)id(party_id);
   return db.withTransaction(async tx=>{const a=await actor(tx,ctx),r=await load(tx,request_id);await visible(tx,a,r,party_id);return supplementData(r,await latestSupplement(tx,r),party_id===null);});
  },
  async requestSupplement(ctx,input){
   const i=inputCopy(input,['request_id','items','expected_version','operation_key']);id(i.request_id);version(i.expected_version);P.operationKey(i.operation_key);
   return db.withTransaction(async tx=>{
    const a=await actor(tx,ctx);await operator(tx,a);const r=await load(tx,i.request_id,'FOR UPDATE');await visible(tx,a,r,null);
    return command(tx,a,'SUPPLEMENT_REQUEST',r.id,i,async()=>{
     match(r,i.expected_version);await require('./trade-context').assertUnordered(tx,r.id);if(r.current_status!=='INTAKE'||(await latestSupplement(tx,r))?.current_status==='OPEN')throw error('SUPPLEMENT_NOT_REQUESTABLE',409);
     const current=await detail(tx,r,true),items=S.items(current.template_snapshot,i.items),empty={};
     await tx.execute('INSERT INTO customization_supplements(id,request_id,base_submission_id,opened_version,items_json,items_sha256,draft_answers_json,draft_answers_sha256,responses_json,responses_sha256,requested_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[randomUUID(),r.id,current.submission.id,r.object_version+1,JSON.stringify(items),digest(items),JSON.stringify(current.answers),digest(current.answers),JSON.stringify(empty),digest(empty),a.id]);
     await tx.execute('UPDATE customization_requests SET object_version=object_version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=?',[r.id]);
     await audit(tx,a,{request_id:r.id,event_code:'SUPPLEMENT_REQUESTED',object_version:r.object_version+1,content_sha256:digest(items)});
     const updated=await load(tx,r.id);return supplementData(updated,await latestSupplement(tx,updated),true);
    });
   });
  },
  async saveSupplement(ctx,input){
   const i=inputCopy(input,['request_id','party_id','answers','responses','expected_version','operation_key']);id(i.request_id);id(i.party_id);version(i.expected_version);P.operationKey(i.operation_key);
   return db.withTransaction(async tx=>{
    const a=await actor(tx,ctx);await member(tx,a,i.party_id);const r=await load(tx,i.request_id,'FOR UPDATE');creator(a,r,i.party_id);
    return command(tx,a,'SUPPLEMENT_SAVE',r.id,i,async()=>{
     match(r,i.expected_version);const s=await latestSupplement(tx,r);pendingSupplement(r,s);
     const answers=P.normalizeAnswers(stored(r.template_snapshot_json,r.template_sha256),i.answers),responses=S.responses(stored(s.items_json,s.items_sha256),i.responses);
     await tx.execute('UPDATE customization_supplements SET draft_answers_json=?,draft_answers_sha256=?,responses_json=?,responses_sha256=? WHERE id=?',[JSON.stringify(answers),digest(answers),JSON.stringify(responses),digest(responses),s.id]);
     await tx.execute('UPDATE customization_requests SET object_version=object_version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=?',[r.id]);
     await audit(tx,a,{request_id:r.id,event_code:'SUPPLEMENT_DRAFT_SAVED',object_version:r.object_version+1,content_sha256:digest([digest(answers),digest(responses)])});
     const updated=await load(tx,r.id);return supplementData(updated,await latestSupplement(tx,updated),false);
    });
   });
  },
  async submitSupplement(ctx,input){
   const i=inputCopy(input,['request_id','party_id','expected_version','operation_key']);id(i.request_id);id(i.party_id);version(i.expected_version);P.operationKey(i.operation_key);
   return db.withTransaction(async tx=>{
    const a=await actor(tx,ctx);await member(tx,a,i.party_id);const r=await load(tx,i.request_id,'FOR UPDATE');creator(a,r,i.party_id);
    return command(tx,a,'SUPPLEMENT_SUBMIT',r.id,i,async()=>{
     match(r,i.expected_version);const pending=await latestSupplement(tx,r);pendingSupplement(r,pending);
     const previous=await detail(tx,r,true);if(pending.base_submission_id!==previous.submission.id)throw error('SUPPLEMENT_BASE_CHANGED',409);
     const template=stored(r.template_snapshot_json,r.template_sha256),answers=P.validateSubmission(template,stored(pending.draft_answers_json,pending.draft_answers_sha256));
     S.responses(stored(pending.items_json,pending.items_sha256),stored(pending.responses_json,pending.responses_sha256),{submit:true});
     const time=(await one(tx,'SELECT CURRENT_TIMESTAMP(3) AS now')).now;
     const s={id:randomUUID(),request_id:r.id,template_version_id:r.template_version_id,template_sha256:r.template_sha256,answers_sha256:digest(answers),submitted_by:a.id,submitted_at:time},hash=submissionHash(s);
     await tx.execute('INSERT INTO customization_submissions(id,request_id,submission_number,template_version_id,template_snapshot_json,template_sha256,answers_json,answers_sha256,content_sha256,submitted_by,submitted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[s.id,r.id,r.submission_number+1,r.template_version_id,JSON.stringify(template),s.template_sha256,JSON.stringify(answers),s.answers_sha256,hash,a.id,time]);
     await tx.execute("UPDATE customization_supplements SET current_status='RESPONDED',response_submission_id=?,responded_at=? WHERE id=?",[s.id,time,pending.id]);
     await tx.execute("UPDATE customization_requests SET current_status='SUBMITTED',answers_json=?,answers_sha256=?,submission_number=submission_number+1,submitted_at=?,intake_at=NULL,intake_by=NULL,object_version=object_version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=?",[JSON.stringify(answers),s.answers_sha256,time,r.id]);
     await audit(tx,a,{request_id:r.id,event_code:'SUPPLEMENT_SUBMITTED',object_version:r.object_version+1,content_sha256:hash});return detail(tx,await load(tx,r.id));
    });
   });
  },
  async submissionHistory(ctx,{request_id,party_id=null,after='',limit=20}){
   id(request_id);if(party_id!==null)id(party_id);P.page({after,limit});
   return db.withTransaction(async tx=>{
    const a=await actor(tx,ctx),r=await load(tx,request_id);await visible(tx,a,r,party_id);let number=0;
    if(after){const s=await one(tx,'SELECT submission_number FROM customization_submissions WHERE id=? AND request_id=?',[after,r.id]);if(!s)throw error('INVALID_CURSOR',400);number=s.submission_number;}
    const [rows]=await tx.execute('SELECT * FROM customization_submissions WHERE request_id=? AND submission_number>? ORDER BY submission_number LIMIT ?',[r.id,number,limit+1]);
    return {items:rows.slice(0,limit).map(s=>{if(submissionHash(s)!==s.content_sha256)throw error('STORED_CONTENT_MISMATCH',503);return {id:s.id,submission_number:s.submission_number,submitted_by:s.submitted_by,submitted_at:instant(s.submitted_at),content_sha256:s.content_sha256};}),next_cursor:rows.length>limit?rows[limit-1].id:null};
   });
  },
  async getSubmission(ctx,{request_id,submission_id,party_id=null}){
   id(request_id);id(submission_id);if(party_id!==null)id(party_id);
   return db.withTransaction(async tx=>{const a=await actor(tx,ctx),r=await load(tx,request_id);await visible(tx,a,r,party_id);return submittedVersion(tx,r,submission_id);});
  },

  async categories(ctx){return db.withTransaction(async tx=>{
   await actor(tx,ctx);
   const [rows]=await tx.execute('SELECT t.* FROM customization_templates t WHERE NOT EXISTS (SELECT 1 FROM customization_templates n WHERE n.category_code=t.category_code AND n.template_version>t.template_version) ORDER BY t.category_code');
   return {items:rows.map(category)};
  });},

  // Maintenance-only API: there is intentionally no public template-publishing HTTP route.
  async publishTemplate(ctx,input){
   const i=inputCopy(input,['category_code','template_version','template_snapshot','source_ref','operation_key']);
   P.categoryCode(i.category_code);P.templateVersion(i.template_version);P.sourceRef(i.source_ref);P.operationKey(i.operation_key);i.template_snapshot=P.normalizeTemplate(i.template_snapshot);
   return db.withTransaction(async tx=>{
    const a=await actor(tx,ctx);await operator(tx,a,'CUSTOMIZATION_TEMPLATE_PUBLISH');
    return command(tx,a,'TEMPLATE_PUBLISH',i.category_code,i,async()=>{
     const templateId=randomUUID(),hash=digest(i.template_snapshot);
     try {await tx.execute('INSERT INTO customization_templates(id,category_code,template_version,template_snapshot_json,template_sha256,source_ref,published_by) VALUES (?,?,?,?,?,?,?)',[templateId,i.category_code,i.template_version,JSON.stringify(i.template_snapshot),hash,i.source_ref,a.id]);}
     catch(e){if(e.code==='ER_DUP_ENTRY')throw error('CUSTOMIZATION_TEMPLATE_VERSION_EXISTS',409);throw e;}
     await audit(tx,a,{template_version_id:templateId,event_code:'TEMPLATE_PUBLISHED',object_version:1,content_sha256:hash});
     return category(await one(tx,'SELECT * FROM customization_templates WHERE id=?',[templateId]));
    });
   });
  },

  async create(ctx,input){
   const i=inputCopy(input,['party_id','template_version_id','answers','operation_key']);id(i.party_id);id(i.template_version_id);P.operationKey(i.operation_key);
   return db.withTransaction(async tx=>{
    const a=await actor(tx,ctx);await member(tx,a,i.party_id);
    return command(tx,a,'REQUEST_CREATE',i.party_id,i,async()=>{
     const t=await one(tx,'SELECT * FROM customization_templates WHERE id=? FOR SHARE',[i.template_version_id]);if(!t)throw error('CUSTOMIZATION_TEMPLATE_NOT_FOUND',404);
     const template=stored(t.template_snapshot_json,t.template_sha256),answers=P.normalizeAnswers(template,i.answers),requestId=randomUUID();
     await tx.execute('INSERT INTO customization_requests(id,created_by,party_id,template_version_id,category_title,template_snapshot_json,template_sha256,answers_json,answers_sha256) VALUES (?,?,?,?,?,?,?,?,?)',[requestId,a.id,i.party_id,t.id,template.title,JSON.stringify(template),t.template_sha256,JSON.stringify(answers),digest(answers)]);
     await audit(tx,a,{request_id:requestId,event_code:'REQUEST_CREATED',object_version:1,content_sha256:digest(answers)});
     return detail(tx,await load(tx,requestId));
    },async result=>{const current=await load(tx,result.id);creator(a,current,i.party_id);});
   });
  },

  async get(ctx,{request_id,party_id=null}){
   id(request_id);if(party_id!==null)id(party_id);
   return db.withTransaction(async tx=>{const a=await actor(tx,ctx);if(party_id)await member(tx,a,party_id);else await operator(tx,a);const r=await load(tx,request_id);await visible(tx,a,r,party_id);return detail(tx,r,party_id===null);});
  },

  async list(ctx,{party_id,after='',limit=20,current_status=null}){
   id(party_id);const p=P.page({after,limit,current_status});
   return db.withTransaction(async tx=>{
    const a=await actor(tx,ctx);await member(tx,a,party_id);
    const [rows]=await tx.execute('SELECT id,party_id,template_version_id,category_title,current_status,object_version,submitted_at,intake_at FROM customization_requests WHERE party_id=? AND created_by=? AND id>? '+(p.current_status?'AND current_status=? ':'')+'ORDER BY id LIMIT ?',[party_id,a.id,p.after,...(p.current_status?[p.current_status]:[]),p.limit+1]);
    return {items:rows.slice(0,p.limit).map(r=>summary(r)),next_cursor:rows.length>p.limit?rows[p.limit-1].id:null};
   });
  },

  async save(ctx,input){
   const i=inputCopy(input,['party_id','request_id','answers','expected_version','operation_key']);id(i.party_id);id(i.request_id);version(i.expected_version);P.operationKey(i.operation_key);
   return db.withTransaction(async tx=>{
    const a=await actor(tx,ctx);await member(tx,a,i.party_id);const r=await load(tx,i.request_id,'FOR UPDATE');creator(a,r,i.party_id);
    return command(tx,a,'REQUEST_SAVE',r.id,i,async()=>{
     match(r,i.expected_version);draft(r);const template=stored(r.template_snapshot_json,r.template_sha256),answers=P.normalizeAnswers(template,i.answers),hash=digest(answers);
     await tx.execute('UPDATE customization_requests SET answers_json=?,answers_sha256=?,object_version=object_version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=?',[JSON.stringify(answers),hash,r.id]);
     await audit(tx,a,{request_id:r.id,event_code:'REQUEST_SAVED',object_version:r.object_version+1,content_sha256:hash});return detail(tx,await load(tx,r.id));
    });
   });
  },

  async submit(ctx,input){
   const i=inputCopy(input,['party_id','request_id','expected_version','operation_key']);id(i.party_id);id(i.request_id);version(i.expected_version);P.operationKey(i.operation_key);
   return db.withTransaction(async tx=>{
    const a=await actor(tx,ctx);await member(tx,a,i.party_id);const r=await load(tx,i.request_id,'FOR UPDATE');creator(a,r,i.party_id);
    return command(tx,a,'REQUEST_SUBMIT',r.id,i,async()=>{
     match(r,i.expected_version);draft(r);
     const template=stored(r.template_snapshot_json,r.template_sha256),answers=P.validateSubmission(template,stored(r.answers_json,r.answers_sha256)),time=(await one(tx,'SELECT CURRENT_TIMESTAMP(3) AS now')).now;
     const s={id:randomUUID(),request_id:r.id,template_version_id:r.template_version_id,template_sha256:r.template_sha256,answers_sha256:digest(answers),submitted_by:a.id,submitted_at:time},hash=submissionHash(s);
     await tx.execute('INSERT INTO customization_submissions(id,request_id,submission_number,template_version_id,template_snapshot_json,template_sha256,answers_json,answers_sha256,content_sha256,submitted_by,submitted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[s.id,r.id,r.submission_number+1,r.template_version_id,JSON.stringify(template),s.template_sha256,JSON.stringify(answers),s.answers_sha256,hash,a.id,time]);
     await tx.execute("UPDATE customization_requests SET current_status='SUBMITTED',submission_number=submission_number+1,submitted_at=?,object_version=object_version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=?",[time,r.id]);
     await audit(tx,a,{request_id:r.id,event_code:'REQUEST_SUBMITTED',object_version:r.object_version+1,content_sha256:hash});return detail(tx,await load(tx,r.id));
    });
   });
  },

  async inbox(ctx,{after='',limit=20,current_status=null}={}){
   const p=P.page({after,limit,current_status},{operations:true});
   return db.withTransaction(async tx=>{
    const a=await actor(tx,ctx);await operator(tx,a);
    const [rows]=await tx.execute("SELECT r.id,r.party_id,r.template_version_id,r.category_title,r.current_status,r.object_version,r.submitted_at,r.intake_at FROM customization_requests r JOIN parties p ON p.id=r.party_id WHERE r.current_status IN ('SUBMITTED','INTAKE') AND p.current_status NOT IN ('SUSPENDED','CLOSED') AND r.id>? "+(p.current_status?'AND r.current_status=? ':'')+'ORDER BY r.id LIMIT ?',[p.after,...(p.current_status?[p.current_status]:[]),p.limit+1]);
    return {items:rows.slice(0,p.limit).map(r=>summary(r,true)),next_cursor:rows.length>p.limit?rows[p.limit-1].id:null};
   });
  },

  async intake(ctx,input){
   const i=inputCopy(input,['request_id','expected_version','operation_key']);id(i.request_id);version(i.expected_version);P.operationKey(i.operation_key);
   return db.withTransaction(async tx=>{
    const a=await actor(tx,ctx);await operator(tx,a);const r=await load(tx,i.request_id,'FOR UPDATE');if(r.current_status==='DRAFT')throw error('CUSTOMIZATION_NOT_FOUND',404);await activeParty(tx,r.party_id);
    return command(tx,a,'REQUEST_INTAKE',r.id,i,async()=>{
     match(r,i.expected_version);if(r.current_status!=='SUBMITTED')throw error('CUSTOMIZATION_ALREADY_INTAKE',409);
     const current=await detail(tx,r,true);
     await tx.execute("UPDATE customization_requests SET current_status='INTAKE',intake_by=?,intake_at=CURRENT_TIMESTAMP(3),object_version=object_version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=?",[a.id,r.id]);
     await audit(tx,a,{request_id:r.id,event_code:'INTAKE_STARTED',object_version:r.object_version+1,content_sha256:current.submission.content_sha256});return detail(tx,await load(tx,r.id),true);
    });
   });
  }
 });
}
module.exports={createCustomizationRepository};
