 'use strict';
const {digest}=require('../governance/content');
const {error}=require('../party/policy');
const A=require('../artists/context'),C=require('./context'),P=require('./policy');
function checked(row){if(!row)return null;const data=A.parse(row.data_json);if(digest(data)!==row.data_sha256)throw error('STORED_CONTENT_MISMATCH',503);return {...row,data};}
function kind(order){const q=order.data.quote;return q.stock_video?'STOCK':(q.audition||q.audition_supplement)?'AUDITION':q.customization&&!q.customization_change?'CUSTOMIZATION':q.commercial?'COMMERCIAL':null;}
// Called in the order-creation transaction, so later rule edits cannot rewrite the earning promise.
async function bindOrder(tx,order){
 const category=kind(order);if(!category)return;
 const raw=await A.one(tx,"SELECT * FROM wallet_records WHERE kind='ACCOUNT' AND source_key=? FOR UPDATE",[digest(['ACCOUNT',order.buyer_party_id])]);
 if(!raw)return;const account=C.checked(raw);if(account.current_status!=='ACTIVE')return;
 const rule=account.data.rule;
 await C.insert(tx,{id:order.created_by},'EARNING',order.buyer_party_id,order.id,'PENDING',{order_id:order.id,category,rule_id:account.data.rule_id,rule,source_kind:'CONSUMPTION',paid_minor:order.data.quote.total_minor,refunded_minor:0,points:0,reversed:0,growth_reversed:0,spent:0,expired:0,expires_at:null,issued_at:null,available_at:null,pending_shortfall:0,debt_offset:0,debt_settled:0},order.id);
}
async function fulfillment(tx,order){
 const category=kind(order);let at=null,disputed=false;
 if(category==='STOCK'){
  const p=checked(await A.one(tx,'SELECT * FROM stock_purchases WHERE order_id=? FOR SHARE',[order.id]));at=p?.data.accepted_at||null;disputed=!!p?.data.current_case_id;
 }else if(category==='CUSTOMIZATION'){
  const p=checked(await A.one(tx,'SELECT * FROM production_fulfillments WHERE order_id=? FOR SHARE',[order.id]));at=p?.data.completion?.at||null;disputed=!!p?.data.cancellation||p?.data.state==='PAUSED';
 }else if(category==='AUDITION'){
  const link=order.data.quote.audition_supplement||await A.one(tx,'SELECT booking_id FROM audition_orders WHERE order_id=?',[order.id]);
  const p=link?checked(await A.one(tx,'SELECT * FROM audition_records WHERE id=? FOR SHARE',[link.booking_id])):null;at=p?.data.fulfilled_at||null;disputed=!!p?.data.dispute;
 }
 if(category==='COMMERCIAL'){
  const projects=(await tx.execute("SELECT r.* FROM production_order_lines l JOIN production_records r ON r.id=l.project_id WHERE l.order_id=? FOR SHARE",[order.id]))[0].map(checked);
  const lines=order.data.quote.lines.filter(l=>l.line_kind!=='LICENSE');const dates=[];
  for(const p of projects){
   if(p.current_status!=='ACCEPTED'||!p.data.current.FINAL||p.data.current.FINAL!==p.data.accepted.FINAL){disputed=true;continue;}
   const feedbacks=(await tx.execute("SELECT * FROM production_records WHERE project_id=? AND kind='FEEDBACK' ORDER BY created_at DESC",[p.id]))[0].map(checked);
   const receipt=feedbacks.find(f=>f.data.version_id===p.data.accepted.FINAL&&f.data.decision==='ACCEPT');
   if(receipt)dates.push(A.instant(receipt.created_at));
  }
  if(lines.length&&projects.length===lines.length&&dates.length===lines.length)at=dates.sort().at(-1);
 }

 const refunds=(await tx.execute("SELECT id FROM trade_records WHERE kind='REFUND' AND order_id=? AND current_status NOT IN ('SUCCEEDED','REJECTED','FAILED','CANCELLED')",[order.id]))[0];
 return {at,disputed:disputed||refunds.length>0};
}
async function issue(tx,a,order,r,now){
 if(r.current_status!=='PENDING')return r;
 const f=await fulfillment(tx,order),financial=order.data.financial;
 const m=P.maturity({fulfilled_at:f.at,aftercare_days:r.data.rule.aftercare_days[r.data.category],disputed:f.disputed,paid_minor:financial.received_minor,refunded_minor:financial.refunded_minor},now);
 if(!m.ready||financial.received_minor!==r.data.paid_minor||order.current_status==='PAYMENT_REVIEW_REQUIRED')return {...r,pending_reason:m.reason||'PAYMENT_PENDING',available_at:m.available_at};
 const total=P.earnedPoints(r.data.paid_minor,r.data.rule.points_per_yuan),reversed=P.refundTarget(total,r.data.paid_minor,financial.refunded_minor,r.data.rule.points_per_yuan);
 const issued=await C.save(tx,a,r,'ISSUED',{...r.data,points:total,reversed,growth_reversed:reversed,refunded_minor:financial.refunded_minor,issued_at:now,available_at:m.available_at,expires_at:new Date(Date.parse(now)+r.data.rule.points_days*P.DAY).toISOString()},'POINTS_ISSUED');
 return settleDebt(tx,a,issued);
}
async function settleDebt(tx,a,issued){
 const debts=(await C.rows(tx,issued.owner_party_id,'EARNING')).filter(r=>r.id!==issued.id&&r.data.pending_shortfall>0).sort((a,b)=>(a.data.issued_at||'').localeCompare(b.data.issued_at||'')||a.id.localeCompare(b.id));
 let available=P.remaining(issued.data),offset=0;
 for(const debt of debts){const take=Math.min(available,debt.data.pending_shortfall);if(!take)break;const data={...debt.data,pending_shortfall:debt.data.pending_shortfall-take,debt_settled:(debt.data.debt_settled||0)+take};await C.save(tx,a,debt,data.pending_shortfall?'REVERSAL_PENDING':'ISSUED',data,'POINT_DEBT_RECOVERED');available-=take;offset+=take;}
 return offset?C.save(tx,a,issued,'ISSUED',{...issued.data,debt_offset:(issued.data.debt_offset||0)+offset},'NEW_POINTS_OFFSET_REFUND'):issued;
}
async function cancelHolds(tx,a,party){for(const h of await C.rows(tx,party,'POINT_HOLD'))if(h.current_status==='HELD')await C.save(tx,a,h,'RELEASED',{...h.data,reason:'ORDER_REFUND'},'POINT_HOLD_RELEASED');}
// Called after verified refund accounting. It must not delay the customer's cash refund for spent points.
async function financial(tx,order){
 const raw=await A.one(tx,"SELECT * FROM wallet_records WHERE kind='EARNING' AND source_key=?",[digest(['EARNING',order.id])]);if(!raw)return;
 await C.account(tx,order.buyer_party_id);let r=await C.load(tx,raw.id,'EARNING');if(!['ISSUED','REVERSAL_PENDING'].includes(r.current_status))return;
 const refund=order.data.financial.refunded_minor;if(refund===r.data.refunded_minor)return;
 const plan=P.reversalPlan(r.data,refund);await cancelHolds(tx,null,order.buyer_party_id);
 const d={...r.data,refunded_minor:refund,growth_reversed:plan.target,expired:r.data.expired-plan.expired,reversed:r.data.reversed+plan.expired+plan.unspent,pending_shortfall:plan.shortfall};
 // Confirmed business rule: future points recover this shortage; current cash refunds proceed.
 await C.save(tx,null,r,plan.shortfall?'REVERSAL_PENDING':'ISSUED',d,'REFUND_POINTS_RECONCILED');
}
module.exports={settleDebt,bindOrder,financial,fulfillment,issue,kind,checked};
