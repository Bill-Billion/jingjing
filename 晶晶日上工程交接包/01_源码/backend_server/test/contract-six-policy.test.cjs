'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),P=require('../src/modules/guardians/policy'),A=require('../src/modules/trade/acceptance-policy'),R=require('../src/modules/engagement/referral-contract');
const rule={version:'CONTRACT_20261029',daily_minutes:60,rest_minutes:15,single_minor:100,daily_minor:500,night_start:22,night_end:8,terms:'Synthetic reviewed configuration'};
test('guardian rules have no implicit amount or time default',()=>{
 assert.deepEqual(P.rules(rule),rule);for(const field of ['daily_minutes','single_minor','daily_minor','terms']){const x={...rule};delete x[field];assert.throws(()=>P.rules(x));}
 assert.throws(()=>P.controls({enabled:true,daily_minutes:61,single_minor:100,daily_minor:500},rule));assert.throws(()=>P.controls({enabled:true,daily_minutes:60,single_minor:101,daily_minor:500},rule));
});
test('guardian night restrictions use China local time and cannot be disabled by a child',()=>{
 const d={age_band:'AGE_14_17',controls:{enabled:true}},u={slot_until:'2099-01-01T00:00:00.000Z'};
 for(const at of ['2026-11-02T14:00:00.000Z','2026-11-02T23:59:59.999Z'])assert.throws(()=>P.use(d,at,u),{code:'MINOR_NIGHT_RESTRICTED'});
 assert.equal(P.use(d,'2026-11-02T00:00:00.000Z',u),true);
 assert.throws(()=>P.use({...d,age_band:'UNDER_14'},'2026-11-02T04:00:00.000Z',u),{code:'UNDER_14_PROCESSING_DISABLED'});
 assert.throws(()=>P.use({...d,controls:{enabled:false}},'2026-11-02T04:00:00.000Z',u),{code:'GUARDIAN_DISABLED'});
 assert.throws(()=>P.use(d,'2026-11-02T04:00:00.000Z',{slot_until:'2026-11-02T04:00:00.000Z'}),{code:'GUARDIAN_USAGE_SESSION_REQUIRED'});
});
test('new acceptance contract requires exactly 48 hours while retaining legacy shapes',()=>{
 assert.equal(A.validate({acceptance_hours:72}).acceptance_hours,72);
 for(const hours of [0,47,49,72])assert.throws(()=>A.validate({acceptance_policy:A.VERSION,acceptance_hours:hours}),{code:'ACCEPTANCE_CONTRACT_MISMATCH'});
 assert.equal(A.validate({acceptance_policy:A.VERSION,acceptance_hours:48}).acceptance_hours,48);
 assert.throws(()=>A.validate({acceptance_policy:'UNKNOWN',acceptance_hours:48}));
});
test('all four new referral rates must be configured in range, not just one field',()=>{
 const x={referral_contract_policy:R.VERSION,referral_bps:{STOCK:1000,AUDITION:1500,CUSTOMIZATION:1200,COMMERCIAL:1300}};
 assert.equal(R.validate(x),x);for(const category of Object.keys(x.referral_bps))for(const rate of [0,500,999,1501,10000])assert.throws(()=>R.validate({...x,referral_bps:{...x.referral_bps,[category]:rate}}),{code:'REFERRAL_CONTRACT_RATE_MISMATCH'});
});
