 'use strict';
const {randomUUID}=require('node:crypto');
const {id,shape,ref,error}=require('../party/policy'),{digest}=require('../governance/content');
const {one,checked,dto,load,liveRule}=require('./context'),policy=require('./policy');
async function financialFacts(tx,order,asOf=null){
 const [rows]=await tx.execute('SELECT j.id,j.direction,j.amount_minor,j.created_at,r.data_json,r.data_sha256 FROM trade_journal j JOIN trade_records r ON r.id=j.source_id WHERE j.order_id=? ORDER BY j.id',[order.id]);
 let received=0,refunded=0,environment=null,first=Infinity;const ids=[];
 for(const row of rows){const d=checked(row).data;const at=Date.parse(row.created_at.replace(' ','T')+'Z');if(asOf&&at>=Date.parse(asOf))continue;ids.push(row.id);if(row.direction==='RECEIPT'){received+=Number(row.amount_minor);first=Math.min(first,at);if(environment&&environment!==d.environment)throw error('MIXED_PAYMENT_ENVIRONMENT',409);environment=d.environment;}else refunded+=Number(row.amount_minor);}
 if(refunded>received||received>order.data.quote.total_minor)throw error('COMMISSION_MANUAL_REVIEW_REQUIRED',409);
 return {received_minor:received,refunded_minor:refunded,net_minor:received-refunded,environment,first_at:Number.isFinite(first)?first:null,journal_ids:ids};
}
function methods({db,actor,owner,operator,access,insert,save,command}){return {
 async calculate(ctx,i){shape(i,['party_id','order_id','operation_key']);return db.withTransaction(async tx=>{
  const a=await actor(tx,ctx),order=checked(await one(tx,"SELECT * FROM trade_records WHERE id=? AND kind='ORDER' FOR UPDATE",[id(i.order_id)]));
  const c=order.data.quote.commercial;if(!c)throw error('COMMERCIAL_ORDER_REQUIRED',409);
  if(i.party_id){await owner(tx,a,i.party_id);if(![order.buyer_party_id,order.merchant_party_id,c.relation?.mcn_party_id].includes(i.party_id))throw error('GIG_NOT_FOUND',404);}else await operator(tx,a);
  if(!['OPEN','PARTIALLY_PAID','PAID','PARTIALLY_REFUNDED','REFUNDED'].includes(order.current_status))throw error('COMMISSION_MANUAL_REVIEW_REQUIRED',409);
  const link=await one(tx,'SELECT * FROM gig_orders WHERE order_id=? FOR UPDATE',[order.id]);if(!link)throw error('COMMERCIAL_ORDER_REQUIRED',409);
  return command(tx,a,'COMMISSION',i,async()=>{const f=await financialFacts(tx,order),split=policy.split(f.net_minor,c.commission),data={order_id:order.id,contract_sha256:digest(order.data.contract),agreement:c,relation:c.relation,facts:f,amounts:split,currency:'CNY',paid_out_minor:0,meaning:'ACCRUAL_ONLY_NOT_TRANSFERRED'};
   async function entry(r,previous){await tx.execute('INSERT INTO gig_commission_entries(id,commission_id,object_version,data_json) VALUES (?,?,?,?)',[randomUUID(),r.id,r.object_version,JSON.stringify({facts:f,amounts:split,delta:{supplier_minor:split.supplier_minor-(previous?.supplier_minor||0),platform_minor:split.platform_minor-(previous?.platform_minor||0),mcn_minor:split.mcn_minor-(previous?.mcn_minor||0)}})]);return r;}
   if(link.commission_id){const prior=await load(tx,link.commission_id,'COMMISSION');if(digest(prior.data)===digest(data))return prior;return entry(await save(tx,a,prior,'CALCULATED',data,'COMMISSION_RECONCILED'),prior.data.amounts);}
   const r=await insert(tx,a,'COMMISSION',order.merchant_party_id,order.buyer_party_id,c.offer_id,'CALCULATED',data);await tx.execute('UPDATE gig_orders SET commission_id=? WHERE order_id=?',[r.id,order.id]);return entry(r,null);
  });
 });},
 async ranking(ctx,i){shape(i,['rule_id','as_of','operation_key']);require('../trade/policy').instant(i.as_of);if(!/T00:00:00.000Z$/.test(i.as_of)||Date.parse(i.as_of)>Date.now())throw error('INVALID_RANKING_DATE',400);return db.withTransaction(async tx=>{
  const a=await actor(tx,ctx);await operator(tx,a);await load(tx,i.rule_id,'RULE');const rule=await liveRule(tx,i.rule_id);
  return command(tx,a,'RANKING',i,async()=>{const existing=await one(tx,'SELECT record_id FROM gig_rankings WHERE rule_id=? AND as_of=? FOR UPDATE',[rule.id,i.as_of]);if(existing)return load(tx,existing.record_id,'RANKING');
   const [orders]=await tx.execute("SELECT t.* FROM trade_records t JOIN gig_orders g ON g.order_id=t.id WHERE t.current_status IN ('PAID','PARTIALLY_PAID','PARTIALLY_REFUNDED','REFUNDED') ORDER BY t.id");const facts=[];
   for(const row of orders){const o=checked(row),c=o.data.quote.commercial;if(!c||!c.ranking_opt_in)continue;const f=await financialFacts(tx,o,i.as_of);if(f.first_at!==null)facts.push({order_id:o.id,party_id:o.merchant_party_id,territory:c.scope.territory,net_minor:f.net_minor,environment:f.environment,at:f.first_at,first_at:f.first_at,journal_ids:f.journal_ids});}
   const first=new Map();for(const f of facts)first.set(f.party_id,Math.min(first.get(f.party_id)||Infinity,f.at));for(const f of facts)f.first_at=first.get(f.party_id);
   const boards=policy.rank(facts,rule.data.rule.ranking,i.as_of);const r=await insert(tx,a,'RANKING',null,null,rule.id,'PUBLISHED',{as_of:i.as_of,rule_id:rule.id,rule_sha256:rule.content_sha256,rule:rule.data.rule.ranking,source:'VERIFIED_PRODUCTION_COMMERCIAL_RECEIPTS',facts,boards,data_status:boards.hot.length?'AVAILABLE':'INSUFFICIENT_DATA'});
   await tx.execute('INSERT INTO gig_rankings(rule_id,as_of,record_id) VALUES (?,?,?)',[rule.id,i.as_of,r.id]);return r;
  });
 });},
 async publicRank(ctx,{record_id}){return db.withTransaction(async tx=>{await actor(tx,ctx);const r=await load(tx,record_id,'RANKING','FOR SHARE');return {id:r.id,as_of:r.data.as_of,rule_id:r.data.rule_id,rule:r.data.rule,source:r.data.source,data_status:r.data.data_status,boards:Object.fromEntries(Object.entries(r.data.boards).map(([key,rows])=>[key,rows.map(({party_id,territory,current,heat,emerging})=>({party_id,territory,orders:current,heat,emerging}))]))};});},
 async entries(ctx,{record_id,party_id}){return db.withTransaction(async tx=>{const a=await actor(tx,ctx),r=await load(tx,record_id,'COMMISSION','FOR SHARE');await access(tx,a,r,party_id);const [rows]=await tx.execute('SELECT id,object_version,data_json FROM gig_commission_entries WHERE commission_id=? ORDER BY object_version',[r.id]);return {items:rows.map(x=>({id:x.id,object_version:x.object_version,data:require('./context').parsed(x.data_json)}))};});},
 async evidence(ctx,{record_id,asset_id,party_id}){return db.withTransaction(async tx=>{const a=await actor(tx,ctx),r=await load(tx,record_id,null,'FOR SHARE');await access(tx,a,r,party_id);const ids=r.data.evidence_asset_ids||r.data.proofs?.map(x=>x.asset_id)||[];if(!ids.includes(id(asset_id)))throw error('GIG_NOT_FOUND',404);const asset=await one(tx,'SELECT * FROM supply_assets WHERE id=? FOR SHARE',[asset_id]);if(!asset||asset.current_status!=='READY')throw error('EVIDENCE_NOT_READY',409);return asset;});},
 };}
module.exports={methods,financialFacts};
