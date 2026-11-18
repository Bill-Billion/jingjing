'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {previewMarking,embedComment,readComment}=require('../src/modules/media/cover-marking');
const {markVideo,run}=require('../src/modules/media/marking'),{describeVideo}=require('../src/modules/media/video-preview');

test('partial or wrong-variant preview labels cannot become apparently complete cover metadata',()=>{
 const good={ai_label:'AI 生成',marking_policy_sha256:'a'.repeat(64),marking_variant:'preview'};
 assert.equal(previewMarking({artist:'private identity'}),null);
 assert.deepEqual(previewMarking({...good,artist:'private identity'}),good);
 for(const bad of [{...good,ai_label:''},{...good,ai_label:'AI\nlabel'},{...good,ai_label:'x'.repeat(101)},{...good,marking_policy_sha256:'wrong'},{...good,marking_variant:'final'},{ai_label:'AI'}])assert.throws(()=>previewMarking(bad),{code:'MEDIA_OUTPUT_NOT_VERIFIED'});
});

test('damaged JPEG headers and oversized comments are rejected instead of appending an unbound label',()=>{
 for(const bytes of [Buffer.from('not jpeg'),Buffer.from([255,216,255,254,0,1,255,217]),Buffer.from([255,216,255,254,255,255,255,217])]){
  assert.throws(()=>embedComment(bytes,'AI'),{code:'MEDIA_OUTPUT_NOT_VERIFIED'});assert.throws(()=>readComment(bytes),{code:'MEDIA_OUTPUT_NOT_VERIFIED'});
 }
 assert.throws(()=>embedComment(Buffer.from([255,216,255,218,0,2,255,217]),'x'.repeat(2049)),{code:'MEDIA_OUTPUT_NOT_VERIFIED'});
});

test('actual remuxed video with missing or wrong labels is refused before cover export',{skip:!process.env.JX_TEST_FFMPEG},async()=>{
 const ffmpeg=process.env.JX_TEST_FFMPEG,ffprobe=process.env.JX_TEST_FFPROBE,dir=await fs.mkdtemp(path.join(os.tmpdir(),'jx-cover-negative-'));
 try{
  await run(ffmpeg,['-nostdin','-v','error','-f','lavfi','-i','color=c=black:s=320x180:d=1','-c:v','libx264','-threads','2','-y','source.mp4'],{cwd:dir});const full=await fs.readFile(path.join(dir,'source.mp4'));
  const marked=await markVideo(full,{ffmpeg,ffprobe,fontFile:process.env.JX_TEST_FONT,ai_label:'Synthetic AI',preview_label:'Preview',variant:'preview',policy_sha256:'a'.repeat(64)});await fs.writeFile(path.join(dir,'marked.mp4'),marked.body);
  for(const change of ['ai_label=','marking_policy_sha256=','marking_variant=final']){
   await run(ffmpeg,['-nostdin','-v','error','-i','marked.mp4','-c','copy','-movflags','+use_metadata_tags','-metadata',change,'-y','bad.mp4'],{cwd:dir});await assert.rejects(describeVideo(full,await fs.readFile(path.join(dir,'bad.mp4')),{ffmpeg,ffprobe}),{code:'MEDIA_OUTPUT_NOT_VERIFIED'});
  }
 }finally{if(path.dirname(dir)===path.resolve(os.tmpdir())&&path.basename(dir).startsWith('jx-cover-negative-'))await fs.rm(dir,{recursive:true,force:true});}
});
