'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {randomUUID:id}=require('node:crypto');
const {createVersion,submitVersion,reviewVersion,withdrawVersion,reviewProgress}=require('../src/modules/works/version-policy');
const at='2026-09-25T00:00:00.000Z',later='2026-09-25T00:01:00.000Z';
const input=()=>({id:id(),work_id:id(),revision:1,kind:'ORIGINAL',source_version_id:null,project_id:null,owner_party_id:id(),title:'合成测试作品',content_asset_id:id(),content_sha256:'a'.repeat(64),evidence_ids:[id()]});
const submit=r=>submitVersion(r,{expected_version:r.object_version,recorded_at:at});
const review=(r,channel,decision='APPROVED')=>reviewVersion(r,{expected_version:r.object_version,channel,decision,reviewer_account_id:id(),evidence_ref:'synthetic:review',reason:'合成核对记录，不代表真实审核',recorded_at:later});
test('original and project adaptation are distinct and require explicit source/project references',()=>{
 const data=input();assert.equal(createVersion(data).content.kind,'ORIGINAL');
 assert.throws(()=>createVersion({...data,project_id:id()}),{code:'ORIGINAL_CANNOT_BE_PROJECT_ADAPTATION'});
 assert.throws(()=>createVersion({...data,kind:'PROJECT_ADAPTATION'}),{code:'INVALID_ID'});
 const adaptation=createVersion({...data,kind:'PROJECT_ADAPTATION',source_version_id:id(),project_id:id()});assert.equal(adaptation.content.kind,'PROJECT_ADAPTATION');
 assert.throws(()=>createVersion({...adaptation.content,source_version_id:data.id}),{code:'SELF_REFERENCING_VERSION'});
});
test('caller cannot inject commercial approval or omit explicit metadata',()=>{
 const data=input();assert.throws(()=>createVersion({...data,licensed:true}),{code:'INVALID_INPUT'});
 const {owner_party_id,...missing}=data;assert.throws(()=>createVersion(missing),{code:'MISSING_FIELD'});
 assert.throws(()=>createVersion({...data,revision:2}),{code:'FIRST_REVISION_REQUIRED'});
 assert.throws(()=>createVersion({...data,content_sha256:['a'.repeat(64)]}),{code:'INVALID_CONTENT_HASH'});
});
test('output is detached and deeply frozen, preventing later edits from changing the old version',()=>{
 const data=input(),record=createVersion(data),saved=record.content.evidence_ids[0];data.title='changed';data.evidence_ids[0]=id();
 assert.equal(record.content.title,'合成测试作品');assert.equal(record.content.evidence_ids[0],saved);
 assert.throws(()=>{record.content.title='change';},TypeError);assert.throws(()=>record.reviews.push({}),TypeError);
});
test('evidence references alone do not approve rights and missing material prevents submission',()=>{
 const record=createVersion({...input(),evidence_ids:[]});assert.equal(reviewProgress(record),'DRAFT');
 assert.throws(()=>submit(record),{code:'RIGHTS_EVIDENCE_REQUIRED'});
 assert.equal(reviewProgress(submit(createVersion(input()))),'AWAITING_REVIEW');
});
test('evidence identifiers must be bounded, unique UUIDs and never public URLs',()=>{
 const data=input();assert.throws(()=>createVersion({...data,evidence_ids:[data.evidence_ids[0],data.evidence_ids[0]]}),{code:'INVALID_EVIDENCE_LIST'});
 assert.throws(()=>createVersion({...data,evidence_ids:Array.from({length:101},id)}),{code:'INVALID_EVIDENCE_LIST'});
 assert.throws(()=>createVersion({...data,evidence_ids:['https://example.invalid/private']}),{code:'INVALID_ID'});
 assert.throws(()=>createVersion({...data,evidence_ids:new Array(1)}),{code:'INVALID_ID'});
});
test('rights and content each need a separate review, in either order',()=>{
 for(const order of [['RIGHTS','CONTENT'],['CONTENT','RIGHTS']]){
  let record=submit(createVersion(input()));record=review(record,order[0]);assert.equal(reviewProgress(record),'AWAITING_REVIEW');
  record=review(record,order[1]);assert.equal(reviewProgress(record),'REVIEWS_COMPLETE');
  assert.equal(record.current_status,'SUBMITTED');assert.equal(record.license_granted,undefined);assert.equal(record.published,undefined);
  assert.ok(record.reviews.every(r=>r.version_id===record.content.id));
 }
});
test('content approval never overrides rejected rights or a request for more materials',()=>{
 for(const decision of ['REJECTED','CHANGES_REQUESTED']){
  const record=review(review(submit(createVersion(input())),'RIGHTS',decision),'CONTENT');assert.equal(reviewProgress(record),decision);
 }
});
test('review cannot occur before submission, overwrite an existing decision or use a stale version',()=>{
 const draft=createVersion(input());assert.throws(()=>review(draft,'RIGHTS'),{code:'WORK_NOT_SUBMITTED'});
 const sent=submit(draft),approved=review(sent,'RIGHTS');assert.throws(()=>review(approved,'RIGHTS'),{code:'REVIEW_ALREADY_RECORDED'});
 assert.throws(()=>reviewVersion(approved,{expected_version:sent.object_version,channel:'CONTENT',decision:'APPROVED',reviewer_account_id:id(),evidence_ref:'test',reason:'test',recorded_at:later}),{code:'VERSION_CONFLICT'});
 assert.throws(()=>submit(sent),{code:'WORK_NOT_DRAFT'});
});
test('new revision preserves identity, changes content without inheriting old reviews',()=>{
 const old=review(review(submit(createVersion(input())),'RIGHTS'),'CONTENT');
 const next=createVersion({...old.content,id:id(),revision:2,title:'修改稿',content_asset_id:id(),content_sha256:'b'.repeat(64)},old);
 assert.equal(reviewProgress(old),'REVIEWS_COMPLETE');assert.equal(reviewProgress(next),'DRAFT');assert.equal(next.reviews.length,0);assert.equal(next.submitted_at,null);
 for(const field of ['work_id','owner_party_id'])assert.throws(()=>createVersion({...next.content,[field]:id()},old),{code:'WORK_IDENTITY_CHANGED'});
 assert.throws(()=>createVersion({...next.content,id:old.content.id},old),{code:'INVALID_NEXT_REVISION'});
 assert.throws(()=>createVersion({...next.content,revision:3},old),{code:'INVALID_NEXT_REVISION'});
});
test('adaptation may explicitly cite a newer original while retaining the same project identity',()=>{
 const old=createVersion({...input(),kind:'PROJECT_ADAPTATION',source_version_id:id(),project_id:id()});
 const next=createVersion({...old.content,id:id(),revision:2,source_version_id:id()},old);assert.notEqual(next.content.source_version_id,old.content.source_version_id);
 assert.throws(()=>createVersion({...next.content,project_id:id()},old),{code:'WORK_IDENTITY_CHANGED'});
});
test('withdrawal preserves reviews and prevents further submission or review',()=>{
 const approved=review(review(submit(createVersion(input())),'RIGHTS'),'CONTENT');
 const withdrawn=withdrawVersion(approved,{expected_version:approved.object_version,reason:'合成撤回',recorded_at:later});
 assert.equal(reviewProgress(withdrawn),'WITHDRAWN');assert.deepEqual(withdrawn.reviews,approved.reviews);assert.equal(reviewProgress(approved),'REVIEWS_COMPLETE');
 assert.throws(()=>review(withdrawn,'CONTENT'),{code:'WORK_NOT_SUBMITTED'});assert.throws(()=>submit(withdrawn),{code:'WORK_NOT_DRAFT'});
 assert.throws(()=>withdrawVersion(withdrawn,{expected_version:withdrawn.object_version,reason:'again',recorded_at:later}),{code:'WORK_ALREADY_WITHDRAWN'});
});
test('invalid timestamps, unknown channels and missing reasons are rejected',()=>{
 const sent=submit(createVersion(input()));assert.throws(()=>review(sent,'UNKNOWN'),{code:'INVALID_REVIEW'});
 const command={expected_version:sent.object_version,channel:'RIGHTS',decision:'APPROVED',reviewer_account_id:id(),evidence_ref:'test',reason:'test',recorded_at:later};
 assert.throws(()=>reviewVersion(sent,{...command,reason:''}),{code:'INVALID_DISPLAY_NAME'});
 assert.throws(()=>reviewVersion(sent,{...command,recorded_at:'2026-02-30T00:00:00.000Z'}),{code:'INVALID_INSTANT'});
 assert.throws(()=>reviewVersion(sent,{...command,recorded_at:'2026-01-01T00:00:00.000Z'}),{code:'INVALID_REVIEW_TIME'});
});
test('malformed stored state cannot be reported as reviewed',()=>{
 const sent=submit(createVersion(input())),approved=review(review(sent,'RIGHTS'),'CONTENT');
 assert.throws(()=>reviewProgress({...approved,object_version:1}),{code:'INVALID_WORK_STATE'});
 assert.throws(()=>reviewProgress({...approved,reviews:approved.reviews.map(r=>({...r,version_id:id()}))}),{code:'INVALID_REVIEW'});
 assert.throws(()=>reviewProgress({...approved,withdrawal:{reason:'fake',recorded_at:later}}),{code:'INVALID_WORK_STATE'});
});
