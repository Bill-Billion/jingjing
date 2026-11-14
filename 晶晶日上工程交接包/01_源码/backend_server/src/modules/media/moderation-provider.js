"use strict";
const {digest}=require('../governance/content'),{error}=require('../party/policy');
const {createAdapter}=require('../providers/adapter');
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const nonempty=v=>typeof v==='string'&&v.trim().length>0;
const knownRisk=v=>['none','low','medium','high'].includes(v);
function decision(body,{dataId,taskId,video=false,hasAudio}={}){
 if(!object(body)||Number(body.code)!==200||!object(body.data)||!nonempty(body.requestId))throw error('MODERATION_RESULT_UNKNOWN',503);
 const d=body.data;if(dataId&&d.dataId!==dataId||taskId&&d.taskId!==taskId)throw error('MODERATION_RESULT_MISMATCH',503);
 let risk=d.riskLevel;if(!risk&&typeof d.reason==='string'){try{risk=JSON.parse(d.reason).riskLevel;}catch{}}
 let verdict=risk==='none'?'PASS':risk==='high'?'REJECT':'REVIEW',coverage;
 if(video){
  const f=object(d.frameResult)?d.frameResult:null,a=object(d.audioResult)?d.audioResult:null;
  const frames=!!f&&Number.isSafeInteger(f.frameNum)&&f.frameNum>0&&knownRisk(f.riskLevel),audio=!!a&&knownRisk(a.riskLevel),required=hasAudio!==false;
  const risks=[risk,f?.riskLevel];if(a)risks.push(a.riskLevel);
  let malformed=d.audioResult!==undefined&&d.audioResult!==null&&!object(d.audioResult);
  for(const [list,kind] of [[f?.frames,'frame'],[a?.sliceDetails,'audio']]){
   if(list===undefined)continue;
   if(!Array.isArray(list)){malformed=true;continue;}
   for(const item of list){
    if(!object(item)){malformed=true;continue;}
    if(item.riskLevel!==undefined)risks.push(item.riskLevel);
    else if(kind==='frame'||!Array.isArray(item.result)||!item.result.length)malformed=true;
    if(kind==='audio'&&item.result!==undefined){if(!Array.isArray(item.result))malformed=true;else for(const part of item.result)risks.push(part?.riskLevel);}
   }
  }
  verdict=risks.includes('high')?'REJECT':frames&&(!required||audio)&&!malformed&&risks.every(x=>x==='none')?'PASS':'REVIEW';
  coverage={version:'VIDEO_FRAME_AUDIO_V1',video_has_audio:typeof hasAudio==='boolean'?hasAudio:null,frame_count:frames?f.frameNum:null,frame_result_complete:frames,audio_result_required:required,audio_result_complete:audio};
 }
 return {decision:verdict,provider_request_id:body.requestId,provider_task_id:d.taskId||null,automated:true,...coverage?{coverage}:{}};
}
function createModerationProvider(db,env={},clientFactory){
 const environment=env.MODERATION_ENVIRONMENT==='PRODUCTION'?'PRODUCTION':'SANDBOX';
 const config={result_revision:'VIDEO_FRAME_AUDIO_V1_AUDIO_SLICES_V1_TEXT_SEGMENTS_V1',ffprobe:env.MEDIA_FFPROBE||null,environment,region:env.MODERATION_REGION||null,accessKeyId:env.MODERATION_ACCESS_KEY_ID||null,accessKeySecret:env.MODERATION_ACCESS_KEY_SECRET||null,text:env.MODERATION_TEXT_SERVICE||null,image:env.MODERATION_IMAGE_SERVICE||null,video:env.MODERATION_VIDEO_SERVICE||null,audio:env.MODERATION_AUDIO_SERVICE||null,bucket:env.OSS_BUCKET||null,ossRegion:env.OSS_REGION||null};
 const configured=env.MEDIA_MODERATION_ENABLED==='true'&&['cn-shanghai','cn-beijing','cn-hangzhou','cn-shenzhen','cn-chengdu'].includes(config.region)&&!!config.accessKeyId&&!!config.accessKeySecret&&environment===(env.NODE_ENV==='production'?'PRODUCTION':'SANDBOX');
 const inspect=()=>({implemented:true,configured,config_revision:digest(config)});let client;
 const get=()=>{if(!client){const SDK=require('@alicloud/green20220302'),OpenAPI=require('@alicloud/openapi-client');client=clientFactory?clientFactory():new SDK.default(new OpenAPI.Config({accessKeyId:config.accessKeyId,accessKeySecret:config.accessKeySecret,regionId:config.region,endpoint:'green-cip.'+config.region+'.aliyuncs.com',protocol:'HTTPS',connectTimeout:5000,readTimeout:10000}));}return client;};
 const adapter=createAdapter({provider:{provider_kind:'ModerationProvider',provider_code:'aliyun-green',capability_code:'file_review',environment},repository:require('../providers/readiness').createReadinessRepository(db),inspect,operations:{async inspect(i){
  const SDK=require('@alicloud/green20220302');let response;
  const audio=['audio/wav','audio/mpeg'].includes(i.media_type);
  if(i.provider_task_id&&i.media_type!=='video/mp4'&&!audio)throw error('MODERATION_FORMAT_UNSUPPORTED',409);
  if(audio){
   if(!['audio_media_detection','audio_media_detection_pro'].includes(config.audio))throw error('MODERATION_FORMAT_UNSUPPORTED',409);
   const {inspectAudio,audioDecision}=require('./moderation-audio'),checked=await inspectAudio(i.body,{ffprobe:config.ffprobe,mediaType:i.media_type});
   if(i.provider_task_id){
    response=await get().voiceModerationResult(new SDK.VoiceModerationResultRequest({service:config.audio,serviceParameters:JSON.stringify({taskId:i.provider_task_id})}));
    if(Number(response.body?.code)===280){const d=response.body?.data;if(!nonempty(response.body?.requestId)||d?.taskId!==undefined&&d.taskId!==i.provider_task_id||d?.dataId!==undefined&&d.dataId!==i.data_id)throw error('MODERATION_RESULT_MISMATCH',503);return {pending:true,provider_task_id:i.provider_task_id};}
    return audioDecision(response.body,{dataId:i.data_id,taskId:i.provider_task_id,inspection:checked});
   }
  }
  const inspection=i.media_type==='video/mp4'?await require('./moderation-video').inspectVideo(i.body,{ffprobe:config.ffprobe}):null;
  if(i.provider_task_id){if(!config.video)throw error('MODERATION_FORMAT_UNSUPPORTED',409);response=await get().videoModerationResult(new SDK.VideoModerationResultRequest({service:config.video,serviceParameters:JSON.stringify({taskId:i.provider_task_id})}));if(Number(response.body?.code)===280){if(response.body?.data?.taskId&&response.body.data.taskId!==i.provider_task_id||response.body?.data?.dataId&&response.body.data.dataId!==i.data_id)throw error('MODERATION_RESULT_MISMATCH',503);return {pending:true,provider_task_id:i.provider_task_id};}return decision(response.body,{dataId:i.data_id,taskId:i.provider_task_id,video:true,hasAudio:inspection.has_audio});}
  if(i.media_type==='text/plain'){
   const content=new TextDecoder('utf-8',{fatal:true}).decode(i.body);if(!content||[...content].length>600||!config.text)throw error('MODERATION_TEXT_SCOPE_UNSUPPORTED',409);
   response=await get().textModeration(new SDK.TextModerationRequest({service:config.text,serviceParameters:JSON.stringify({content,dataId:i.data_id})}));return decision(response.body,{dataId:i.data_id});
  }
  if(!config.bucket||!/^oss-cn-[a-z]+$/.test(config.ossRegion||''))throw error('MODERATION_OSS_NOT_CONFIGURED',503);
  const params={ossRegionId:config.ossRegion.slice(4),ossBucketName:config.bucket,ossObjectName:i.object_key,dataId:i.data_id};
  if(audio){response=await get().voiceModeration(new SDK.VoiceModerationRequest({service:config.audio,serviceParameters:JSON.stringify(params)}));const b=response.body;if(Number(b?.code)!==200||!nonempty(b.requestId)||!nonempty(b.data?.taskId)||b.data?.dataId!==i.data_id)throw error('MODERATION_RESULT_UNKNOWN',503);return {pending:true,provider_task_id:b.data.taskId,provider_request_id:b.requestId};}
  if(['image/png','image/jpeg'].includes(i.media_type)&&config.image){response=await get().imageModeration(new SDK.ImageModerationRequest({service:config.image,serviceParameters:JSON.stringify(params)}));return decision(response.body,{dataId:i.data_id});}
  if(i.media_type==='video/mp4'&&config.video){response=await get().videoModeration(new SDK.VideoModerationRequest({service:config.video,serviceParameters:JSON.stringify(params)}));const b=response.body;if(Number(b?.code)!==200||!nonempty(b.requestId)||!nonempty(b.data?.taskId)||b.data?.dataId!==i.data_id)throw error('MODERATION_RESULT_UNKNOWN',503);return {pending:true,provider_task_id:b.data.taskId,provider_request_id:b.requestId};}
  throw error('MODERATION_FORMAT_UNSUPPORTED',409);
 }}});
 return {inspect,identity:adapter.identity,run:input=>adapter.call('inspect',input,{})};
}
module.exports={createModerationProvider,decision};
