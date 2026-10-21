"use strict";
const {id,shape,label,error}=require('../party/policy'),{digest}=require('../governance/content');
const C=require('./checks'),P=require('./participation-policy'),S=require('./participation-state');
function methods(H){const {db,actor,owner,operator,access,insert,save,mutate,audit}=H;
 return {
 async reopenParticipationProject(ctx,i){shape(i,['record_id','party_id','expected_version','reason','evidence_asset_id','operation_key']);label(i.reason,4000);
  return mutate(ctx,i,'REOPEN_PROJECT',async(tx,a,p,r)=>{await owner(tx,a,i.party_id);if(r.kind!=='PROJECT'||p.owner_party_id!==i.party_id)throw error('PROJECT_PARTY_FORBIDDEN');},async(tx,a,p)=>{if(!['PREPARING','STARTED'].includes(p.current_status)||!p.data.current_plan_id)throw error('PROJECT_PLAN_REQUIRED',409);await C.evidence(tx,i.evidence_asset_id,p.owner_party_id);
   const [attempts]=await tx.execute("SELECT * FROM project_records WHERE project_id=? AND kind='RELEASE' FOR UPDATE",[p.id]);
   if(attempts.some(r=>r.current_status==='EXTERNAL_SUBMITTED'))throw error('PROJECT_RELEASE_RESULT_PENDING',409);
   for(const row of attempts){if(['INTERNAL_PENDING','READY_TO_SUBMIT'].includes(row.current_status)){const r=C.dto(row);await save(tx,a,r,'CHANGES_REQUESTED',r.data,'PROJECT_REVISION_REQUIRES_NEW_RELEASE');}}
   return save(tx,a,p,'PREPARING',{...p.data,current_plan_id:null,current_edition_id:null,revision:{previous_plan_id:p.data.current_plan_id,previous_edition_id:p.data.current_edition_id,reason:i.reason,evidence_asset_id:i.evidence_asset_id}},'PROJECT_REOPENED_FOR_NEW_CONFIRMATIONS');});
 },
 async participationProgress(ctx,{record_id,party_id}){return db.withTransaction(async tx=>{const a=await actor(tx,ctx),r=await C.load(tx,record_id,'PARTICIPATION','FOR SHARE'),p=await C.load(tx,r.project_id,'PROJECT','FOR SHARE');await access(tx,a,p,r,party_id);const link=await C.one(tx,'SELECT order_id FROM project_participation_orders WHERE agreement_id=?',[r.id]),[rows]=await tx.execute('SELECT installment_key,account_id,evidence_asset_id,reason FROM project_participation_milestones WHERE agreement_id=? ORDER BY installment_key',[r.id]);return {agreement_id:r.id,order_id:link?.order_id||null,milestones:rows};});},
 async participation(ctx,i){
  shape(i,['record_id','party_id','expected_version','cast','terms','rule_id','evidence_asset_id','operation_key']);const cast=P.cast(i.cast);
  return mutate(ctx,i,'PARTICIPATION',async(tx,a,p,c)=>{await owner(tx,a,i.party_id);if(c.kind!=='CANDIDATE'||c.owner_party_id!==i.party_id)throw error('PROJECT_PARTY_FORBIDDEN');},async(tx,a,p,c)=>{
   if(p.current_status!=='PREPARING'||c.current_status!=='CONFIRMED')throw error('PARTICIPATION_CAST_NOT_CONFIRMED',409);
   const terms=P.terms(i.terms,c.data.amount_minor);
   const [priorPaid]=await tx.execute("SELECT r.id FROM project_records r JOIN project_participation_orders o ON o.agreement_id=r.id JOIN trade_records t ON t.id=o.order_id JOIN project_records c ON c.id=JSON_UNQUOTE(JSON_EXTRACT(r.data_json,'$.candidate_id')) WHERE r.project_id=? AND r.kind='PARTICIPATION' AND r.current_status='APPROVED' AND c.current_status='WITHDRAWN' AND JSON_UNQUOTE(JSON_EXTRACT(r.data_json,'$.role_id'))=? AND CAST(JSON_EXTRACT(t.data_json,'$.financial.received_minor') AS UNSIGNED)>0 FOR SHARE",[p.id,c.data.role_id]);if(priorPaid.length)throw error('PARTICIPATION_AMENDMENT_REVIEW_REQUIRED',409);
   const [existing]=await tx.execute("SELECT id FROM project_records WHERE project_id=? AND kind='PARTICIPATION' AND current_status NOT IN ('REJECTED','WITHDRAWN','SUPERSEDED') AND JSON_UNQUOTE(JSON_EXTRACT(data_json,'$.candidate_id'))=? FOR UPDATE",[p.id,c.id]);
   if(existing.length)throw error('PARTICIPATION_ALREADY_EXISTS',409);
   const finance=c.data.amount_minor?await require('../settlement/marketplace-context').snapshot(tx,{rule_id:i.rule_id,supplier_party_id:c.owner_party_id,relation_id:null}):null;
   if(finance&&(finance.allocation.product_type!=='COMMERCIAL'||finance.allocation.platform_bps!==2200))throw error('PARTICIPATION_COMMISSION_MISMATCH',409);
   if(!finance&&i.rule_id!==null)throw error('PARTICIPATION_RULE_NOT_REQUIRED',400);
   const signers=[...new Set([p.owner_party_id,c.owner_party_id,...(finance?require('../settlement/marketplace-policy').participants(finance.allocation).map(x=>x.party_id):[]),...(terms.revenue?.shares||[]).map(x=>x.party_id)])].map(party_id=>({party_id,responsibility:'Confirm negotiated participation and any channel-income allocation',after_party_ids:[]}));
   for(const s of signers)await C.active(tx,s.party_id);
   const data={candidate_id:c.id,candidate_sha256:c.content_sha256,role_id:c.data.role_id,avatar_id:c.data.avatar_id,consent_id:c.data.consent_id,cast,terms,marketplace_finance:finance,fee_minor:c.data.amount_minor,evidence_asset_id:id(i.evidence_asset_id),confirmers:signers,review:null,order_id:null,variant_snapshot:null};
   const result=await S.usable(tx,p,{kind:'PARTICIPATION',project_id:p.id,owner_party_id:c.owner_party_id,current_status:'IN_REVIEW',data});data.variant_snapshot=result.variants;data.potential_conflict_ids=await S.conflicts(tx,p,data);
   return insert(tx,a,'PARTICIPATION',p.id,c.owner_party_id,'IN_REVIEW',data);
  });
 },
 async reviewParticipation(ctx,i){shape(i,['record_id','expected_version','decision','reason','verification','operation_key']);label(i.reason,4000);shape(i.verification,['identity_verified','rights_verified','exclusivity_reviewed','terms_verified','evidence_verified']);if(!['APPROVED','REJECTED'].includes(i.decision))throw error('INVALID_REVIEW',400);
  return mutate(ctx,i,'PARTICIPATION_REVIEW',(tx,a,p,r)=>operator(tx,a,p,r,true),async(tx,a,p,r)=>{if(r.kind!=='PARTICIPATION'||r.current_status!=='IN_REVIEW')throw error('PARTICIPATION_REVIEW_NOT_PENDING',409);if(i.decision==='APPROVED'){if(r.data.amendment)await require('./participation-amendment').unchanged(tx,r);if(Object.values(i.verification).some(x=>x!==true)||Object.keys(i.verification).length!==5)throw error('MANUAL_VERIFICATION_REQUIRED',409);await S.usable(tx,p,r);if(digest(await S.conflicts(tx,p,r.data,r.id))!==digest(r.data.potential_conflict_ids))throw error('PARTICIPATION_CONFLICT_CHECK_CHANGED',409);}
   return save(tx,a,r,i.decision,{...r.data,review:{reviewer_account_id:a.id,decision:i.decision,reason:i.reason,verification:i.verification}},'PARTICIPATION_REVIEWED');});
 },
 async confirmParticipation(ctx,i){shape(i,['record_id','party_id','expected_version','content_sha256','decision','reason','operation_key']);label(i.reason,4000);if(!['APPROVED','REJECTED'].includes(i.decision))throw error('INVALID_CONFIRMATION',400);
  return mutate(ctx,i,'PARTICIPATION_CONFIRM',async(tx,a,p,r)=>{await owner(tx,a,i.party_id);if(r.kind!=='PARTICIPATION'||!r.data.confirmers.some(x=>x.party_id===i.party_id))throw error('CONFIRMER_NOT_AUTHORIZED');},async(tx,a,p,r)=>{
   if(r.current_status!=='APPROVED'||r.content_sha256!==i.content_sha256)throw error('CONFIRMATION_VERSION_MISMATCH',409);await S.usable(tx,p,r);
   if(await C.one(tx,'SELECT party_id FROM project_confirmations WHERE record_id=? AND party_id=?',[r.id,i.party_id]))throw error('ALREADY_CONFIRMED',409);
   await tx.execute('INSERT INTO project_confirmations(record_id,party_id,account_id,content_sha256,decision,reason) VALUES (?,?,?,?,?,?)',[r.id,i.party_id,a.id,r.content_sha256,i.decision,i.reason]);await audit(tx,a,r,'PARTICIPATION_'+i.decision);return r;
  });
 },
 async participationMilestone(ctx,i){shape(i,['record_id','party_id','expected_version','installment_key','evidence_asset_id','reason','operation_key']);label(i.reason,4000);
  return mutate(ctx,i,'PARTICIPATION_MILESTONE',async(tx,a,p,r)=>{await owner(tx,a,i.party_id);if(p.owner_party_id!==i.party_id)throw error('PROJECT_PARTY_FORBIDDEN');},async(tx,a,p,r)=>{
   await S.usable(tx,p,r,{confirmed:true});if(!require('./participation-amendment').steps(r).installments.some(x=>x.key===i.installment_key))throw error('INSTALLMENT_NOT_FOUND',404);await C.evidence(tx,i.evidence_asset_id,p.owner_party_id);
   if(!await C.one(tx,'SELECT order_id FROM project_participation_orders WHERE agreement_id=?',[r.id]))throw error('PARTICIPATION_ORDER_REQUIRED',409);
   if(await C.one(tx,'SELECT account_id FROM project_participation_milestones WHERE agreement_id=? AND installment_key=?',[r.id,i.installment_key]))throw error('ALREADY_CONFIRMED',409);
   await tx.execute('INSERT INTO project_participation_milestones(agreement_id,installment_key,account_id,evidence_asset_id,reason) VALUES (?,?,?,?,?)',[r.id,i.installment_key,a.id,i.evidence_asset_id,i.reason]);await audit(tx,a,r,'PARTICIPATION_MILESTONE_CONFIRMED');return r;
  });
 },
 async withdrawParticipation(ctx,i){shape(i,['record_id','party_id','expected_version','reason','operation_key']);label(i.reason,4000);
  return mutate(ctx,i,'PARTICIPATION_WITHDRAW',async(tx,a,p,r)=>{await owner(tx,a,i.party_id);if(r.kind!=='PARTICIPATION'||![r.owner_party_id,p.owner_party_id].includes(i.party_id))throw error('PROJECT_PARTY_FORBIDDEN');},async(tx,a,p,r)=>{
   const linked=await C.one(tx,'SELECT order_id FROM project_participation_orders WHERE agreement_id=?',[r.id]);if(linked){const order=C.checked(await C.one(tx,"SELECT * FROM trade_records WHERE id=? AND kind='ORDER' FOR SHARE",[linked.order_id]));if(!['CANCELLED','REFUNDED'].includes(order.current_status))throw error('PARTICIPATION_AMENDMENT_REVIEW_REQUIRED',409);}if(p.data.current_plan_id)throw error('PARTICIPATION_AMENDMENT_REVIEW_REQUIRED',409);
   if(!['IN_REVIEW','APPROVED'].includes(r.current_status))throw error('PARTICIPATION_NOT_AVAILABLE',409);
   return save(tx,a,r,'WITHDRAWN',{...r.data,withdrawal_reason:i.reason},'PARTICIPATION_WITHDRAWN');});
 }
 };}
module.exports={methods};
