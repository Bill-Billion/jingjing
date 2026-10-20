'use strict';
const {shape,id,label,error}=require('../party/policy'),{digest}=require('../governance/content');
const A=require('../artists/context'),C=require('./context'),P=require('./lottery-policy');
function bindings(config,entries){
 if(!Array.isArray(entries)||entries.length!==config.prizes.length)throw error('LOTTERY_BINDINGS_REQUIRED',400);
 const seen=new Set();for(const e of entries){shape(e,['key','stock_id','point_back']);if(seen.has(e.key))throw error('LOTTERY_BINDINGS_REQUIRED',400);seen.add(e.key);const p=config.prizes.find(p=>p.key===e.key);if(!p)throw error('LOTTERY_BINDINGS_REQUIRED',400);
  if(['NONE','POINT_BACK'].includes(p.kind)){if(e.stock_id!==null)throw error('LOTTERY_BINDINGS_REQUIRED',400);if(p.kind==='POINT_BACK')require('./policy').integer(e.point_back,1,1000000);else if(e.point_back!==0)throw error('LOTTERY_BINDINGS_REQUIRED',400);}
  else{ id(e.stock_id);if(e.point_back!==0)throw error('LOTTERY_BINDINGS_REQUIRED',400);}
 }
 return structuredClone(entries);
}
async function inventory(tx,r,count=1){
 const stocks=new Map();for(const stock_id of [...new Set(r.data.bindings.filter(x=>x.stock_id).map(x=>x.stock_id))].sort())stocks.set(stock_id,await C.load(tx,stock_id,'STOCK'));
 for(const p of r.data.config.prizes){const b=r.data.bindings.find(x=>x.key===p.key);if(!b.stock_id)continue;const s=stocks.get(b.stock_id),t=s.data.template;
  const expected={INTERVIEW_OPEN:'INTERVIEW',INTERVIEW_PRIORITY:'INTERVIEW',PRODUCTION_CREDIT:'PRODUCTION_CREDIT',PRODUCTION_FREE:'PRODUCTION_FREE',EXPOSURE:'EXPOSURE'}[p.kind];
  if(t.kind==='EXPOSURE'&&!t.exposure.fallback_points)throw error('REWARD_REMEDY_RULE_MISSING',409);
  if(!expected)throw error('LOTTERY_PRIZE_FULFILLMENT_NOT_CONNECTED',409);
  if(s.owner_party_id!==r.owner_party_id||t.kind!==expected||p.kind==='INTERVIEW_OPEN'&&t.interview.channel!=='OPEN'||p.kind==='INTERVIEW_PRIORITY'&&t.interview.channel!=='PRIORITY')throw error('LOTTERY_PRIZE_BINDING_MISMATCH',409);
  const promised=r.data.prize_promises?.find(x=>x.key===p.key);if(promised&&digest(promised.template)!==digest(t))throw error('LOTTERY_PRIZE_PROMISE_CHANGED',409);
  if(s.current_status!=='AVAILABLE'||t.available_until<=await A.now(tx)||t.capacity-s.data.issued<count)throw error('LOTTERY_STOCK_NOT_READY',409);
 }
 return stocks;
}
function publicPool(r){return {id:r.id,object_version:r.object_version,current_status:r.current_status,config:r.data.config,distribution:r.data.distribution,bindings:r.data.bindings,starts_at:r.data.starts_at,ends_at:r.data.ends_at,rules_sha256:r.data.rules_sha256,terms:r.data.terms,inventory_policy:'PAUSE_IF_ANY_PRIZE_STOCK_BELOW_BATCH_SIZE',prize_promises:r.data.prize_promises||[]};}
function methods({db,actor}){return {
 async createPool(ctx,i){
  shape(i,['party_id','config','bindings','starts_at','ends_at','terms','cost_limit_single_minor','cost_limit_ten_minor','evidence_asset_ids','operation_key']);
  const config=P.pool(i.config),links=bindings(config,i.bindings),distribution=P.publishedDistribution(config);label(i.terms,8000);
  for(const k of ['starts_at','ends_at'])require('../trade/policy').instant(i[k]);for(const k of ['cost_limit_single_minor','cost_limit_ten_minor'])require('./policy').integer(i[k],1);
  if(i.starts_at>=i.ends_at||distribution.expected_single_cost_minor>i.cost_limit_single_minor||distribution.expected_ten_cost_minor>i.cost_limit_ten_minor)throw error('LOTTERY_COST_OR_PERIOD_INVALID',400);
  return db.withTransaction(async tx=>{const a=await actor(tx,ctx);await A.owner(tx,a,i.party_id);await C.operator(tx,a,'REDEMPTION_REVIEW');if(!Array.isArray(i.evidence_asset_ids)||!i.evidence_asset_ids.length)throw error('REWARD_EVIDENCE_REQUIRED',400);await A.assets(tx,i.evidence_asset_ids,i.party_id,['REVIEW_EVIDENCE']);
   return C.command(tx,a,'POOL_CREATE',i,()=>C.insert(tx,a,'POOL',i.party_id,null,'IN_REVIEW',{config,bindings:links,distribution,starts_at:i.starts_at,ends_at:i.ends_at,terms:i.terms,cost_limit_single_minor:i.cost_limit_single_minor,cost_limit_ten_minor:i.cost_limit_ten_minor,evidence_asset_ids:i.evidence_asset_ids,rules_sha256:null,prize_promises:[],reviews:{}}));});
 },
 async reviewPool(ctx,i){
  shape(i,['record_id','expected_version','channel','decision','reason','evidence_asset_id','operation_key']);label(i.reason,2000);
  if(!['RULES','FINANCE'].includes(i.channel)||!['APPROVE','REJECT'].includes(i.decision))throw error('INVALID_REVIEW',400);
  return db.withTransaction(async tx=>{const a=await actor(tx,ctx),r=await C.load(tx,i.record_id,'POOL');await C.operator(tx,a,i.channel==='FINANCE'?'FINANCE_REVIEW':'REDEMPTION_REVIEW',r);
   return C.command(tx,a,'POOL_REVIEW',i,async()=>{A.match(r,i.expected_version);if(r.current_status!=='IN_REVIEW'||r.data.reviews[i.channel])throw error('REVIEW_NOT_PENDING',409);
    if(Object.values(r.data.reviews).some(v=>v.by===a.id))throw error('INDEPENDENT_FINANCE_REVIEW_REQUIRED',403);
    await A.assets(tx,[id(i.evidence_asset_id)],r.owner_party_id,['REVIEW_EVIDENCE']);
    const reviews={...r.data.reviews,[i.channel]:{by:a.id,decision:i.decision,reason:i.reason,evidence_asset_id:i.evidence_asset_id}};let status=i.decision==='REJECT'?'REJECTED':'IN_REVIEW',data={...r.data,reviews};
    if(reviews.RULES?.decision==='APPROVE'&&reviews.FINANCE?.decision==='APPROVE'){
     if(r.data.ends_at<=await A.now(tx))throw error('LOTTERY_NOT_OPEN',409);const stocks=await inventory(tx,r,10);
     const prize_promises=r.data.bindings.filter(b=>b.stock_id).map(b=>({key:b.key,stock_id:b.stock_id,template:stocks.get(b.stock_id).data.template}));
     data={...data,prize_promises,rules_sha256:digest({config:data.config,bindings:data.bindings,distribution:data.distribution,starts_at:data.starts_at,ends_at:data.ends_at,terms:data.terms,prize_promises})};status='PUBLISHED';
    }
    return C.save(tx,a,r,status,data,'LOTTERY_POOL_REVIEWED');});});
 },
 async retirePool(ctx,i){shape(i,['record_id','expected_version','reason','operation_key']);label(i.reason,2000);return db.withTransaction(async tx=>{const a=await actor(tx,ctx),r=await C.load(tx,i.record_id,'POOL');await C.operator(tx,a,'REDEMPTION_REVIEW',r);return C.command(tx,a,'POOL_RETIRE',i,async()=>{A.match(r,i.expected_version);if(r.current_status!=='PUBLISHED')throw error('LOTTERY_NOT_OPEN',409);return C.save(tx,a,r,'RETIRED',{...r.data,retirement:{by:a.id,reason:i.reason}},'LOTTERY_POOL_RETIRED');});});},
 async pools(ctx){return db.withTransaction(async tx=>{await actor(tx,ctx);return {items:(await tx.execute("SELECT * FROM redemption_records WHERE kind='POOL' AND current_status='PUBLISHED' ORDER BY id LIMIT 100",[]))[0].map(C.checked).map(publicPool)};});},
 async pool(ctx,i){return db.withTransaction(async tx=>{await actor(tx,ctx);const r=await C.load(tx,i.record_id,'POOL','FOR SHARE');if(!['PUBLISHED','RETIRED'].includes(r.current_status))throw error('REDEMPTION_NOT_FOUND',404);return publicPool(r);});},
 async draw(ctx,i){
  shape(i,['party_id','pool_id','rules_sha256','count','operation_key']);if(![1,10].includes(i.count))throw error('LOTTERY_COUNT_INVALID',400);
  return db.withTransaction(async tx=>{const a=await actor(tx,ctx);await C.owner(tx,a,i.party_id,true);const r=await C.load(tx,i.pool_id,'POOL');
   return C.command(tx,a,'DRAW',i,async()=>{const at=await A.now(tx);if(r.current_status!=='PUBLISHED'||r.data.starts_at>at||r.data.ends_at<=at||r.data.rules_sha256!==i.rules_sha256)throw error('LOTTERY_NOT_OPEN',409);
    const stocks=await inventory(tx,r,i.count),draft=await C.insert(tx,a,'DRAW',i.party_id,r.id,'PENDING',{pool_id:r.id,rules_sha256:r.data.rules_sha256,rule_snapshot:publicPool(r),at,count:i.count,points:i.count===1?300:2700,hold_id:null,results:[]});
    const hold_id=await require('./points').spend(tx,ctx,draft,draft.data.points,'LOTTERY'),draw=P.draw(r.data.config,i.count),results=[];
    for(const result of draw.results){const b=r.data.bindings.find(x=>x.key===result.key);let grant_id=null,point_earning_id=null;
     if(b.stock_id){const stock=await C.load(tx,b.stock_id,'STOCK'),grant=await require('./repository').issue(tx,a,stock,i.party_id,['LOTTERY',draft.id,String(result.index)]);grant_id=grant.id;}
     if(b.point_back){const earning=await require('./points').award(tx,a,i.party_id,b.point_back,['LOTTERY',draft.id,String(result.index)]);point_earning_id=earning.id;}
     results.push({...result,grant_id,point_earning_id,point_back:b.point_back});
    }
    return C.save(tx,a,draft,'SETTLED',{...draft.data,hold_id,results},'LOTTERY_DRAW_SETTLED');});});
 },
 async myDraws(ctx,i){return db.withTransaction(async tx=>{const a=await actor(tx,ctx);await A.owner(tx,a,i.party_id);return {items:await C.rows(tx,i.party_id,'DRAW')};});},
 async drawRecord(ctx,i){return db.withTransaction(async tx=>{const a=await actor(tx,ctx);await A.owner(tx,a,i.party_id);const r=await C.load(tx,i.record_id,'DRAW','FOR SHARE');if(r.owner_party_id!==i.party_id)throw error('REDEMPTION_NOT_FOUND',404);return r;});}
};}
module.exports={methods,inventory,bindings,publicPool};
