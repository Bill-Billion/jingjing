 'use strict';
const {error,id,ref}=require('../party/policy');
// Only verified provider observations reach the repository. HTTP cannot supply proofs.
function createTradeService(repository,providers){
 function providerFor(r){const p=providers.get(r.data.provider);for(const k of ['environment','app_id','merchant_id'])if(p.config[k]!==r.data[k])throw error('PAYMENT_CONFIGURATION_CHANGED',503);return p;}
 async function dispatch(ctx,r,party,kind){const p=providerFor(r);await p.assertReady();const claim=await repository.claim(ctx,r.id,party,kind);if(!claim.dispatch)return claim.record;try{const result=await p.call(kind==='PAYMENT'?'create':'refund',{...claim.record.data,id:r.id});return await repository.dispatchResult(r.id,result);}catch{await repository.dispatchResult(r.id,null,true);throw error('PROVIDER_OUTCOME_UNKNOWN',503);}}
 return Object.freeze({
 async startPayment(ctx,input){const order=await repository.read(ctx,{record_id:input.order_id,party_id:input.party_id});if(order.kind!=='ORDER')throw error('TRADE_NOT_FOUND',404);const p=providers.get(order.data.quote.channel);await p.assertReady();const r=await repository.preparePayment(ctx,input,p.config);return dispatch(ctx,r,input.party_id,'PAYMENT');},
 async reconcilePayment(ctx,{record_id,party_id,transaction_id}){const r=await repository.paymentForActor(ctx,id(record_id),party_id),p=providerFor(r);if(r.data.provider==='APPLE')ref(transaction_id);else if(transaction_id!==null)throw error('INVALID_TRANSACTION_REFERENCE',400);const proof=await p.call('query',{...r.data,id:r.id,transaction_id:transaction_id||r.data.transaction_id});return repository.applyPayment(proof);},
 async executeRefund(ctx,{record_id}){const r=await repository.refundForActor(ctx,id(record_id),null);return dispatch(ctx,r,null,'REFUND');},
 async reconcileRefund(ctx,{record_id,party_id}){const r=await repository.refundForActor(ctx,id(record_id),party_id),p=providerFor(r);let proof;try{proof=await p.refundQuery({...r.data,id:r.id});}catch{throw error('PROVIDER_QUERY_UNAVAILABLE',503);}if(r.data.provider==='APPLE'){await repository.applyPayment(proof);return repository.refundForActor(ctx,r.id,party_id);}return repository.applyRefund(r.id,proof);},
 async notification(code,body){let proof;try{proof=await providers.get(code).notification(body);}catch{throw error('INVALID_PAYMENT_NOTIFICATION',400);}return repository.applyPayment(proof);},
 });
}
module.exports={createTradeService};
