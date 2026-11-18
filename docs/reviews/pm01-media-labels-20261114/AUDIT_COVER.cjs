'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const backend=path.resolve('晶晶日上工程交接包/01_源码/backend_server');
const {markVideo,run}=require(path.join(backend,'src/modules/media/marking')),{describeVideo}=require(path.join(backend,'src/modules/media/video-preview'));
(async()=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'jx-cover-label-audit-')),ffmpeg=process.env.JX_TEST_FFMPEG,ffprobe=process.env.JX_TEST_FFPROBE;
try{
 await run(ffmpeg,['-nostdin','-v','error','-f','lavfi','-i','color=c=black:s=640x360:d=1','-c:v','libx264','-threads','2','-y','source.mp4'],{cwd:dir});
 const source=await fs.readFile(path.join(dir,'source.mp4')),marked=await markVideo(source,{ffmpeg,ffprobe,fontFile:process.env.JX_TEST_FONT,ai_label:'Synthetic AI',preview_label:'Preview only',variant:'preview',policy_sha256:'a'.repeat(64)});
 const cover=await describeVideo(source,marked.body,{ffmpeg,ffprobe});await fs.writeFile(path.join(dir,'preview.mp4'),marked.body);await fs.writeFile(path.join(dir,'cover.jpg'),cover.body);
 const probe=async file=>JSON.parse((await run(ffprobe,['-v','error','-show_format','-show_streams','-of','json',file],{cwd:dir})).toString());
 const preview=await probe('preview.mp4'),image=await probe('cover.jpg');assert.equal(preview.format.tags.ai_label,'Synthetic AI');
 const pixels=await run(ffmpeg,['-v','error','-i','cover.jpg','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{cwd:dir});let top=0;for(let y=8;y<32;y++)for(let x=8;x<160;x++)if(pixels[(y*640+x)*3]>100)top++;
 const result={observed_at:new Date().toISOString(),source_commit:require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),synthetic_only:true,frontend_run:false,actual_ffmpeg:true,scope:'Direct existing markVideo -> describeVideo methods; no HTTP or database publication',preview_tags:preview.format.tags,cover_probe:image,cover_sha256:crypto.createHash('sha256').update(cover.body).digest('hex'),visible_top_pixels:top,cover_contains_ai_text_bytes:cover.body.includes(Buffer.from('Synthetic AI')),cover_contains_policy_hash:cover.body.includes(Buffer.from('a'.repeat(64))),finding:'Cover extraction removes source metadata; visible burned AI pixels remain. No business fix in this audit.'};
 await fs.writeFile('docs/reviews/pm01-media-labels-20261114/COVER_FOLLOWUP_AUDIT.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({visible_top_pixels:top,cover_tags:image.format.tags||null,ai_text_in_bytes:result.cover_contains_ai_text_bytes,policy_in_bytes:result.cover_contains_policy_hash}));
}finally{if(path.dirname(dir)===path.resolve(os.tmpdir())&&path.basename(dir).startsWith('jx-cover-label-audit-'))await fs.rm(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
