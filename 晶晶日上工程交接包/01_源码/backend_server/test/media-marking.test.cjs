"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {markVideo,run}=require('../src/modules/media/marking');
test('actual video bytes receive visible text and embedded AI metadata',{skip:!process.env.JX_TEST_FFMPEG},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'jx-mark-test-')),ffmpeg=process.env.JX_TEST_FFMPEG,ffprobe=process.env.JX_TEST_FFPROBE,fontFile=process.env.JX_TEST_FONT;
 try{await run(ffmpeg,['-nostdin','-v','error','-f','lavfi','-i','color=c=black:s=320x180:d=1','-c:v','libx264','-y','source.mp4'],{cwd:dir});const source=await fs.readFile(path.join(dir,'source.mp4'));
 for(const variant of ['preview','final']){const r=await markVideo(source,{ffmpeg,ffprobe,fontFile,ai_label:'AI generated',preview_label:'Preview only',variant,policy_sha256:'a'.repeat(64)});assert.equal(r.receipt.commercial_watermark,variant==='preview');assert.equal(r.receipt.visual_ai_label,true);assert.notDeepEqual(r.body,source);await fs.writeFile(path.join(dir,'output.mp4'),r.body);
 const decoded=await run(ffmpeg,['-v','error','-i','output.mp4','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{cwd:dir});let white=0;for(let y=5;y<35;y++)for(let x=5;x<150;x++)if(decoded[(y*320+x)*3]>100)white++;assert.ok(white>20,'decoded pixels must contain the actual visible top label');}
 await assert.rejects(markVideo(Buffer.from('invalid'),{ffmpeg,ffprobe,fontFile,ai_label:'AI',preview_label:'preview',variant:'preview',policy_sha256:'a'.repeat(64)}));
 }finally{if(path.dirname(dir)===path.resolve(os.tmpdir())&&path.basename(dir).startsWith('jx-mark-test-'))await fs.rm(dir,{recursive:true,force:true});}
});
test('unconfigured tools and invalid marking policy never claim processed output',async()=>{await assert.rejects(markVideo(Buffer.from('x'),{variant:'final',policy_sha256:'a'.repeat(64)}),{code:'MEDIA_PROCESS_NOT_CONFIGURED'});});
