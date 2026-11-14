'use strict';
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {run}=require('./marking'),{error}=require('../party/policy');
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v),nonempty=v=>typeof v==='string'&&v.trim().length>0;
function audioInfo(probe,mediaType){
 const format={'audio/wav':'wav','audio/mpeg':'mp3'}[mediaType],streams=probe?.streams,duration=Number(probe?.format?.duration);
 if(!format||probe?.format?.format_name!==format||!Array.isArray(streams)||streams.length!==1||streams[0].codec_type!=='audio'||!Number.isFinite(duration)||duration<=0||duration>1800)throw error('MEDIA_FORMAT_UNSUPPORTED',409);
 return {audio_format:format,duration_ms:Math.round(duration*1000)};
}
async function inspectAudio(body,{ffprobe,mediaType}={}){
 if(!Buffer.isBuffer(body)||!body.length||body.length>50*1024*1024)throw error('MEDIA_INPUT_INVALID',400);
 if(typeof ffprobe!=='string'||!path.isAbsolute(ffprobe))throw error('MEDIA_PROCESS_NOT_CONFIGURED',503);
 const format={'audio/wav':'wav','audio/mpeg':'mp3'}[mediaType];if(!format)throw error('MEDIA_FORMAT_UNSUPPORTED',409);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'jx-moderation-audio-'));
 try{
  await fs.writeFile(path.join(dir,'source.'+format),body,{flag:'wx'});
  const probe=JSON.parse((await run(ffprobe,['-v','error','-protocol_whitelist','file,pipe','-format_whitelist',format,'-show_streams','-show_format','-of','json','source.'+format],{cwd:dir,timeout:10000})).toString('utf8'));
  return audioInfo(probe,mediaType);
 }finally{if(path.dirname(dir)===path.resolve(os.tmpdir())&&path.basename(dir).startsWith('jx-moderation-audio-'))await fs.rm(dir,{recursive:true,force:true});}
}
function audioDecision(body,{dataId,taskId,inspection}={}){
 if(!object(body)||Number(body.code)!==200||!object(body.data)||!nonempty(body.requestId)||!nonempty(dataId)||!nonempty(taskId))throw error('MODERATION_RESULT_UNKNOWN',503);
 const d=body.data;if(d.dataId!==dataId||d.taskId!==undefined&&d.taskId!==taskId)throw error('MODERATION_RESULT_MISMATCH',503);
 const slices=d.sliceDetails,risks=[d.riskLevel];let complete=Array.isArray(slices)&&slices.length>0;
 if(Array.isArray(slices))for(const slice of slices){
  if(!object(slice)){complete=false;continue;}
  // Slice times are seconds; validate structure, not continuous/full-duration coverage.
  if(!Number.isFinite(slice.startTime)||!Number.isFinite(slice.endTime)||slice.startTime<0||slice.endTime<=slice.startTime)complete=false;
  if(slice.riskLevel!==undefined)risks.push(slice.riskLevel);
  else if(!Array.isArray(slice.result)||!slice.result.length)complete=false;
  if(slice.result!==undefined){if(!Array.isArray(slice.result)||!slice.result.length)complete=false;else for(const part of slice.result)risks.push(part?.riskLevel);}
 }
 if(!risks.every(v=>['none','low','medium','high'].includes(v)))complete=false;
 const verdict=risks.includes('high')?'REJECT':complete&&risks.every(v=>v==='none')?'PASS':'REVIEW';
 return {decision:verdict,provider_request_id:body.requestId,provider_task_id:taskId,automated:true,coverage:{version:'AUDIO_SLICES_V1',audio_format:inspection?.audio_format||null,duration_ms:inspection?.duration_ms||null,slice_count:Array.isArray(slices)?slices.length:null,slice_result_complete:complete}};
}
module.exports={inspectAudio,audioInfo,audioDecision};
