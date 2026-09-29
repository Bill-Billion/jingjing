 'use strict';
const {createAdapter}=require('./adapter');
const {createReadinessRepository}=require('./readiness');
function createSmsProvider(db,env=process.env) {
 const required=['VOLC_ACCESS_KEY_ID','VOLC_SECRET_ACCESS_KEY','SMS_ACCOUNT','SMS_SIGN_NAME','SMS_LOGIN_TEMPLATE_ID','SMS_CONFIG_REVISION'];
 const configured=env.SMS_ENABLED==='true'&&required.every(k=>typeof env[k]==='string'&&env[k].length>0);
 // SDK debug output includes request bodies; never enable it for verification messages.
 if(configured&&(env.DEBUG||process.env.DEBUG))throw Error('SMS_DEBUG_LOGGING_FORBIDDEN');
 let client;
 return createAdapter({provider:{provider_kind:'SmsProvider',provider_code:'volcengine',capability_code:'login_sms',environment:env.NODE_ENV==='production'?'PRODUCTION':'SANDBOX'},
  repository:createReadinessRepository(db),inspect:async()=>({implemented:true,configured,config_revision:env.SMS_CONFIG_REVISION}),
  operations:{send:async({phone,code},{signal})=>{
   if(!client){const {SmsService}=require('@volcengine/openapi').sms;client=new SmsService({accessKeyId:env.VOLC_ACCESS_KEY_ID,secretKey:env.VOLC_SECRET_ACCESS_KEY,region:env.SMS_REGION||'cn-north-1'});}
   // Never retry this external side effect automatically; timeout leaves the challenge unusable.
   const response=await client.Send({SmsAccount:env.SMS_ACCOUNT,Sign:env.SMS_SIGN_NAME,TemplateID:env.SMS_LOGIN_TEMPLATE_ID,TemplateParam:JSON.stringify({code}),PhoneNumbers:phone},{signal,timeout:10000,maxRedirects:0});
   if(response?.ResponseMetadata?.Error||!response?.ResponseMetadata?.RequestId||!response?.Result?.MessageID?.[0])throw Error('SMS_ACCEPTANCE_NOT_CONFIRMED');
   return {accepted:true,provider_request_id:response.ResponseMetadata.RequestId};
  }},
 });
}
module.exports={createSmsProvider};
