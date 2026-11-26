'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{mediaEnvironment}=require('./pm03-media.cjs');
test('unconfigured environments do not claim processing and partial or relative tools are rejected',()=>{
 assert.deepEqual(mediaEnvironment({}),{});
 for(const env of [{FFMPEG_PATH:'ffmpeg',FFPROBE_PATH:'ffprobe'},{FFMPEG_PATH:path.resolve('ffmpeg')},{FFPROBE_PATH:path.resolve('ffprobe')}])assert.throws(()=>mediaEnvironment(env),{code:'PM03_ABSOLUTE_MEDIA_TOOLS_REQUIRED'});
});
test('explicit operator tool paths reach the two media settings without forwarding other environment values',()=>{
 const a=path.resolve('synthetic-tools/ffmpeg'),b=path.resolve('synthetic-tools/ffprobe');assert.deepEqual(mediaEnvironment({FFMPEG_PATH:a,FFPROBE_PATH:b,UNRELATED_PRIVATE_VALUE:'not-forwarded'}),{MEDIA_FFMPEG:a,MEDIA_FFPROBE:b});assert.deepEqual(mediaEnvironment({MEDIA_FFMPEG:a,MEDIA_FFPROBE:b}),{MEDIA_FFMPEG:a,MEDIA_FFPROBE:b});
});
