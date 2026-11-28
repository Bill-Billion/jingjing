'use strict';
const path=require('node:path');
// Explicit local tool paths only. Never infer a production media provider.
function mediaEnvironment(env=process.env){
 const ffmpeg=env.MEDIA_FFMPEG||env.FFMPEG_PATH,ffprobe=env.MEDIA_FFPROBE||env.FFPROBE_PATH;
 if(!ffmpeg&&!ffprobe)return {};
 if(!ffmpeg||!ffprobe||!path.isAbsolute(ffmpeg)||!path.isAbsolute(ffprobe))throw Object.assign(Error('PM03_ABSOLUTE_MEDIA_TOOLS_REQUIRED'),{code:'PM03_ABSOLUTE_MEDIA_TOOLS_REQUIRED'});
 return {MEDIA_FFMPEG:ffmpeg,MEDIA_FFPROBE:ffprobe};
}
module.exports={mediaEnvironment};
