'use strict';
const {randomUUID}=require('node:crypto');
const {shape,id,error}=require('../party/policy');
const {digest}=require('../governance/content');
const A=require('../artists/context'),C=require('./context'),P=require('./consumer-policy'),W=require('./policy');
const empty=()=>({limits:{RECHARGE:null,PAYMENT:null},pending:{RECHARGE:null,PAYMENT:null}});
// One row serializes settings and new payment/recharge attempts. Database transactions use READ COMMITTED.
// Usage reads must NOT lock other orders: each caller already owns its own order/payment locks.
async function lock(tx,party){
 const p=await A.one(tx,'SELECT * FROM parties WHERE id=?',[id(party)]);
 if(!p||p.kind!=='PERSON')return null;
 const source=digest(['CONSUMER_CONTROL',party]),data=empty(),key=randomUUID();
 const [inserted]=await tx.execute("INSERT INTO wallet_records(id,kind,owner_party_id,source_key,created_by,current_status,data_json,data_sha256) VALUES (?,'CONSUMER_CONTROL',?,?,?,'ACTIVE',?,?) ON DUPLICATE KEY UPDATE id=id",[key,party,source,p.personal_account_id,JSON.stringify(data),digest(data)]);
 const r=C.checked(await A.one(tx,'SELECT * FROM wallet_records WHERE source_key=? FOR UPDATE',[source]));
 if(inserted.affectedRows===1&&r.id===key)await C.audit(tx,{id:p.personal_account_id},r,'CONSUMER_CONTROL_CREATED');
 return r;
}
async function usage(tx,party,now){
 const range=P.period(now),start=range.starts_at.slice(0,23).replace('T',' '),end=range.ends_at.slice(0,23).replace('T',' ');
 const [payments]=await tx.execute("SELECT p.* FROM trade_records p WHERE p.buyer_party_id=? AND p.kind='PAYMENT' AND ((p.created_at>=? AND p.created_at<?) OR p.current_status NOT IN ('CLOSED','SUCCEEDED','REFUNDED') OR EXISTS (SELECT 1 FROM trade_journal j WHERE j.source_id=p.id AND j.direction='RECEIPT' AND j.created_at>=? AND j.created_at<?)) ORDER BY p.created_at,p.id LIMIT 10001",[party,start,end,start,end]);
 const [topups]=await tx.execute("SELECT * FROM wallet_records WHERE owner_party_id=? AND kind='RECHARGE' AND ((created_at>=? AND created_at<?) OR current_status NOT IN ('FAILED','CANCELLED','SUCCEEDED') OR (JSON_UNQUOTE(JSON_EXTRACT(data_json,'$.occurred_at'))>=? AND JSON_UNQUOTE(JSON_EXTRACT(data_json,'$.occurred_at'))<?)) ORDER BY created_at,id LIMIT 10001",[party,start,end,range.starts_at,range.ends_at]);
 if(payments.length>10000||topups.length>10000)throw error('CONSUMER_USAGE_REVIEW_REQUIRED',409);
 const totals={RECHARGE:0,PAYMENT:0},pending={RECHARGE:0,PAYMENT:0};
 for(const [kind,rows,closed,finished] of [['PAYMENT',payments,['CLOSED'],['SUCCEEDED','REFUNDED']],['RECHARGE',topups,['FAILED','CANCELLED'],['SUCCEEDED']]])for(const row of rows){
  const d=A.parse(row.data_json);if(digest(d)!==row.data_sha256)throw error('STORED_CONTENT_MISMATCH',503);
  W.integer(d.amount_minor,1);if(closed.includes(row.current_status))continue;
  totals[kind]=W.sum([totals[kind],d.amount_minor]);if(!finished.includes(row.current_status))pending[kind]=W.sum([pending[kind],d.amount_minor]);
 }
 return {period:range,totals,pending};
}
async function view(tx,r){const now=await A.now(tx),u=await usage(tx,r.owner_party_id,now);return {id:r.id,object_version:r.object_version,party_id:r.owner_party_id,policy_version:P.VERSION,cooling_hours:P.COOLING_HOURS,limits:r.data.limits,pending:r.data.pending,period:u.period,usage:Object.fromEntries(['RECHARGE','PAYMENT'].map(k=>[k,{used_minor:u.totals[k],pending_minor:u.pending[k],remaining_minor:P.remaining(r.data.limits[k],u.totals[k]),over_limit:r.data.limits[k]!==null&&u.totals[k]>r.data.limits[k]}])),accounting_basis:'GROSS_MONTH_REQUESTS_RECEIPTS_AND_OPEN_ATTEMPTS',scope:'PERSONAL_CASH_ONLY',as_of:now};}
// Called after the attempt is inserted, in the SAME transaction, before any provider dispatch.
// No network request, no rewriting old contracts and no rejection of verified payment/refund facts.
async function check(tx,party,kind){const r=await lock(tx,party);if(!r||r.data.limits[kind]===null)return;const u=await usage(tx,party,await A.now(tx));P.enforce(r.data.limits[kind],u.totals[kind]);}
function createConsumerControls(db,{resolvePrincipal=async()=>null}={}){
 const actor=A.createActor(resolvePrincipal),run=(ctx,party,fn)=>db.withTransaction(async tx=>{const a=await actor(tx,ctx);await C.owner(tx,a,party);return fn(tx,a,await lock(tx,party));});
 async function mutate(ctx,i,action){shape(i,['party_id','kind','monthly_limit_minor','expected_version','operation_key']);P.kind(i.kind);if(action==='CHANGE')P.amount(i.monthly_limit_minor);else if(i.monthly_limit_minor!==undefined)throw error('INVALID_INPUT',400);
  return run(ctx,i.party_id,(tx,a,r)=>C.command(tx,a,'CONSUMER_'+action,i,async()=>{
   A.match(r,i.expected_version);const now=await A.now(tx),data=structuredClone(r.data),before=structuredClone(r.data),k=i.kind;
   if(action==='CHANGE'){
    const next=P.change(data.limits[k],i.monthly_limit_minor,now);
    if(next.action==='UNCHANGED')throw error('CONSUMER_LIMIT_UNCHANGED',409);
    if(next.action==='LOWER'){data.limits[k]=next.value;data.pending[k]=null;}else data.pending[k]=next.pending;
   }else{
    const pending=data.pending[k];if(!pending)throw error('CONSUMER_LIMIT_CHANGE_NOT_PENDING',409);
    if(action==='CONFIRM'){if(now<pending.confirm_after)throw error('CONSUMER_LIMIT_COOLING_PERIOD',409);data.limits[k]=pending.monthly_limit_minor;}
    data.pending[k]=null;
   }
   const next=await C.save(tx,a,r,'ACTIVE',data,'CONSUMER_LIMIT_'+action);
   await C.insert(tx,a,'CONSUMER_LIMIT_EVENT',i.party_id,r.id,'RECORDED',{action,kind:k,before,after:data,at:now,policy_version:P.VERSION,object_version:next.object_version},[a.id,action,i.operation_key]);
   return view(tx,next);
  }));
 }
 return {get:(ctx,{party_id})=>run(ctx,party_id,(tx,a,r)=>view(tx,r)),change:(ctx,i)=>mutate(ctx,i,'CHANGE'),confirm:(ctx,i)=>mutate(ctx,i,'CONFIRM'),cancel:(ctx,i)=>mutate(ctx,i,'CANCEL'),
  async history(ctx,{party_id,after='',limit=20}){if(after)id(after);if(!Number.isInteger(limit)||limit<1||limit>100)throw error('INVALID_LIST',400);return run(ctx,party_id,async tx=>{const [rows]=await tx.execute("SELECT * FROM wallet_records WHERE owner_party_id=? AND kind='CONSUMER_LIMIT_EVENT' AND id>? ORDER BY id LIMIT ?",[party_id,after,limit+1]);return {items:rows.slice(0,limit).map(C.checked),next_cursor:rows.length>limit?rows[limit-1].id:null};});}
 };
}
module.exports={createConsumerControls,check,usage,lock};
