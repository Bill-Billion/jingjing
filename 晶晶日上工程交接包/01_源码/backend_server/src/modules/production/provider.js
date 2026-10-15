 'use strict';
const {createAdapter}=require('../providers/adapter');
const {createReadinessRepository,assertUsable}=require('../providers/readiness');
const {error}=require('../party/policy');
// A concrete supplier is registered in trusted server code, never by HTTP or dynamic module paths.
// No supplier/product is currently approved in this repository. The default remains not implemented.
function createProductionProvider(db,env={},binding=null){
 const environment=env.NODE_ENV==='production'?'PRODUCTION':'SANDBOX';
 const identity={provider_kind:'DigitalHumanProvider',provider_code:binding?.provider_code||'unselected',capability_code:'long_lived_production',environment};
 const repository=createReadinessRepository(db);
 const inspect=async()=>{if(!binding)return {implemented:false,configured:false,config_revision:'unselected'};const info=await binding.inspect();return {...info,configured:binding.recover_by_key===true&&info.configured};};
 const adapter=createAdapter({provider:identity,repository,inspect,operations:binding?{submit:binding.submit,query:binding.query}:{}});
 return Object.freeze({
  async descriptor(){const info=await inspect();return {provider_code:identity.provider_code,environment,config_revision:info.config_revision};},
  async assertReady(){await assertUsable(repository,identity,await inspect());},
  async readiness(){try{await this.assertReady();return {current_status:'SERVICE_READY',reason_code:null,...await this.descriptor()};}catch(e){return {current_status:'NOT_ENABLED',reason_code:['PROVIDER_NOT_IMPLEMENTED','PROVIDER_NOT_CONFIGURED','PROVIDER_NOT_VERIFIED','PROVIDER_CONFIGURATION_CHANGED','VERIFICATION_EVIDENCE_REQUIRED'].includes(e.code)?e.code:'PROVIDER_STATE_UNAVAILABLE',...await this.descriptor()};}},
  async submit(input){return adapter.call('submit',input);},
  async query(input){return adapter.call('query',input);},
 });
}
module.exports={createProductionProvider};
