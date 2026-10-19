 'use strict';
// Amounts are integer fen or integer points. No provider, database or HTTP dependencies.
const {shape, ref, label, error}=require('../party/policy');
const {instant}=require('../trade/policy');
const DAY=86400000, MAX=900000000000;
function integer(n,min=0,max=MAX){if(!Number.isSafeInteger(n)||n<min||n>max)throw error('WALLET_AMOUNT_INVALID',400);return n;}
function sum(values){return integer(values.reduce((a,b)=>a+integer(b),0));}
function proportion(n,numerator,denominator){integer(n);integer(numerator);integer(denominator,1);if(numerator>denominator)throw error('WALLET_AMOUNT_INVALID',400);return Number(BigInt(n)*BigInt(numerator)/BigInt(denominator));}
function rule(value){
 shape(value,['version','terms','topup_threshold_minor','membership_days','growth_thresholds','points_per_yuan','points_rounding','points_days','hold_minutes','aftercare_days','topup_limits']);
 ref(value.version);label(value.terms,4000);integer(value.topup_threshold_minor,1);integer(value.points_per_yuan,1,1000);integer(value.hold_minutes,1,1440);
 if(value.points_rounding!=='FLOOR_NET_PAID')throw error('WALLET_RULE_INVALID',400);
 if(value.membership_days!==365||value.points_days!==365)throw error('WALLET_RULE_INVALID',400);
 if(!Array.isArray(value.growth_thresholds)||value.growth_thresholds.length!==5||value.growth_thresholds.some((n,i)=>!Number.isSafeInteger(n)||n<1||n>MAX||(i&&n<=value.growth_thresholds[i-1])))throw error('WALLET_RULE_INVALID',400);
 shape(value.aftercare_days,['STOCK','CUSTOMIZATION','AUDITION','COMMERCIAL']);
 for(const kind of ['STOCK','CUSTOMIZATION','AUDITION','COMMERCIAL']){const days=value.aftercare_days[kind];if(days!==null)integer(days,0,365);}
 shape(value.topup_limits,['single_minor','daily_minor','monthly_minor','cooling_minutes']);
 for(const k of ['single_minor','daily_minor','monthly_minor'])integer(value.topup_limits[k],1);
 integer(value.topup_limits.cooling_minutes,0,43200);
 if(value.topup_limits.single_minor>value.topup_limits.daily_minor||value.topup_limits.daily_minor>value.topup_limits.monthly_minor)throw error('WALLET_RULE_INVALID',400);
 return structuredClone(value);
}
function earnedPoints(paidMinor,rate){integer(paidMinor);integer(rate,1,1000);return integer(Number(BigInt(paidMinor)*BigInt(rate)/100n));}
// A refund uses the original earning promise, and rounds once on the cumulative refund.
function refundTarget(originalPoints,originalPaid,refundedMinor,rate=null){
 integer(originalPoints);integer(originalPaid,1);integer(refundedMinor);if(refundedMinor>originalPaid)throw error('WALLET_AMOUNT_INVALID',400);
 if(rate!==null){if(earnedPoints(originalPaid,rate)!==originalPoints)throw error('WALLET_POINTS_PROMISE_MISMATCH',503);return originalPoints-earnedPoints(originalPaid-refundedMinor,rate);}
 return proportion(originalPoints,refundedMinor,originalPaid);
}
function maturity({fulfilled_at,aftercare_days,disputed,paid_minor,refunded_minor},now){
 instant(now);integer(paid_minor);integer(refunded_minor);if(refunded_minor>paid_minor)throw error('WALLET_FINANCIAL_MISMATCH',503);
 if(!fulfilled_at)return {ready:false,reason:'FULFILLMENT_PENDING',available_at:null};
 instant(fulfilled_at);
 if(aftercare_days===null)return {ready:false,reason:'AFTERCARE_RULE_PENDING',available_at:null};
 integer(aftercare_days,0,365);const available_at=new Date(Date.parse(fulfilled_at)+aftercare_days*DAY).toISOString();
 return {ready:!disputed&&available_at<=now&&paid_minor>refunded_minor,reason:disputed?'AFTERCARE_PENDING':available_at>now?'AFTERCARE_WINDOW':paid_minor===refunded_minor?'FULLY_REFUNDED':null,available_at};
}
// Inputs are already verified receipts, net of refunds; excess in one receipt buys no extra years.
function membership(r,topups,growth,now,levelSix=null){
 integer(growth);instant(now);let credit=0,until=null,eligibleFrom=null;
 for(const receipt of [...topups].sort((a,b)=>a.occurred_at.localeCompare(b.occurred_at)||a.id.localeCompare(b.id))){
  instant(receipt.occurred_at);integer(receipt.amount_minor);integer(receipt.refunded_minor);
  if(receipt.refunded_minor>receipt.amount_minor)throw error('WALLET_FINANCIAL_MISMATCH',503);
  if(receipt.occurred_at>now)continue;
  const at=Date.parse(receipt.occurred_at);if(eligibleFrom!==null&&at<eligibleFrom)continue;
  credit=sum([credit,receipt.amount_minor-receipt.refunded_minor]);
  if(credit>=r.topup_threshold_minor){const previous=until;until=Math.max(until||at,at)+r.membership_days*DAY;eligibleFrom=previous===null?at:Math.max(previous,at);credit=0;}
 }
 const qualified=1+r.growth_thresholds.filter(n=>growth>=n).length;
 const sixth=!!levelSix&&levelSix.status==='APPROVED'&&levelSix.valid_from<=now&&now<levelSix.valid_until;
 const attained_level=Math.min(qualified,sixth?6:5),active=until!==null&&Date.parse(now)<until;
 return {active,level:active?attained_level:0,attained_level,qualifying_growth:growth,valid_until:until===null?null:new Date(until).toISOString(),renewal_credit_minor:credit,level_six_review_required:qualified===6&&!sixth,reason:active?null:until===null?'TOPUP_THRESHOLD_NOT_MET':'MEMBERSHIP_EXPIRED'};
}
function topupAllowed(r,receipts,amount,now){
 integer(amount,1);instant(now);const l=r.topup_limits,local=t=>new Date(Date.parse(t)+8*3600000).toISOString(),date=local(now).slice(0,10),month=local(now).slice(0,7);
 if(amount>l.single_minor)throw error('WALLET_SINGLE_LIMIT',409);
 const active=receipts.filter(x=>!['FAILED','CANCELLED'].includes(x.status));
 if(sum(active.filter(x=>local(x.created_at).slice(0,10)===date).map(x=>x.amount_minor).concat(amount))>l.daily_minor)throw error('WALLET_DAILY_LIMIT',409);
 if(sum(active.filter(x=>local(x.created_at).slice(0,7)===month).map(x=>x.amount_minor).concat(amount))>l.monthly_minor)throw error('WALLET_MONTHLY_LIMIT',409);
 if(active.some(x=>Date.parse(now)-Date.parse(x.created_at)<l.cooling_minutes*60000))throw error('WALLET_COOLING_PERIOD',409);
}
function remaining(lot){
 const left=integer(lot.points)-sum([lot.reversed,lot.spent,lot.expired,lot.debt_offset||0]);
 if(left<0)throw error('WALLET_POINTS_INVARIANT',503);return left;
}
function available(lots,holds,now){
 instant(now);const reserved=new Map();
 for(const h of holds)if(h.status==='HELD'&&h.expires_at>now)for(const a of h.allocations)reserved.set(a.lot_id,sum([reserved.get(a.lot_id)||0,a.points]));
 return lots.map(l=>{const free=remaining(l)-(reserved.get(l.id)||0);if(free<0)throw error('WALLET_POINTS_INVARIANT',503);return {...l,available:l.expires_at<=now?0:free};});
}
function reserve(lots,holds,points,now,expires_at){
 integer(points,1);instant(expires_at);if(expires_at<=now)throw error('WALLET_HOLD_EXPIRED',409);
 const candidates=available(lots,holds,now).filter(l=>l.expires_at>=expires_at).sort((a,b)=>a.expires_at.localeCompare(b.expires_at)||a.id.localeCompare(b.id));
 let left=points;const allocations=[];
 for(const l of candidates){const n=Math.min(left,l.available);if(n){allocations.push({lot_id:l.id,points:n});left-=n;}if(!left)break;}
 if(left)throw error('WALLET_POINTS_INSUFFICIENT',409);return allocations;
}
function growth(lots){return sum(lots.filter(l=>l.source_kind==='CONSUMPTION').map(l=>integer(l.points-l.growth_reversed)));}
// User confirmed 2026-10-19: shortfall is recovered from future points, never from cash.
function reversalPlan(lot,cumulativeRefund){
 const desired=refundTarget(lot.points,lot.paid_minor,cumulativeRefund,lot.rule?.points_per_yuan??null),growth_delta=desired-lot.growth_reversed;
 if(growth_delta<0)throw error('WALLET_REFUND_REGRESSION',409);
 const outstanding=desired-lot.reversed-(lot.debt_settled||0),expired=Math.min(lot.expired,outstanding),unspent=Math.min(remaining(lot),outstanding-expired);
 return {target:desired,growth_delta,expired,unspent,shortfall:outstanding-expired-unspent};
}
module.exports={DAY,MAX,integer,sum,rule,earnedPoints,refundTarget,maturity,membership,topupAllowed,remaining,available,reserve,growth,reversalPlan};
