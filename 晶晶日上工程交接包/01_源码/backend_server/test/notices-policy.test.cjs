 'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),P=require('../src/modules/notices/policy');
const r={topup_threshold_minor:30000,membership_days:365,growth_thresholds:[10000,50000,200000,500000,1000000]};
const f=(kind,amount,occurred_at)=>({kind,amount,occurred_at});
test('real topups unlock but do not grant growth; threshold/expiry and later restoration',()=>{
 const t='2026-01-01T00:00:00.000Z';assert.equal(P.scout(r,[f('TOPUP',29999,t)],t).active,false);
 const first=[f('TOPUP',30000,t)];assert.equal(P.scout(r,first,t).level,1);assert.equal(P.scout(r,first,'2027-01-01T00:00:00.000Z').active,false);
 assert.equal(P.scout(r,[...first,f('GROWTH',50000,t)],t).level,3);
 assert.equal(P.scout(r,[...first,f('TOPUP',30000,'2028-01-01T00:00:00.000Z')],'2028-01-02T00:00:00.000Z').valid_until,'2028-12-31T00:00:00.000Z');
});
test('prepayment cannot purchase many years or level six; refunds suspend pending review',()=>{
 const t='2026-01-01T00:00:00.000Z';assert.equal(P.scout(r,[f('TOPUP',90000,t)],t).valid_until,'2027-01-01T00:00:00.000Z');
 assert.equal(P.scout(r,[f('TOPUP',30000,t),f('GROWTH',1000000,t)],t).level,5);
 assert.equal(P.scout(r,[f('TOPUP',30000,t),f('REVERSAL',1,t)],t).reason,'REFUND_REVIEW_REQUIRED');
});
test('typed notices reject unknown fields and private contact bait',()=>{
 assert.throws(()=>P.text('https://example.test'),{code:'NOTICE_PRIVATE_CONTACT_FORBIDDEN'});
 assert.throws(()=>P.text('请加微信'),{code:'NOTICE_PRIVATE_CONTACT_FORBIDDEN'});
 assert.throws(()=>P.notice({type:'COMMERCIAL',title:'x',description:'x',city:'x',valid_from:'2026-01-01T00:00:00.000Z',valid_until:'2027-01-01T00:00:00.000Z',details:{deliverables:'x',requirements:'x',venue:'x'},project_id:null,accept_submissions:false}),{code:'INVALID_INPUT'});
});

test('confirmed publishing thresholds cannot be weakened by an operator rule',()=>{
 const rule={version:'test',...r,submission_days:30,terms:'synthetic',minimum_levels:{DRAMA:1,PERFORMANCE:1,COMMERCIAL:1,EVENT:1,RECRUITMENT:1,OFFICIAL:null}};
 assert.throws(()=>P.rule(rule),{code:'NOTICE_RULE_INVALID'});rule.minimum_levels.EVENT=3;assert.equal(P.rule(rule).minimum_levels.EVENT,3);
});
