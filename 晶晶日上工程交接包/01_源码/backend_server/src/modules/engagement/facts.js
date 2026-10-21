 'use strict';
const A=require('../artists/context'),G=require('../gigs/context'),E=require('../wallet/earnings');
async function order(tx,key){return G.checked(await A.one(tx,"SELECT * FROM trade_records WHERE kind='ORDER' AND id=? FOR UPDATE",[require('../party/policy').id(key)]));}
async function fact(tx,o,rule,asOf,{allowRefund=false}={}){const category=E.kind(o);if(!category||o.data.quote.audition_supplement)return null;const f=await require('../gigs/settlement').financialFacts(tx,o);if(f.environment!=='PRODUCTION'||o.current_status==='PAYMENT_REVIEW_REQUIRED'||f.received_minor!==o.data.quote.total_minor||f.net_minor<=0&&!allowRefund||o.buyer_party_id===o.merchant_party_id)return null;
 const overlaps=await A.one(tx,"SELECT a.account_id FROM party_memberships a JOIN party_memberships b ON b.account_id=a.account_id WHERE a.party_id=? AND b.party_id=? AND a.role_code='OWNER' AND b.role_code='OWNER'",[o.buyer_party_id,o.merchant_party_id]);if(overlaps)return null;
 const fulfillment=await E.fulfillment(tx,o);if(!fulfillment.at||fulfillment.disputed||Date.parse(fulfillment.at)+rule.aftercare_days[category]*86400000>Date.parse(asOf))return null;
 return {order_id:o.id,buyer_party_id:o.buyer_party_id,seller_party_id:o.merchant_party_id,category,at:fulfillment.at,net_minor:f.net_minor,refunded:f.refunded_minor>0,journal_ids:f.journal_ids,environment:f.environment};}
module.exports={order,fact};
