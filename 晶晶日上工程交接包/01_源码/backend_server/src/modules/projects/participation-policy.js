"use strict";
const {id,shape,label,error}=require('../party/policy');
const T=require('../trade/policy'),F=require('../settlement/policy');
function terms(v,fee){
 shape(v,['mode','usage','exclusive','territory','language','valid_until','permitted_uses','prohibited_uses','installments','start_payment_keys','revenue','cancellation_terms']);
 if(!['FIXED_FEE','REVENUE_SHARE','MIXED'].includes(v.mode)||typeof v.exclusive!=='boolean')throw error('INVALID_PARTICIPATION_TERMS',400);
 if(!['EXISTING_MATERIAL','NEW_GENERATION'].includes(v.usage))throw error('INVALID_PARTICIPATION_USAGE',400);
 T.amount(fee,true);T.instant(v.valid_until);label(v.territory,100);label(v.language,100);label(v.permitted_uses,8000);label(v.prohibited_uses,8000);label(v.cancellation_terms,8000);
 if((v.mode==='REVENUE_SHARE')!==(fee===0))throw error('PARTICIPATION_FEE_MISMATCH',400);
 if(!Array.isArray(v.installments)||v.installments.length>20||!Array.isArray(v.start_payment_keys)||new Set(v.start_payment_keys).size!==v.start_payment_keys.length)throw error('INVALID_PARTICIPATION_INSTALLMENTS',400);
 const seen=new Set();let total=0;
 for(const x of v.installments){shape(x,['key','amount_minor','milestone']);require('../party/policy').ref(x.key);T.amount(x.amount_minor);label(x.milestone,2000);if(seen.has(x.key))throw error('INVALID_PARTICIPATION_INSTALLMENTS',400);seen.add(x.key);total+=x.amount_minor;}
 if(total!==fee||v.start_payment_keys.some(k=>!seen.has(k)))throw error('INVALID_PARTICIPATION_INSTALLMENTS',400);
 if(v.mode==='FIXED_FEE'){if(v.revenue!==null)throw error('PARTICIPATION_REVENUE_MISMATCH',400);}else{shape(v.revenue,['basis','shares','terms']);if(v.revenue.basis!=='VERIFIED_CHANNEL_NET_RECEIPTS')throw error('PARTICIPATION_REVENUE_BASIS_REQUIRED',400);F.shares(v.revenue.shares);label(v.revenue.terms,8000);}
 return T.copy(v);
}
function cast(v){shape(v,['person_id','look_version_id','voice_version_id']);id(v.person_id);id(v.look_version_id);if(v.voice_version_id!==null)id(v.voice_version_id);return T.copy(v);}
module.exports={terms,cast};
