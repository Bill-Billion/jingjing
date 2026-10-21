'use strict';
const {shape,id,label,error}=require('../party/policy');
const A=require('../artists/context'),C=require('./context'),P=require('./policy'),Points=require('./points');
async function issue(tx,a,stock,party,source){
 const at=await A.now(tx),t=stock.data.template;
 if(stock.current_status!=='AVAILABLE'||t.available_until<=at||stock.data.issued>=t.capacity)throw error('REWARD_STOCK_UNAVAILABLE',409);
 await C.save(tx,a,stock,'AVAILABLE',{...stock.data,issued:stock.data.issued+1},'REDEMPTION_STOCK_ISSUED');
 return C.insert(tx,a,'GRANT',party,stock.id,'AVAILABLE',{template:t,template_sha256:require('../governance/content').digest(t),source,issued_at:at,expires_at:new Date(Date.parse(at)+t.valid_days*P.DAY).toISOString(),hold_id:null,binding:null,delivery:null,extension_used:false,performance_rights_granted:false,cashable:false,transferable:false},source);
}
async function stockEvidence(tx,r){
 await A.assets(tx,r.data.evidence_asset_ids,r.owner_party_id,['REVIEW_EVIDENCE','RIGHTS_EVIDENCE']);
 // Production templates publish only against actual reviewed products; historical orders remain unchanged.
 if(['PRODUCTION_CREDIT','PRODUCTION_FREE','SERVICE_CREDIT'].includes(r.data.template.kind))for(const key of r.data.template.production.spec_ids){
  const raw=await A.one(tx,"SELECT * FROM trade_records WHERE id=? AND kind='SPEC' FOR SHARE",[key]);
  if(!raw)throw error('REWARD_SPEC_NOT_AVAILABLE',409);
  const d=A.parse(raw.data_json);if(require('../governance/content').digest(d)!==raw.data_sha256)throw error('STORED_CONTENT_MISMATCH',503);
  if(r.data.template.kind==='PRODUCTION_FREE'&&d.unit_minor!==r.data.template.production.face_minor)throw error('FREE_PRODUCT_PRICE_MISMATCH',409);
  if(raw.current_status!=='PUBLISHED'||raw.merchant_party_id!==r.owner_party_id||d.product_profile?.type!=='PRIVATE_CUSTOMIZATION')throw error('REWARD_SPEC_NOT_AVAILABLE',409);
 }
}
function createRedemptionRepository(db,{resolvePrincipal=async()=>null}={}){
 const actor=A.createActor(resolvePrincipal);
 const api={
  async createStock(ctx,i){
   shape(i,['party_id','template','evidence_asset_ids','operation_key']);const template=P.template(i.template);
   return db.withTransaction(async tx=>{const a=await actor(tx,ctx);await A.owner(tx,a,i.party_id);await C.operator(tx,a,'REDEMPTION_REVIEW');
    if(!Array.isArray(i.evidence_asset_ids)||!i.evidence_asset_ids.length||i.evidence_asset_ids.length>10||template.available_until<=await A.now(tx))throw error('REWARD_EVIDENCE_REQUIRED',400);
    await A.assets(tx,i.evidence_asset_ids,i.party_id,['REVIEW_EVIDENCE','RIGHTS_EVIDENCE']);
    return C.command(tx,a,'STOCK_CREATE',i,()=>C.insert(tx,a,'STOCK',i.party_id,null,'IN_REVIEW',{template,evidence_asset_ids:i.evidence_asset_ids,issued:0}));});
  },
  async reviewStock(ctx,i){
   shape(i,['record_id','expected_version','decision','reason','operation_key']);label(i.reason,2000);
   if(!['APPROVE','REJECT','RETIRE'].includes(i.decision))throw error('INVALID_REVIEW',400);
   return db.withTransaction(async tx=>{const a=await actor(tx,ctx),r=await C.load(tx,i.record_id,'STOCK');await C.operator(tx,a,'REDEMPTION_REVIEW',r);
    return C.command(tx,a,'STOCK_REVIEW',i,async()=>{A.match(r,i.expected_version);
     if(i.decision==='RETIRE'?r.current_status!=='AVAILABLE':r.current_status!=='IN_REVIEW')throw error('REVIEW_NOT_PENDING',409);
     if(i.decision==='APPROVE'){await stockEvidence(tx,r);if(r.data.template.available_until<=await A.now(tx))throw error('REWARD_STOCK_UNAVAILABLE',409);}
     return C.save(tx,a,r,{APPROVE:'AVAILABLE',REJECT:'REJECTED',RETIRE:'RETIRED'}[i.decision],{...r.data,review:{by:a.id,reason:i.reason}},'REDEMPTION_STOCK_REVIEWED');});});
  },
  async evidence(ctx,i){
   shape(i,['record_id','asset_id']);return db.withTransaction(async tx=>{const a=await actor(tx,ctx),r=await C.load(tx,i.record_id,null,'FOR SHARE');
    const finance=r.kind==='POOL'&&await require('../governance/operator-access').authorizeOperator(tx,{account_id:a.id,action:'FINANCE_REVIEW'});await C.operator(tx,a,finance?'FINANCE_REVIEW':'REDEMPTION_REVIEW',r);
    let keys=[],party=r.owner_party_id;
    if(['STOCK','POOL'].includes(r.kind))keys=[...r.data.evidence_asset_ids,...Object.values(r.data.reviews||{}).map(v=>v.evidence_asset_id)];
    else if(['SCHEDULE','GRANT','REMEDY'].includes(r.kind)){
     const g=r.kind==='GRANT'?r:await C.load(tx,r.parent_id,'GRANT','FOR SHARE'),stock=await C.load(tx,g.parent_id,'STOCK','FOR SHARE');party=stock.owner_party_id;keys=[r.data.evidence_asset_id,r.data.delivery?.evidence_asset_id,r.data.resolution?.evidence_asset_id].filter(Boolean);
    }
    if(!keys.includes(id(i.asset_id)))throw error('REWARD_EVIDENCE_NOT_FOUND',404);
    await A.assets(tx,[i.asset_id],party,['REVIEW_EVIDENCE','RIGHTS_EVIDENCE','WORK_CONTENT']);return A.one(tx,'SELECT * FROM supply_assets WHERE id=?',[i.asset_id]);
   });
  },
  async catalog(ctx){return db.withTransaction(async tx=>{await actor(tx,ctx);const at=await A.now(tx);return {items:(await tx.execute("SELECT * FROM redemption_records WHERE kind='STOCK' AND current_status='AVAILABLE' AND (JSON_TYPE(JSON_EXTRACT(data_json,'$.template.exchange_points')) <> 'NULL' OR JSON_UNQUOTE(JSON_EXTRACT(data_json,'$.template.kind'))='SERVICE_CREDIT') ORDER BY id LIMIT 201",[]))[0].map(C.checked).filter(r=>r.data.template.available_until>at&&(r.data.template.exchange_points!==null||r.data.template.kind==='SERVICE_CREDIT')).slice(0,200).map(r=>({id:r.id,object_version:r.object_version,template:r.data.template,template_sha256:require('../governance/content').digest(r.data.template),remaining:Math.max(0,r.data.template.capacity-r.data.issued)}))};});},
  async exchange(ctx,i){
   shape(i,['party_id','stock_id','template_sha256','operation_key']);
   return db.withTransaction(async tx=>{const a=await actor(tx,ctx);await C.owner(tx,a,i.party_id,true);
    const stock=await C.load(tx,i.stock_id,'STOCK');return C.command(tx,a,'EXCHANGE',i,async()=>{
     if(require('../governance/content').digest(stock.data.template)!==i.template_sha256||stock.data.template.exchange_points===null)throw error('REWARD_EXCHANGE_NOT_AVAILABLE',409);
     const grant=await issue(tx,a,stock,i.party_id,['EXCHANGE',a.id,i.operation_key]);
     const hold_id=await Points.spend(tx,ctx,grant,stock.data.template.exchange_points);
     return C.save(tx,a,grant,'AVAILABLE',{...grant.data,hold_id},'REWARD_EXCHANGED');});});
  },
  async myGrants(ctx,i){return db.withTransaction(async tx=>{const a=await actor(tx,ctx);await A.owner(tx,a,i.party_id);const at=await A.now(tx);return {items:(await C.rows(tx,i.party_id,'GRANT')).map(r=>P.view(r,at))};});},
  async grant(ctx,i){return db.withTransaction(async tx=>{const a=await actor(tx,ctx);await A.owner(tx,a,i.party_id);const r=await C.load(tx,i.record_id,'GRANT','FOR SHARE');if(r.owner_party_id!==i.party_id)throw error('REDEMPTION_NOT_FOUND',404);return P.view(r,await A.now(tx));});},
  async queue(ctx,i){return db.withTransaction(async tx=>{const a=await actor(tx,ctx);await C.operator(tx,a,'REDEMPTION_REVIEW');if(!['STOCK','GRANT','SCHEDULE','REMEDY','COUPON_HOLD','POOL','DRAW'].includes(i.kind))throw error('INVALID_LIST',400);const limit=i.limit??20;P.integer(limit,1,100);if(i.after)id(i.after);const rows=(await tx.execute('SELECT * FROM redemption_records WHERE kind=? AND id>? ORDER BY id LIMIT ?',[i.kind,i.after||'',limit+1]))[0].map(C.checked);return {items:rows.slice(0,limit),next_cursor:rows.length>limit?rows[limit-1].id:null};});}
 };
 Object.assign(api,require('./fulfillment').methods({db,actor}),require('./checkout').methods({db,actor}),require('./lottery').methods({db,actor}),require('./service-credit').methods({db,actor}));return api;
}
module.exports={createRedemptionRepository,issue,stockEvidence};
