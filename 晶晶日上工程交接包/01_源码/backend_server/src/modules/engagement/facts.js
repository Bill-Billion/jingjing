 'use strict';
const A=require('../artists/context'),G=require('../gigs/context'),E=require('../wallet/earnings');
async function order(tx,key){return G.checked(await A.one(tx,"SELECT * FROM trade_records WHERE kind='ORDER' AND id=? FOR UPDATE",[require('../party/policy').id(key)]));}
async function fact(tx,o,rule,asOf,{allowRefund=false,allowResolvedCustomizationRefund=false}={}){const category=E.kind(o);if(!category||o.data.quote.audition_supplement)return null;const f=await require('../gigs/settlement').financialFacts(tx,o);if(f.environment!=='PRODUCTION'||o.current_status==='PAYMENT_REVIEW_REQUIRED'||f.received_minor!==o.data.quote.total_minor||f.net_minor<=0&&!allowRefund||o.buyer_party_id===o.merchant_party_id)return null;
 const overlaps=await A.one(tx,"SELECT a.account_id FROM party_memberships a JOIN party_memberships b ON b.account_id=a.account_id WHERE a.party_id=? AND b.party_id=? AND a.role_code='OWNER' AND b.role_code='OWNER'",[o.buyer_party_id,o.merchant_party_id]);if(overlaps)return null;
 const fulfillment=await E.fulfillment(tx,o),resolved=allowResolvedCustomizationRefund&&allowRefund&&category==='CUSTOMIZATION'&&await resolvedCustomizationRefund(tx,o,f);if(!fulfillment.at||(fulfillment.disputed&&!resolved)||Date.parse(fulfillment.at)+rule.aftercare_days[category]*86400000>Date.parse(asOf))return null;
 return {order_id:o.id,buyer_party_id:o.buyer_party_id,seller_party_id:o.merchant_party_id,category,at:fulfillment.at,net_minor:f.net_minor,refunded:f.refunded_minor>0,journal_ids:f.journal_ids,environment:f.environment};}

// Referral reversal may use a completed original delivery after its independently
// approved partial refund is fully reconciled. Other reward/ranking callers and
// open disputes, unfinished work or refunds in flight keep their existing gate.
async function resolvedCustomizationRefund(tx,o,f){
 if(!o.data.quote.referral||f.refunded_minor<=0||f.net_minor<=0)return false;
 const p=E.checked(await A.one(tx,'SELECT * FROM production_fulfillments WHERE order_id=? FOR SHARE',[o.id])),d=p?.data,c=d?.cancellation;
 if(!c||d.state!=='REFUNDED'||!d.completion?.at||!c.approved_at||Date.parse(d.completion.at)>Date.parse(c.approved_at)||c.received_minor!==f.received_minor||c.refund_minor!==f.refunded_minor||c.actual_refunded_minor!==f.refunded_minor||c.retained_minor!==f.net_minor)return false;
 const entry=E.checked(await A.one(tx,'SELECT * FROM production_fulfillment_cases WHERE id=? AND project_id=? FOR SHARE',[c.case_id,p.project_id])),decision=entry?.data.resolution;
 if(entry?.current_status!=='RESOLVED'||decision?.decision!=='CANCEL'||decision.reviewer!==c.reviewer||decision.retained_minor!==c.retained_minor)return false;
 const open=await A.one(tx,"SELECT id FROM production_fulfillment_cases WHERE project_id=? AND current_status='OPEN' LIMIT 1 FOR SHARE",[p.project_id]);if(open)return false;
 return !await A.one(tx,"SELECT id FROM trade_records WHERE order_id=? AND kind='REFUND' AND current_status NOT IN ('SUCCEEDED','REJECTED','FAILED','CANCELLED') LIMIT 1 FOR SHARE",[o.id]);
}
module.exports={order,fact};
