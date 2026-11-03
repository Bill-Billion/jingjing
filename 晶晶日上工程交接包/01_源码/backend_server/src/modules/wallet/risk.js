'use strict';
const {shape,id,ref,label,error}=require('../party/policy'),{digest}=require('../governance/content');
const A=require('../artists/context'),C=require('./context'),W=require('./policy'),P=require('./risk-policy');
const checked=r=>{if(!r)throw error('CONSUMER_TARGET_NOT_FOUND',404);const d=A.parse(r.data_json);if(digest(d)!==r.data_sha256)throw error('STORED_CONTENT_MISMATCH',503);return {...r,data:d};};
async function active(tx){const p=await A.one(tx,'SELECT * FROM consumer_risk_policy WHERE singleton_id=1 FOR SHARE');if(!p?.record_id)return null;const r=await C.load(tx,p.record_id,'CONSUMER_RISK_RULE','FOR SHARE');if(r.current_status!=='EFFECTIVE')throw error('CONSUMER_POLICY_UNAVAILABLE',503);P.rule(r.data.rule);return r;}
async function target(tx,party,t){
 if(t.kind==='RECHARGE'){shape(t,['kind','amount_minor','request_key']);W.integer(t.amount_minor,1);ref(t.request_key);return {...t};}
 if(t.kind==='PAYMENT_RECORD'){
  shape(t,['kind','payment_id']);const p=checked(await A.one(tx,"SELECT * FROM trade_records WHERE id=? AND kind='PAYMENT' FOR SHARE",[id(t.payment_id)]));
  if(p.buyer_party_id!==party)throw error('CONSUMER_TARGET_NOT_FOUND',404);
  if(p.current_status!=='CREATED')throw error('CONSUMER_TARGET_NOT_PENDING',409);
  return {kind:'PAYMENT',order_id:p.order_id,installment_key:p.data.installment_key,request_key:p.data.consumer_request_key||'legacy:'+p.id,amount_minor:p.data.amount_minor,payment_id:p.id};
 }
 if(t.kind==='PAYMENT'){
  shape(t,['kind','order_id','installment_key','request_key']);ref(t.request_key);ref(t.installment_key);
  const o=checked(await A.one(tx,"SELECT * FROM trade_records WHERE id=? AND kind='ORDER' FOR SHARE",[id(t.order_id)]));
  if(o.buyer_party_id!==party)throw error('CONSUMER_TARGET_NOT_FOUND',404);
  if(!['OPEN','PARTIALLY_PAID'].includes(o.current_status))throw error('CONSUMER_TARGET_NOT_PENDING',409);
  const step=o.data.quote.installments.find(s=>s.key===t.installment_key);if(!step)throw error('INSTALLMENT_NOT_FOUND',404);
  const payments=(await tx.execute("SELECT * FROM trade_records WHERE order_id=? AND kind='PAYMENT' AND current_status<>'CLOSED'",[o.id]))[0].map(checked);
  const existing=payments.find(p=>p.data.installment_key===t.installment_key);
  if(existing&&(existing.current_status!=='CREATED'||existing.data.consumer_request_key!==t.request_key))throw error('CONSUMER_TARGET_NOT_PENDING',409);
  return {...t,amount_minor:W.sum(step.allocations.map(s=>s.amount_minor)),...(existing?{payment_id:existing.id}:{})};
 }
 if(t.kind==='LOTTERY'){
  shape(t,['kind','pool_id','count','request_key']);ref(t.request_key);if(![1,10].includes(t.count))throw error('LOTTERY_COUNT_INVALID',400);
  const pool=checked(await A.one(tx,"SELECT * FROM redemption_records WHERE id=? AND kind='POOL' FOR SHARE",[id(t.pool_id)]));
  if(pool.current_status!=='PUBLISHED')throw error('LOTTERY_NOT_OPEN',409);
  return {...t,rules_sha256:pool.data.rules_sha256,amount_minor:t.count===1?300:2700};
 }
 throw error('INVALID_CONSUMER_TARGET',400);
}
async function usage(tx,party,r,at,exclude=null){
 const start=new Date(Date.parse(at)-r.window_seconds*1000).toISOString().slice(0,23).replace('T',' '),day=new Date(Date.parse(at)+8*3600000).toISOString().slice(0,10),midnight=new Date(day+'T00:00:00+08:00').toISOString().slice(0,23).replace('T',' ');
 const [[p]]=await tx.execute("SELECT COUNT(*) n FROM trade_records WHERE kind='PAYMENT' AND buyer_party_id=? AND created_at>=? AND id<>?",[party,start,exclude||'']);
 const [[q]]=await tx.execute("SELECT COUNT(*) n FROM wallet_records WHERE kind='RECHARGE' AND owner_party_id=? AND created_at>=? AND id<>?",[party,start,exclude||'']);
 const rows=(await tx.execute("SELECT * FROM redemption_records WHERE kind='DRAW' AND owner_party_id=? AND created_at>=? ORDER BY id LIMIT 10001",[party,start<midnight?start:midnight]))[0];if(rows.length>10000)throw error('CONSUMER_USAGE_REVIEW_REQUIRED',409);
 let window_draws=0,day_points=0;for(const raw of rows){const d=checked(raw).data;if(d.at>=new Date(start+'Z').toISOString())window_draws=W.sum([window_draws,d.count]);if(d.at>=new Date(midnight+'Z').toISOString())day_points=W.sum([day_points,d.points]);}
 return {cash_attempts:Number(p.n)+Number(q.n),window_draws,day_points};
}
function binding(t){const {payment_id,recharge_id,...b}=t;return b;}
async function evaluate(tx,party,t){
 const control=await require('./consumer-controls').lock(tx,party);if(!control)return {configured:false,required:false,rule_id:null,preview_sha256:null,reasons:[],message:null,target:binding(t),expires_in_seconds:null};
 const r=await active(tx),at=await A.now(tx);if(!r)return {configured:false,required:false,rule_id:null,preview_sha256:null,reasons:[],message:null,target:binding(t),expires_in_seconds:null};
 const u=await usage(tx,party,r.data.rule,at,t.payment_id||t.recharge_id),reasons=P.reasons(r.data.rule,t,u,at);
 const b=binding(t);delete b.recharge_id;
 const fingerprint=digest({party_id:party,rule_id:r.id,target:b,usage:u,reasons});
 return {configured:true,required:reasons.length>0,rule_id:r.id,preview_sha256:fingerprint,reasons,message:r.data.rule.message,target:b,expires_in_seconds:r.data.rule.confirmation_seconds};
}
async function enforce(tx,party,t){const v=await evaluate(tx,party,t);if(!v.required)return;
 const raw=await A.one(tx,"SELECT * FROM wallet_records WHERE kind='CONSUMER_RISK_ACK' AND source_key=?",[digest(['CONSUMER_RISK_ACK',[party,v.preview_sha256]])]);
 if(!raw)throw error('CONSUMER_RISK_CONFIRMATION_REQUIRED',409);const ack=C.checked(raw);
 if(ack.data.expires_at<=await A.now(tx))throw error('CONSUMER_RISK_CONFIRMATION_EXPIRED',409);
}
function createConsumerRisk(db,{resolvePrincipal=async()=>null}={}){
 const actor=A.createActor(resolvePrincipal);
 return {
 async status(ctx){return db.withTransaction(async tx=>{await actor(tx,ctx);const r=await active(tx);return {configured:!!r,rule:r,real_services_enabled:false};});},
 async rules(ctx){return db.withTransaction(async tx=>{const a=await actor(tx,ctx);await C.operator(tx,a,'WALLET_RULE_REVIEW');return {items:(await tx.execute("SELECT * FROM wallet_records WHERE kind='CONSUMER_RISK_RULE' ORDER BY created_at DESC,id LIMIT 100"))[0].map(C.checked)};});},
 async createRule(ctx,i){shape(i,['rule','operation_key']);const rule=P.rule(i.rule);return db.withTransaction(async tx=>{const a=await actor(tx,ctx);await C.operator(tx,a,'WALLET_RULE_REVIEW');return C.command(tx,a,'CONSUMER_RISK_RULE',i,()=>C.insert(tx,a,'CONSUMER_RISK_RULE',null,null,'IN_REVIEW',{rule,review:null}));});},
 async reviewRule(ctx,i){shape(i,['record_id','expected_version','decision','reason','operation_key']);label(i.reason,2000);if(!['APPROVE','REJECT'].includes(i.decision))throw error('INVALID_REVIEW',400);
  return db.withTransaction(async tx=>{const a=await actor(tx,ctx);await tx.execute('INSERT INTO consumer_risk_policy(singleton_id,record_id,object_version) VALUES (1,NULL,1) ON DUPLICATE KEY UPDATE singleton_id=singleton_id');const pointer=await A.one(tx,'SELECT * FROM consumer_risk_policy WHERE singleton_id=1 FOR UPDATE');const r=await C.load(tx,i.record_id,'CONSUMER_RISK_RULE');await C.operator(tx,a,'WALLET_RULE_REVIEW',r);
   return C.command(tx,a,'CONSUMER_RISK_REVIEW',i,async()=>{A.match(r,i.expected_version);if(r.current_status!=='IN_REVIEW')throw error('REVIEW_NOT_PENDING',409);P.rule(r.data.rule);const next=await C.save(tx,a,r,i.decision==='APPROVE'?'EFFECTIVE':'REJECTED',{...r.data,review:{by:a.id,reason:i.reason,at:await A.now(tx)}},'CONSUMER_RISK_REVIEWED');if(i.decision==='APPROVE'){if(pointer.record_id){const old=await C.load(tx,pointer.record_id,'CONSUMER_RISK_RULE');await C.save(tx,a,old,'RETIRED',old.data,'CONSUMER_RISK_REPLACED');}await tx.execute('UPDATE consumer_risk_policy SET record_id=?,object_version=object_version+1 WHERE singleton_id=1',[r.id]);}return next;});});},
 async preview(ctx,i){shape(i,['party_id','target']);return db.withTransaction(async tx=>{const a=await actor(tx,ctx);await C.owner(tx,a,i.party_id,true);return evaluate(tx,i.party_id,await target(tx,i.party_id,i.target));});},
 async confirm(ctx,i){shape(i,['party_id','target','preview_sha256','read_confirmed','operation_key']);if(i.read_confirmed!==true)throw error('CONSUMER_READING_REQUIRED',409);return db.withTransaction(async tx=>{const a=await actor(tx,ctx);await C.owner(tx,a,i.party_id,true);const t=await target(tx,i.party_id,i.target);await require('./consumer-controls').lock(tx,i.party_id);
  return C.command(tx,a,'CONSUMER_RISK_CONFIRM',i,async()=>{const v=await evaluate(tx,i.party_id,t);if(!v.required||v.preview_sha256!==i.preview_sha256)throw error('CONSUMER_RISK_PREVIEW_CHANGED',409);const source=digest(['CONSUMER_RISK_ACK',[i.party_id,v.preview_sha256]]),old=await A.one(tx,'SELECT * FROM wallet_records WHERE source_key=?',[source]);if(old&&C.checked(old).data.expires_at>await A.now(tx))return C.checked(old);
   const data={preview:v,confirmed_by:a.id,confirmed_at:await A.now(tx),expires_at:new Date(Date.parse(await A.now(tx))+v.expires_in_seconds*1000).toISOString()};return old?C.save(tx,a,C.checked(old),'CONFIRMED',data,'CONSUMER_RISK_RECONFIRMED'):C.insert(tx,a,'CONSUMER_RISK_ACK',i.party_id,v.rule_id,'CONFIRMED',data,[i.party_id,v.preview_sha256]);});});}
 };
}
module.exports={createConsumerRisk,enforce,evaluate,usage,target};
