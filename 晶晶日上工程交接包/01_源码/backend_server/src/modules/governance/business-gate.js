'use strict';
const {assertUsable}=require('../providers/readiness');
const {shape,error}=require('../party/policy');
const requirements=Object.freeze({START_PAYMENT:'PaymentProvider',START_IDENTITY_CHECK:'IdentityProvider',START_SIGNING:'ESignProvider',START_DIGITAL_HUMAN:'DigitalHumanProvider'});
// Necessary service precondition, not proof of payment/signature/license or business permission.
// Bindings and environment come only from server startup, never from a request or saved terms.
function createBusinessGate({governance,readiness,environment,bindings={}}){
 if(!['SANDBOX','PRODUCTION'].includes(environment))throw error('INVALID_GATE_ENVIRONMENT',400);
 const services={...bindings};
 return Object.freeze({
  async check(context,input){
   shape(input,['snapshot_id','party_id','action']);
   if(!Object.hasOwn(requirements,input.action))throw error('UNKNOWN_BUSINESS_ACTION',400);
   await governance.readSnapshotForParty(context,{snapshot_id:input.snapshot_id,party_id:input.party_id});
   const blocked=reason=>({action:input.action,environment,current_status:'NOT_ENABLED',reason_code:reason});
   const binding=services[input.action];
   if(!binding)return blocked('PROVIDER_NOT_IMPLEMENTED');
   if(binding.provider?.provider_kind!==requirements[input.action]||binding.provider?.environment!==environment)return blocked('PROVIDER_ENVIRONMENT_MISMATCH');
   try{
    await assertUsable(readiness,binding.provider,await binding.inspect());
    return {action:input.action,environment,current_status:'SERVICE_READY',reason_code:null};
   }catch(cause){
    const known=['PROVIDER_NOT_IMPLEMENTED','PROVIDER_NOT_CONFIGURED','PROVIDER_ENVIRONMENT_NOT_VERIFIED','PROVIDER_NOT_VERIFIED','PROVIDER_CONFIGURATION_CHANGED','VERIFICATION_EVIDENCE_REQUIRED'];
    return blocked(known.includes(cause?.code)?cause.code:'PROVIDER_STATE_UNAVAILABLE');
   }
  },
  async assertReady(context,input){
   const result=await this.check(context,input);
   if(result.current_status!=='SERVICE_READY')throw error('BUSINESS_NOT_ENABLED',503);
   return result;
  },
 });
}
module.exports={createBusinessGate,requirements};
