'use strict';

const {shape,id,error}=require('../party/policy');
const A=require('../artists/context'),C=require('./context'),P=require('./policy');
const purposes=['SCHEDULE','COMPLETION'];

// A supplier explicitly attaches a file to one grant. Operators may see only
// those submissions, and every read and subsequent write rechecks restrictions.
function methods({db,actor}){return {
 async supplierGrants(ctx,i){
  shape(i,['party_id','after','limit']);const limit=i.limit??20;P.integer(limit,1,100);if(i.after)id(i.after);
  return db.withTransaction(async tx=>{const a=await actor(tx,ctx);await A.owner(tx,a,i.party_id);
   const rows=(await tx.execute("SELECT g.* FROM redemption_records g JOIN redemption_records s ON s.id=g.parent_id AND s.kind='STOCK' WHERE g.kind='GRANT' AND s.owner_party_id=? AND g.id>? AND JSON_UNQUOTE(JSON_EXTRACT(g.data_json,'$.template.kind')) IN ('EXPOSURE','INTERVIEW') ORDER BY g.id LIMIT ?",[i.party_id,i.after||'',limit+1]))[0].map(C.checked);
   return {items:rows.slice(0,limit).map(r=>({id:r.id,kind:'GRANT',current_status:r.current_status,object_version:r.object_version,title:r.data.template.title,grant_type:r.data.template.kind})),next_cursor:rows.length>limit?rows[limit-1].id:null};
  });
 },
 async submitDeliveryEvidence(ctx,i){
  shape(i,['record_id','party_id','expected_version','asset_id','purpose','operation_key']);id(i.asset_id);if(!purposes.includes(i.purpose))throw error('INVALID_INPUT',400);
  return db.withTransaction(async tx=>{const a=await actor(tx,ctx);await A.owner(tx,a,i.party_id);const r=await C.load(tx,i.record_id,'GRANT'),stock=await C.load(tx,r.parent_id,'STOCK','FOR SHARE');
   if(stock.owner_party_id!==i.party_id)throw error('REDEMPTION_NOT_FOUND',404);
   await A.assets(tx,[i.asset_id],i.party_id,['REVIEW_EVIDENCE','WORK_CONTENT']);
   return C.command(tx,a,'DELIVERY_EVIDENCE_SUBMIT',i,async()=>{A.match(r,i.expected_version);
    if(!['EXPOSURE','INTERVIEW'].includes(r.data.template.kind)||r.current_status!==(i.purpose==='SCHEDULE'?'BOUND':'CONFIRMED'))throw error('REWARD_EVIDENCE_SUBMISSION_NOT_AVAILABLE',409);
    const rows=(await tx.execute("SELECT * FROM redemption_records WHERE kind='DELIVERY_EVIDENCE' AND parent_id=? ORDER BY id FOR SHARE",[r.id]))[0].map(C.checked);
    const existing=rows.find(x=>x.owner_party_id===i.party_id&&x.data.asset_id===i.asset_id&&x.data.purpose===i.purpose);if(existing)return existing;
    if(rows.length>=100)throw error('REWARD_EVIDENCE_LIMIT',409);
    return C.insert(tx,a,'DELIVERY_EVIDENCE',i.party_id,r.id,'SUBMITTED',{asset_id:i.asset_id,purpose:i.purpose});
   });
  });
 },
 async deliveryEvidenceOptions(ctx,i){
  shape(i,['record_id','purpose']);if(!purposes.includes(i.purpose))throw error('INVALID_INPUT',400);
  return db.withTransaction(async tx=>{const a=await actor(tx,ctx),r=await C.load(tx,i.record_id,'GRANT','FOR SHARE');await C.operator(tx,a,'REDEMPTION_REVIEW',r);const stock=await C.load(tx,r.parent_id,'STOCK','FOR SHARE');
   const rows=(await tx.execute("SELECT * FROM redemption_records WHERE kind='DELIVERY_EVIDENCE' AND parent_id=? AND current_status='SUBMITTED' ORDER BY id LIMIT 101",[r.id]))[0].map(C.checked);if(rows.length>100)throw error('REWARD_EVIDENCE_LIMIT',409);
   const items=[];for(const entry of rows){if(entry.owner_party_id!==stock.owner_party_id||entry.data.purpose!==i.purpose)continue;try{await A.assets(tx,[entry.data.asset_id],stock.owner_party_id,['REVIEW_EVIDENCE','WORK_CONTENT']);}catch(e){if(!e.status||e.status>=500)throw e;continue;}
    const file=await A.one(tx,'SELECT id,media_type,byte_size,content_sha256 FROM supply_assets WHERE id=?',[entry.data.asset_id]);items.push({id:file.id,submission_id:entry.id,purpose:entry.data.purpose,media_type:file.media_type,byte_size:file.byte_size,content_sha256:file.content_sha256});
   }return {grant_id:r.id,purpose:i.purpose,items};
  });
 }
};}
module.exports={methods};
