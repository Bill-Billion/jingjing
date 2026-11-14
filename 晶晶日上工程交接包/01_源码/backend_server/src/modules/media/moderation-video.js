'use strict';
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {run}=require('./marking'),{videoInfo}=require('./video-preview'),{error}=require('../party/policy');
async function inspectVideo(body,{ffprobe}={}) {
 if(!Buffer.isBuffer(body)||!body.length||body.length>50*1024*1024)throw error('MEDIA_INPUT_INVALID',400);
 if(typeof ffprobe!=='string'||!path.isAbsolute(ffprobe))throw error('MEDIA_PROCESS_NOT_CONFIGURED',503);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'jx-moderation-video-'));
 try{
  await fs.writeFile(path.join(dir,'source.mp4'),body,{flag:'wx'});
  const probe=JSON.parse((await run(ffprobe,['-v','error','-protocol_whitelist','file,pipe','-format_whitelist','mov','-enable_drefs','0','-show_streams','-show_format','-of','json','source.mp4'],{cwd:dir,timeout:10000})).toString('utf8'));
  const info=videoInfo(probe);return {has_audio:probe.streams.some(s=>s.codec_type==='audio'),duration_ms:info.duration_ms};
 }finally{if(path.dirname(dir)===path.resolve(os.tmpdir())&&path.basename(dir).startsWith('jx-moderation-video-'))await fs.rm(dir,{recursive:true,force:true});}
}
module.exports={inspectVideo};
