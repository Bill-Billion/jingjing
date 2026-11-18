'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {audioInfo,audioDecision}=require('../src/modules/media/moderation-audio');
const options={dataId:'expected',taskId:'original-task',inspection:{audio_format:'wav',duration_ms:1000}};
const result=(data={})=>({code:200,requestId:'request',data:{dataId:'expected',riskLevel:'none',sliceDetails:[{startTime:0,endTime:1,riskLevel:'none'}],...data}});
test('voice results bind supplied dataId and original query task without inventing a mandatory returned taskId',()=>{
 assert.equal(audioDecision(result(),options).provider_task_id,'original-task');
 assert.equal(audioDecision(result({taskId:'original-task'}),options).decision,'PASS');
 for(const data of [{dataId:'wrong'},{dataId:undefined},{taskId:'wrong'},{taskId:null}])assert.throws(()=>audioDecision(result(data),options),{code:'MODERATION_RESULT_MISMATCH'});
 for(const body of [null,{},result(),{...result(),requestId:' '},{...result(),code:280}]){if(body?.requestId==='request'&&body.code===200)assert.throws(()=>audioDecision(body,{}));else assert.throws(()=>audioDecision(body,options));}
});
test('empty malformed unknown low and medium audio results require review',()=>{
 for(const sliceDetails of [undefined,null,{},[],[null],[{}],[{startTime:'0',endTime:1,riskLevel:'none'}],[{startTime:1,endTime:0,riskLevel:'none'}],[{startTime:0,endTime:1,riskLevel:'unknown'}],[{startTime:0,endTime:1,result:[]}],[{startTime:0,endTime:1,riskLevel:'none',result:'bad'}]])assert.equal(audioDecision(result({sliceDetails}),options).decision,'REVIEW');
 for(const riskLevel of [undefined,'low','medium','unknown'])assert.equal(audioDecision(result({riskLevel}),options).decision,'REVIEW');
});
test('high risk anywhere remains rejected even with malformed or clean surrounding results',()=>{
 for(const data of [{riskLevel:'high',sliceDetails:[]},{sliceDetails:[{riskLevel:'high'}]},{sliceDetails:[{startTime:0,endTime:1,riskLevel:'none',result:[{riskLevel:'high'}]}]}])assert.equal(audioDecision(result(data),options).decision,'REJECT');
});
test('nested SDK slice results are conservative and do not leak transcripts or temporary URLs',()=>{
 const slice={startTime:0,endTime:1,text:'private',url:'https://private.invalid',result:[{riskLevel:'none'}]},r=audioDecision(result({sliceDetails:[slice]}),options);assert.equal(r.decision,'PASS');assert.equal(r.coverage.slice_result_complete,true);assert.ok(!JSON.stringify(r).includes('private'));
 slice.result.push({});assert.equal(audioDecision(result({sliceDetails:[slice]}),options).decision,'REVIEW');
});
test('audio inspection accepts only bounded single-stream matching WAV or MP3',()=>{
 const probe={streams:[{codec_type:'audio'}],format:{format_name:'wav',duration:'1'}};assert.deepEqual(audioInfo(probe,'audio/wav'),{audio_format:'wav',duration_ms:1000});
 for(const p of [{...probe,streams:[]},{...probe,streams:[...probe.streams,{codec_type:'video'}]},{...probe,format:{format_name:'mp3',duration:1}},...[0,-1,1801,'bad'].map(duration=>({...probe,format:{...probe.format,duration}}))])assert.throws(()=>audioInfo(p,'audio/wav'),{code:'MEDIA_FORMAT_UNSUPPORTED'});
});
test('unconfigured or audio-only settings have stable inspectable revisions without silently enabling other modes',()=>{
 const {createModerationProvider}=require('../src/modules/media/moderation-provider');
 const empty=createModerationProvider({},{}).inspect();assert.equal(empty.configured,false);assert.match(empty.config_revision,/^[a-f0-9]{64}$/);
 const audio=createModerationProvider({},{NODE_ENV:'test',MEDIA_MODERATION_ENABLED:'true',MODERATION_REGION:'cn-shanghai',MODERATION_ACCESS_KEY_ID:'synthetic',MODERATION_ACCESS_KEY_SECRET:'synthetic',MODERATION_AUDIO_SERVICE:'audio_media_detection'}).inspect();assert.equal(audio.configured,true);assert.notEqual(audio.config_revision,empty.config_revision);
});
