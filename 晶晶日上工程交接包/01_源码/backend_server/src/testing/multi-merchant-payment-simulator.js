'use strict';
// Explicit test injection only. Each order keeps its merchant and provider binding.
const {createPaymentSimulator}=require('./payment-simulator');
const {error}=require('../modules/party/policy');
async function createMultiMerchantSimulator(db,env,{merchant_party_ids,resolvePrincipal}){
 const sims=new Map();
 for(const merchant_party_id of new Set(merchant_party_ids.filter(Boolean)))sims.set(merchant_party_id,await createPaymentSimulator(db,env,{merchant_party_id,resolvePrincipal}));
 const first=sims.values().next().value;
 if(!first)throw error('SIMULATOR_MERCHANT_REQUIRED',503);
 return {simulation:true,
  get(code,record){const sim=sims.get(record?.merchant_party_id);if(!sim)throw error('SIMULATOR_MERCHANT_NOT_REGISTERED',503);return sim.get(code);},
  choose:first.choose,
 };
}
module.exports={createMultiMerchantSimulator};
