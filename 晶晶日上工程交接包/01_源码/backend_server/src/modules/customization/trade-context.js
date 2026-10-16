 'use strict';
const {id,shape,error}=require('../party/policy');
const {digest}=require('../governance/content');
const one=async(tx,sql,args=[])=>(await tx.execute(sql,args))[0][0];
const parse=x=>typeof x==='string'?JSON.parse(x):x;
const instant=x=>new Date(x.replace(' ','T')+'Z').toISOString();
function source(value){
 shape(value,['request_id','submission_id','content_sha256']);id(value.request_id);id(value.submission_id);
 if(typeof value.content_sha256!=='string'||!/^[a-f0-9]{64}$/.test(value.content_sha256))throw error('INVALID_CUSTOMIZATION_SOURCE',400);
 return {request_id:value.request_id,submission_id:value.submission_id,content_sha256:value.content_sha256};
}
// Internal transaction helper only: callers must authenticate and authorize first.
// Call only after holding the parent story row lock. Never lock a quote from here.
async function assertUnordered(tx,requestId){
 if(await one(tx,'SELECT order_id FROM customization_orders WHERE request_id=? FOR SHARE',[requestId]))throw error('CUSTOMIZATION_ORDER_EXISTS',409);
}
async function current(tx,value,buyer){
 const s=source(value),r=await one(tx,'SELECT * FROM customization_requests WHERE id=? FOR UPDATE',[s.request_id]);
 if(!r||r.party_id!==id(buyer))throw error('CUSTOMIZATION_NOT_FOUND',404);
 await assertUnordered(tx,r.id);
 if(r.current_status!=='INTAKE'||await one(tx,"SELECT id FROM customization_supplements WHERE request_id=? AND current_status='OPEN' FOR SHARE",[r.id]))throw error('CUSTOMIZATION_NOT_QUOTABLE',409);
 const row=await one(tx,'SELECT * FROM customization_submissions WHERE request_id=? AND submission_number=? FOR SHARE',[r.id,r.submission_number]);
 if(!row||row.template_version_id!==r.template_version_id||row.template_sha256!==r.template_sha256||row.submitted_at!==r.submitted_at)throw error('STORED_CONTENT_MISMATCH',503);
 const hash=digest({format:'customization-submission-v1',id:row.id,request_id:row.request_id,template_version_id:row.template_version_id,template_sha256:row.template_sha256,answers_sha256:row.answers_sha256,submitted_by:row.submitted_by,submitted_at:instant(row.submitted_at)});
 if(hash!==row.content_sha256||digest(parse(row.answers_json))!==row.answers_sha256||digest(parse(row.template_snapshot_json))!==row.template_sha256)throw error('STORED_CONTENT_MISMATCH',503);
 if(row.id!==s.submission_id||row.content_sha256!==s.content_sha256)throw error('CUSTOMIZATION_SOURCE_CHANGED',409);
 return r;
}
async function bindOrder(tx,order){
 const s=order.data.quote.customization;if(!s)return;
 await current(tx,s,order.buyer_party_id);
 try{await tx.execute('INSERT INTO customization_orders(request_id,submission_id,quote_id,order_id) VALUES (?,?,?,?)',[s.request_id,s.submission_id,order.parent_id,order.id]);}
 catch(e){if(e.code==='ER_DUP_ENTRY')throw error('CUSTOMIZATION_ORDER_EXISTS',409);throw e;}
}
// Internal reader: caller must already authorize access to the linked production project.
async function orderedSubmission(tx,value,buyer,orderId){
 const v=source(value),r=await one(tx,'SELECT * FROM customization_requests WHERE id=? AND party_id=? FOR SHARE',[v.request_id,buyer]);
 const link=await one(tx,'SELECT order_id FROM customization_orders WHERE request_id=? AND submission_id=? AND order_id=? FOR SHARE',[v.request_id,v.submission_id,orderId]);
 const s=await one(tx,'SELECT * FROM customization_submissions WHERE id=? AND request_id=? FOR SHARE',[v.submission_id,v.request_id]);
 if(!r||!link||!s)throw error('CUSTOMIZATION_NOT_FOUND',404);
 const hash=digest({format:'customization-submission-v1',id:s.id,request_id:s.request_id,template_version_id:s.template_version_id,template_sha256:s.template_sha256,answers_sha256:s.answers_sha256,submitted_by:s.submitted_by,submitted_at:instant(s.submitted_at)});
 if(hash!==s.content_sha256||hash!==v.content_sha256||digest(parse(s.answers_json))!==s.answers_sha256||digest(parse(s.template_snapshot_json))!==s.template_sha256)throw error('STORED_CONTENT_MISMATCH',503);
 return {request_id:r.id,submission_id:s.id,content_sha256:s.content_sha256,template_snapshot:parse(s.template_snapshot_json),answers:parse(s.answers_json)};
}
module.exports={source,current,assertUnordered,bindOrder,orderedSubmission};
