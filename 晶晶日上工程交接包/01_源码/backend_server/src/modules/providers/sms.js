 'use strict';
const {createAdapter}=require('./adapter');
const {createReadinessRepository}=require('./readiness');
const {sendSms}=require('./sms-transport');
function createSmsProvider(db,env=process.env,{request}={}) {
 // A composed provider keeps one stable configuration until the next composition.
 const config={...env};
 const required=['VOLC_ACCESS_KEY_ID','VOLC_SECRET_ACCESS_KEY','SMS_ACCOUNT','SMS_SIGN_NAME','SMS_LOGIN_TEMPLATE_ID','SMS_CONFIG_REVISION'];
 const configured=['test','development','production'].includes(config.NODE_ENV)&&config.SMS_ENABLED==='true'&&required.every(k=>typeof config[k]==='string'&&config[k].trim().length>0);
 if(config.SMS_ENABLED==='true'&&(config.DEBUG||process.env.DEBUG||config.NODE_DEBUG||process.env.NODE_DEBUG))throw Error('SMS_DEBUG_LOGGING_FORBIDDEN');
 return createAdapter({provider:{provider_kind:'SmsProvider',provider_code:'volcengine',capability_code:'login_sms',environment:config.NODE_ENV==='production'?'PRODUCTION':'SANDBOX'},
  repository:createReadinessRepository(db),inspect:async()=>({implemented:true,configured,config_revision:config.SMS_CONFIG_REVISION}),
  operations:{send:(input,{signal})=>sendSms(config,input,{signal,request})},
 });
}
module.exports={createSmsProvider};
