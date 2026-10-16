"use strict";
const {createAdapter}=require('../providers/adapter');
const {createReadinessRepository,assertUsable}=require('../providers/readiness');
function createArtistIdentityProvider(db,env={},binding=null){
 const provider={provider_kind:'IdentityProvider',provider_code:binding?.provider_code||'unselected',capability_code:'artist_identity',environment:env.NODE_ENV==='production'?'PRODUCTION':'SANDBOX'},repository=createReadinessRepository(db);
 const inspect=async()=>{if(!binding)return {implemented:false,configured:false,config_revision:'unselected'};const info=await binding.inspect();return {...info,configured:binding.recover_by_key===true&&info.configured};};
 const adapter=createAdapter({provider,repository,inspect,operations:binding?{verify:binding.verify}:{}});
 return Object.freeze({async assertReady(){await assertUsable(repository,provider,await inspect());},async readiness(){try{await this.assertReady();return {current_status:'SERVICE_READY',reason_code:null};}catch(e){return {current_status:'NOT_ENABLED',reason_code:['PROVIDER_NOT_IMPLEMENTED','PROVIDER_NOT_CONFIGURED','PROVIDER_NOT_VERIFIED','PROVIDER_ENVIRONMENT_NOT_VERIFIED','PROVIDER_CONFIGURATION_CHANGED','VERIFICATION_EVIDENCE_REQUIRED'].includes(e.code)?e.code:'PROVIDER_STATE_UNAVAILABLE'};}},async verify(input){return adapter.call('verify',input);}});
}
module.exports={createArtistIdentityProvider};
