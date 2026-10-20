"use strict";
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process'),{createHash}=require('node:crypto');
const {error}=require('../party/policy');
function run(exe,args,{cwd,timeout=120000,maxOutput=1024*1024}={}){return new Promise((resolve,reject)=>{const child=spawn(exe,args,{cwd,windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});let settled=false,bytes=0,out=[],termination=null;const finish=(err,value)=>{if(settled)return;settled=true;clearTimeout(timer);err?reject(err):resolve(value);};const timer=setTimeout(()=>{termination=error('MEDIA_PROCESS_TIMEOUT',503);child.kill();},timeout);child.on('error',()=>finish(error('MEDIA_PROCESS_UNAVAILABLE',503)));for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{bytes+=b.length;if(bytes>maxOutput){termination=error('MEDIA_PROCESS_OUTPUT_LIMIT',503);child.kill();}else if(stream===child.stdout)out.push(b);});child.on('close',code=>finish(termination||(code===0?null:error('MEDIA_PROCESS_FAILED',503)),Buffer.concat(out)));});}
function text(v){if(typeof v!=='string'||!v.trim()||v.length>100||/[\x00-\x1f]/.test(v))throw error('MEDIA_MARKING_POLICY_INVALID',409);return v;}
async function markVideo(body,{ffmpeg,ffprobe,fontFile,ai_label,preview_label,variant,policy_sha256}={}){
 if(!Buffer.isBuffer(body)||!body.length||body.length>50*1024*1024||!['preview','final'].includes(variant)||!/^[a-f0-9]{64}$/.test(policy_sha256||''))throw error('MEDIA_MARKING_INPUT_INVALID',400);
 for(const file of [ffmpeg,ffprobe,fontFile])if(typeof file!=='string'||!path.isAbsolute(file))throw error('MEDIA_PROCESS_NOT_CONFIGURED',503);
 text(ai_label);if(variant==='preview')text(preview_label);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'jx-media-mark-'));
 try{
  await fs.writeFile(path.join(dir,'source.mp4'),body,{flag:'wx'});await fs.copyFile(fontFile,path.join(dir,'font.ttf'));
  const probe=async file=>JSON.parse((await run(ffprobe,['-v','error','-protocol_whitelist','file,pipe','-show_streams','-show_format','-of','json',file],{cwd:dir,timeout:15000})).toString('utf8'));
  const source=await probe('source.mp4'),video=source.streams?.filter(s=>s.codec_type==='video')||[],audio=source.streams?.filter(s=>s.codec_type==='audio')||[];
  if(video.length!==1||audio.length>1||source.streams.length!==video.length+audio.length||!source.format.format_name.split(',').includes('mp4')||!Number.isFinite(Number(source.format.duration))||Number(source.format.duration)<=0||Number(source.format.duration)>1800||video[0].width>4096||video[0].height>4096||video[0].width<160||video[0].height<90)throw error('MEDIA_FORMAT_UNSUPPORTED',409);
  await fs.writeFile(path.join(dir,'ai.txt'),ai_label,'utf8');await fs.writeFile(path.join(dir,'preview.txt'),preview_label||'','utf8');
  const filters=["drawtext=fontfile=font.ttf:textfile=ai.txt:expansion=none:fontcolor=white:fontsize=h/30:box=1:boxcolor=black@0.7:x=10:y=10"];
  if(variant==='preview')filters.push("drawtext=fontfile=font.ttf:textfile=preview.txt:expansion=none:fontcolor=white@0.65:fontsize=h/20:box=1:boxcolor=black@0.3:x=(w-tw)/2:y=(h-th)/2");
  await run(ffmpeg,['-nostdin','-v','error','-protocol_whitelist','file,pipe','-enable_drefs','0','-i','source.mp4','-map','0:v:0','-map','0:a:0?','-map_metadata','-1','-vf',filters.join(','),'-c:v','libx264','-preset','fast','-pix_fmt','yuv420p','-c:a','aac','-threads','2','-movflags','+faststart+use_metadata_tags','-metadata','ai_label='+ai_label,'-metadata','marking_policy_sha256='+policy_sha256,'-metadata','marking_variant='+variant,'-fs',String(50*1024*1024),'-y','result.mp4'],{cwd:dir});
  const checked=await probe('result.mp4'),stat=await fs.stat(path.join(dir,'result.mp4'));
  if(stat.size<=0||stat.size>=50*1024*1024||Math.abs(Number(checked.format.duration)-Number(source.format.duration))>0.5||checked.format.tags?.ai_label!==ai_label||checked.format.tags?.marking_policy_sha256!==policy_sha256||checked.format.tags?.marking_variant!==variant)throw error('MEDIA_OUTPUT_NOT_VERIFIED',503);
  const output=await fs.readFile(path.join(dir,'result.mp4')),sha=b=>createHash('sha256').update(b).digest('hex');if(sha(body)===sha(output))throw error('MEDIA_OUTPUT_NOT_VERIFIED',503);
  return {body:output,receipt:{source_sha256:sha(body),output_sha256:sha(output),output_bytes:output.length,policy_sha256,variant,visual_ai_label:true,commercial_watermark:variant==='preview',metadata_ai_label:true,processor:'ffmpeg-drawtext-v1',legal_compliance:'REQUIRES_REVIEWED_POLICY'}};
 }finally{const parent=path.resolve(os.tmpdir());if(path.dirname(path.resolve(dir))===parent&&path.basename(dir).startsWith('jx-media-mark-'))await fs.rm(dir,{recursive:true,force:true});}
}
module.exports={markVideo,run};
