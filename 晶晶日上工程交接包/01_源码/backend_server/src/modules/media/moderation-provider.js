"use strict";
const {digest}=require('../governance/content'),{error}=require('../party/policy');
const {createAdapter}=require('../providers/adapter');
function decision(body,{dataId,taskId,video=false}={}){
 if(!body||Number(body.code)!==200||!body.data||typeof body.requestId!=='string')throw error('MODERATION_RESULT_UNKNOWN',503);
 const d=body.data;if(dataId&&d.dataId!==dataId||taskId&&d.taskId!==taskId)throw error('MODERATION_RESULT_MISMATCH',503);
 let risk=d.riskLevel;if(!risk&&typeof d.reason==='string'){try{risk=JSON.parse(d.reason).riskLevel;}catch{}}
 const verdict=risk==='none'?'PASS':risk==='high'?'REJECT':'REVIEW';
 // The provider response must cover the video frames. Missing coverage never passes.
 return {decision:video&&!d.frameResult?'REVIEW':verdict,provider_request_id:body.requestId,provider_task_id:d.taskId||null,automated:true};
}
function createModerationProvider(db,env={},clientFactory){
 const environment=env.MODERATION_ENVIRONMENT==='PRODUCTION'?'PRODUCTION':'SANDBOX';
 const config={environment,region:env.MODERATION_REGION,accessKeyId:env.MODERATION_ACCESS_KEY_ID,accessKeySecret:env.MODERATION_ACCESS_KEY_SECRET,text:env.MODERATION_TEXT_SERVICE,image:env.MODERATION_IMAGE_SERVICE,video:env.MODERATION_VIDEO_SERVICE,bucket:env.OSS_BUCKET,ossRegion:env.OSS_REGION};
 const configured=env.MEDIA_MODERATION_ENABLED==='true'&&['cn-shanghai','cn-beijing','cn-hangzhou','cn-shenzhen','cn-chengdu'].includes(config.region)&&!!config.accessKeyId&&!!config.accessKeySecret&&environment===(env.NODE_ENV==='production'?'PRODUCTION':'SANDBOX');
 const inspect=()=>({implemented:true,configured,config_revision:digest(config)});let client;
 const get=()=>{if(!client){const SDK=require('@alicloud/green20220302'),OpenAPI=require('@alicloud/openapi-client');client=clientFactory?clientFactory():new SDK.default(new OpenAPI.Config({accessKeyId:config.accessKeyId,accessKeySecret:config.accessKeySecret,regionId:config.region,endpoint:'green-cip.'+config.region+'.aliyuncs.com',protocol:'HTTPS',connectTimeout:5000,readTimeout:10000}));}return client;};
 const adapter=createAdapter({provider:{provider_kind:'ModerationProvider',provider_code:'aliyun-green',capability_code:'file_review',environment},repository:require('../providers/readiness').createReadinessRepository(db),inspect,operations:{async inspect(i){
  const SDK=require('@alicloud/green20220302');let response;
  if(i.provider_task_id){response=await get().videoModerationResult(new SDK.VideoModerationResultRequest({service:config.video,serviceParameters:JSON.stringify({taskId:i.provider_task_id})}));if(Number(response.body?.code)===280)return {pending:true,provider_task_id:i.provider_task_id};return decision(response.body,{dataId:i.data_id,taskId:i.provider_task_id,video:true});}
  if(i.media_type==='text/plain'){
   const content=new TextDecoder('utf-8',{fatal:true}).decode(i.body);if(!content||[...content].length>600||!config.text)throw error('MODERATION_TEXT_SCOPE_UNSUPPORTED',409);
   response=await get().textModeration(new SDK.TextModerationRequest({service:config.text,serviceParameters:JSON.stringify({content,dataId:i.data_id})}));return decision(response.body);
  }
  if(!config.bucket||!/^oss-cn-[a-z]+$/.test(config.ossRegion||''))throw error('MODERATION_OSS_NOT_CONFIGURED',503);
  const params={ossRegionId:config.ossRegion.slice(4),ossBucketName:config.bucket,ossObjectName:i.object_key,dataId:i.data_id};
  if(['image/png','image/jpeg'].includes(i.media_type)&&config.image){response=await get().imageModeration(new SDK.ImageModerationRequest({service:config.image,serviceParameters:JSON.stringify(params)}));return decision(response.body,{dataId:i.data_id});}
  if(i.media_type==='video/mp4'&&config.video){response=await get().videoModeration(new SDK.VideoModerationRequest({service:config.video,serviceParameters:JSON.stringify(params)}));const b=response.body;if(Number(b?.code)!==200||typeof b.data?.taskId!=='string'||b.data?.dataId!==i.data_id)throw error('MODERATION_RESULT_UNKNOWN',503);return {pending:true,provider_task_id:b.data.taskId,provider_request_id:b.requestId};}
  throw error('MODERATION_FORMAT_UNSUPPORTED',409);
 }}});
 return {inspect,identity:adapter.identity,run:input=>adapter.call('inspect',input,{})};
}
module.exports={createModerationProvider,decision};
