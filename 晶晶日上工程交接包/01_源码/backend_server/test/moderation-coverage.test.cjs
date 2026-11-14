'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {decision}=require('../src/modules/media/moderation-provider');
const good=()=>({code:200,requestId:'synthetic-request',data:{dataId:'source-task',taskId:'provider-task',riskLevel:'none',frameResult:{frameNum:2,riskLevel:'none'},audioResult:{riskLevel:'none'}}});
const options={video:true,dataId:'source-task',taskId:'provider-task',hasAudio:true};

test('empty, malformed and zero-frame results never automatically pass video review',()=>{
 for(const frame of [{},[],true,'yes',{frameNum:0,riskLevel:'none'},{frameNum:-1,riskLevel:'none'},{frameNum:'2',riskLevel:'none'},{frameNum:2},{frameNum:2,riskLevel:'new-value'}]){
  const body=good();body.data.frameResult=frame;assert.equal(decision(body,options).decision,'REVIEW',JSON.stringify(frame));
 }
});
test('video with audio or unknown audio presence requires a meaningful audio result',()=>{
 for(const audio of [undefined,null,{},[],true,{riskLevel:'unknown'}]){const body=good();body.data.audioResult=audio;assert.equal(decision(body,options).decision,'REVIEW');assert.equal(decision(body,{...options,hasAudio:undefined}).decision,'REVIEW');}
});
test('known high risk is never downgraded by missing coverage or a clean aggregate',()=>{
 for(const mutate of [b=>{b.data.riskLevel='high';delete b.data.frameResult;},b=>b.data.frameResult.riskLevel='high',b=>b.data.audioResult.riskLevel='high',b=>b.data.frameResult.frames=[{riskLevel:'high'}],b=>b.data.audioResult.sliceDetails=[{riskLevel:'high'}],b=>b.data.audioResult.sliceDetails=[{result:[{riskLevel:'high'}]}]]){
  const b=good();mutate(b);assert.equal(decision(b,options).decision,'REJECT');
 }
});
test('medium, low or unknown nested risks remain for review even when the aggregate says none',()=>{
 for(const risk of ['medium','low','unknown']){const b=good();b.data.audioResult.riskLevel=risk;assert.equal(decision(b,options).decision,'REVIEW');}
 const b=good();b.data.audioResult.sliceDetails=[{result:[{riskLevel:'medium'}]}];assert.equal(decision(b,options).decision,'REVIEW');
});
test('complete video results pass with auditable coverage, including verified silent video',()=>{
 const result=decision(good(),options);assert.equal(result.decision,'PASS');assert.equal(result.coverage.video_has_audio,true);assert.equal(result.coverage.frame_count,2);assert.equal(result.coverage.audio_result_complete,true);
 const silent=good();delete silent.data.audioResult;const r=decision(silent,{...options,hasAudio:false});assert.equal(r.decision,'PASS');assert.equal(r.coverage.audio_result_required,false);
 silent.data.audioResult=[];assert.equal(decision(silent,{...options,hasAudio:false}).decision,'REVIEW');
});
test('request identity and result identity are required before interpreting risk',()=>{
 for(const id of ['',null,undefined]){const b=good();b.requestId=id;assert.throws(()=>decision(b,options),{code:'MODERATION_RESULT_UNKNOWN'});}
 for(const field of ['dataId','taskId']){const b=good();b.data[field]='another-task';assert.throws(()=>decision(b,options),{code:'MODERATION_RESULT_MISMATCH'});}
});
test('text and image results retain reviewed low-risk policy and exact data binding',()=>{
 assert.equal(decision({code:200,requestId:'synthetic',data:{dataId:'text',reason:'{"riskLevel":"none"}'}},{dataId:'text'}).decision,'PASS');
 assert.equal(decision({code:200,requestId:'synthetic',data:{dataId:'image',riskLevel:'low'}},{dataId:'image'}).decision,'REVIEW');
 assert.throws(()=>decision({code:200,requestId:'synthetic',data:{dataId:'another',riskLevel:'none'}},{dataId:'text'}),{code:'MODERATION_RESULT_MISMATCH'});
});
