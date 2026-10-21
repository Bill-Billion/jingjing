"use strict";
const A=require('../artists/context'),C=require('./context'),P=require('./policy');
const {digest}=require('../governance/content');
async function read(tx,party,now){
 const raw=await A.one(tx,"SELECT * FROM wallet_records WHERE kind='ACCOUNT' AND source_key=? FOR UPDATE",[digest(['ACCOUNT',party])]);if(!raw)return null;
 const account=C.checked(raw);if(account.current_status!=='ACTIVE')return null;
 const topups=(await C.rows(tx,party,'RECHARGE')).filter(r=>r.current_status==='SUCCEEDED');
 const lots=(await C.rows(tx,party,'EARNING')).filter(r=>['ISSUED','REVERSAL_PENDING'].includes(r.current_status));
 const six=(await C.rows(tx,party,'LEVEL_REVIEW')).find(r=>r.current_status==='APPROVED'&&r.data.valid_from<=now&&now<r.data.valid_until);
 return {...P.membership(account.data.rule,topups.map(r=>({id:r.id,...r.data})),P.growth(lots.map(r=>r.data)),now,six?{...six.data,status:six.current_status}:null),source_ids:[account.id,...topups.map(r=>r.id),...lots.map(r=>r.id),...(six?[six.id]:[])]};
}
// Never add legacy topups/growth to wallet totals: the same receipt may already be present in both.
// Retain the independently reviewed old entitlement; use the better *whole* active entitlement.
function choose(legacy,wallet){
 if(legacy.reason==='REFUND_REVIEW_REQUIRED'||!wallet)return legacy;
 if(!legacy.active)return wallet;
 if(!wallet.active)return legacy;
 return wallet.level>legacy.level||(wallet.level===legacy.level&&wallet.valid_until>legacy.valid_until)?wallet:legacy;
}
module.exports={read,choose};
