'use strict';
const {createHash}=require('node:crypto');
const {digest}=require('../governance/content'),{error}=require('../party/policy');
const VERSION='TEXT_SEGMENTS_V1',LIMIT=600,OVERLAP=60;
const sha=s=>createHash('sha256').update(s).digest('hex');
function plan(body){
 const text=new TextDecoder('utf-8',{fatal:true}).decode(body),characters=[...text];
 if(!characters.length)throw error('MODERATION_TEXT_SCOPE_UNSUPPORTED',409);
 if(characters.length<=LIMIT)return null;
 const segments=[];
 for(let start=0;start<characters.length;start+=LIMIT-OVERLAP){
  const end=Math.min(start+LIMIT,characters.length),content=characters.slice(start,end).join('');
  segments.push({start,end,content,sha256:sha(content)});if(end===characters.length)break;
 }
 return {character_count:characters.length,segments};
}
// The checkpoint is private, contains no text, and is bound to the complete immutable source.
// Persist SENT before every external call. An unknown call must never be replayed automatically.
async function execute({plan:p,checkpoint,requestHash,sourceHash,taskId,save,recheck,inspect}){
 let c=checkpoint||{version:VERSION,request_sha256:requestHash,source_sha256:sourceHash,character_count:p.character_count,segment_count:p.segments.length,receipts:[],pending:null};
 if(c.version!==VERSION||c.request_sha256!==requestHash||c.source_sha256!==sourceHash||c.character_count!==p.character_count||c.segment_count!==p.segments.length||!Array.isArray(c.receipts)||c.receipts.length>p.segments.length)throw error('MODERATION_TEXT_CHECKPOINT_MISMATCH',409);
 for(const [index,r]of c.receipts.entries())if(r.index!==index||r.sha256!==p.segments[index].sha256||!['PASS','REVIEW','REJECT'].includes(r.decision)||typeof r.provider_request_id!=='string'||!r.provider_request_id.trim())throw error('MODERATION_TEXT_CHECKPOINT_MISMATCH',409);
 if(c.pending!==null)throw error('MODERATION_TEXT_SUBMISSION_NEEDS_REVIEW',409);
 while(c.receipts.length<p.segments.length&&!c.receipts.some(x=>x.decision==='REJECT')){
  await recheck();const index=c.receipts.length,segment=p.segments[index],dataId=taskId+'.t'+index;
  c={...c,pending:{index,sha256:segment.sha256,data_id:dataId}};await save(c);
  let reply;
  try{reply=await inspect({media_type:'text/plain',body:Buffer.from(segment.content),data_id:dataId});}
  catch(e){
   // The adapter documents these as preflight failures: no external operation has started.
   // All call failures/timeouts remain SENT, even if they look transient.
   if(['PROVIDER_NOT_IMPLEMENTED','PROVIDER_NOT_CONFIGURED','PROVIDER_ENVIRONMENT_NOT_VERIFIED','PROVIDER_NOT_VERIFIED','PROVIDER_CONFIGURATION_CHANGED','VERIFICATION_EVIDENCE_REQUIRED','PROVIDER_STATE_UNAVAILABLE'].includes(e.code)){c={...c,pending:null};await save(c);}
   throw e;
  }
  if(reply.automated!==true||reply.pending||!['PASS','REVIEW','REJECT'].includes(reply.decision)||typeof reply.provider_request_id!=='string'||!reply.provider_request_id.trim())throw error('MODERATION_RESULT_UNKNOWN',503);
  c={...c,receipts:[...c.receipts,{index,sha256:segment.sha256,decision:reply.decision,provider_request_id:reply.provider_request_id}],pending:null};await save(c);
 }
 await recheck();const rejected=c.receipts.some(x=>x.decision==='REJECT'),last=c.receipts.at(-1);
 if(!last)throw error('MODERATION_RESULT_UNKNOWN',503);
 return {automated:true,decision:rejected?'REJECT':'REVIEW',provider_request_id:last.provider_request_id,coverage:{version:VERSION,character_count:p.character_count,segment_limit:LIMIT,overlap_characters:OVERLAP,segment_count:p.segments.length,checked_segments:c.receipts.length,covered_characters:p.segments[c.receipts.length-1].end,complete:c.receipts.length===p.segments.length,requires_full_text_review:true,segment_receipts_sha256:digest(c.receipts)}};
}
module.exports={VERSION,LIMIT,OVERLAP,plan,execute};
