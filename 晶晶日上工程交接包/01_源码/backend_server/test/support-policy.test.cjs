"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),P=require('../src/modules/support/policy');
test('support stages are role bounded and replies are not judgments',()=>{
 assert.equal(P.transition('SUBMITTED','START',true),'PROCESSING');assert.equal(P.transition('PROCESSING','REQUEST_INFO',true),'NEEDS_INFO');assert.equal(P.transition('NEEDS_INFO','SUPPLEMENT',false),'SUBMITTED');assert.equal(P.transition('ANSWERED','REOPEN',false),'SUBMITTED');
 for(const [s,a,staff] of [['SUBMITTED','ANSWER',true],['PROCESSING','CLOSE',false],['PROCESSING','ANSWER',false],['CLOSED','SUPPLEMENT',false]])assert.throws(()=>P.transition(s,a,staff));
});
test('support rejects excessive attachments and incomplete descriptions',()=>{assert.throws(()=>P.content({text:' ',asset_ids:[]}));assert.throws(()=>P.content({text:'x',asset_ids:Array(11).fill('x')}));assert.throws(()=>P.page({limit:101}));});
test('four message channels retain the established product categories',()=>{const {channel}=require('../src/modules/operations/unread');for(const [domain,event_code,expected] of [['TRADE','PAID','SYSTEM'],['NOTICES','SUBMITTED','SUBMISSION_INTENTS'],['ENGAGEMENT','VOTE_REVIEWED','ACTIVITY_VOTING'],['TRADE','COMMENT_CREATED','ORDER_CONVERSATIONS'],['AUDITION_MESSAGE','MESSAGE_CREATED','ORDER_CONVERSATIONS'],['GIG_MESSAGE','COMMERCIAL_MESSAGE_CREATED','ORDER_CONVERSATIONS']])assert.equal(channel({domain,event_code}),expected);});
