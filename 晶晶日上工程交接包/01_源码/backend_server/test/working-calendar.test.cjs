"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../src/modules/production/working-calendar'),P=require('../src/modules/production/customization-policy'),Cut=require('../src/modules/customization/contract-policy');
const cal=()=>({version:'synthetic1',source_ref:'synthetic:not-official-holidays',timezone:'Asia/Shanghai',valid_from:'2026-01-01',valid_until:'2027-12-31',non_working_dates:[],working_dates:[]});
const terms=()=>({version:'new1',source_ref:'synthetic:contract13',preview_payment_order:'SCRIPT_BEFORE_INTERIM',acceptance_hours:null,acceptance_working_days:5,acceptance_calendar:cal(),cancellation_terms:'synthetic'});
test('five working days excludes receipt day and ends at 23:59:59.999 Shanghai',()=>{
 const r=C.workingDeadline('2026-01-02T02:00:00.000Z',5,cal());assert.equal(r.deadline_at,'2026-01-09T15:59:59.999Z');assert.equal(r.deadline_basis.received_date,'2026-01-02');
 assert.equal(C.workingDeadline('2026-01-04T16:00:00.000Z',5,cal()).deadline_at,'2026-01-12T15:59:59.999Z');
});
test('explicit synthetic holiday and weekend makeup day are honored across a year boundary',()=>{
 const c=cal();c.non_working_dates=['2026-01-05'];c.working_dates=['2026-01-10'];assert.equal(C.workingDeadline('2026-01-02T02:00:00.000Z',5,c).deadline_basis.deadline_date,'2026-01-10');
 assert.equal(C.workingDeadline('2026-12-30T03:00:00.000Z',5,cal()).deadline_basis.deadline_date,'2027-01-06');
});
test('missing coverage never invents future working days or falls back to 120 hours',()=>{
 for(const c of [{...cal(),valid_until:'2026-01-08'},{...cal(),valid_from:'2026-01-03'}])assert.throws(()=>C.workingDeadline('2026-01-02T02:00:00.000Z',5,c),{code:'CUSTOMIZATION_CALENDAR_COVERAGE_REQUIRED'});
});
test('calendar rejects impossible dates, duplicate/conflicting overrides, unknown fields and timezone',()=>{
 for(const c of [{...cal(),valid_from:'2026-02-30'},{...cal(),timezone:'UTC'},{...cal(),non_working_dates:['2026-01-05','2026-01-05']},{...cal(),non_working_dates:['2026-01-05'],working_dates:['2026-01-05']},{...cal(),working_dates:['2028-01-01']},{...cal(),guess_holidays:true}])assert.throws(()=>C.calendar(c));
 assert.doesNotThrow(()=>C.calendar({...cal(),valid_from:'2028-02-29',valid_until:'2028-03-31'}));
});
test('new contract only times final delivery; old hours remain unchanged',()=>{
 const t=P.terms(terms());for(const stage of ['SCRIPT','SAMPLE','ROUGH_CUT'])assert.deepEqual(C.deadline(t,stage,'2026-01-02T02:00:00.000Z'),{deadline_at:null,deadline_basis:{mode:'EXPLICIT_CONFIRMATION'}});
 assert.equal(C.deadline(t,'FINAL','2026-01-02T02:00:00.000Z').deadline_at,'2026-01-09T15:59:59.999Z');
 assert.equal(C.deadline({acceptance_hours:120},'SCRIPT','2026-01-02T02:00:00.000Z').deadline_at,'2026-01-07T02:00:00.000Z');
 for(const bad of [{...terms(),acceptance_hours:120},{...terms(),acceptance_working_days:4},{...terms(),acceptance_calendar:undefined},{...terms(),preview_payment_order:'PREVIEW_BEFORE_INTERIM'}])assert.throws(()=>P.terms(bad));
});
test('frozen clock basis must match dates and calendar; pre-final stage never auto accepts',()=>{
 const t=terms(),started_at='2026-01-02T02:00:00.000Z',r={started_at,...C.deadline(t,'FINAL',started_at)};C.verifyReceipt(t,'FINAL',r);
 for(const changed of [{...r,deadline_at:'2026-01-03T00:00:00.000Z'},{...r,deadline_basis:{...r.deadline_basis,calendar_version:'other'}},{...r,deadline_basis:null}])assert.throws(()=>C.verifyReceipt(t,'FINAL',changed),{code:'CUSTOMIZATION_ACCEPTANCE_CLOCK_MISMATCH'});
 assert.throws(()=>C.verifyReceipt(t,'SCRIPT',r),{code:'CUSTOMIZATION_ACCEPTANCE_CLOCK_MISMATCH'});
});
test('release policy requires both new payment and working days; invalid config cannot silently disable',()=>{
 const line={product_profile:{type:'PRIVATE_CUSTOMIZATION'},specification:{customization_delivery:terms()}};
 Cut.newQuote([line],'CONTRACT_20261029');Cut.newQuote([{product_profile:{type:'MANUAL_SAMPLE'}}],'CONTRACT_20261029');Cut.newQuote([{}],'LEGACY_COMPATIBLE');
 for(const x of [{},{...line,specification:{}},{...line,specification:{customization_delivery:{...terms(),acceptance_working_days:undefined}}}])assert.throws(()=>Cut.newQuote([x],'CONTRACT_20261029'),{code:'CUSTOMIZATION_CONTRACT_VERSION_REQUIRED'});
 assert.equal(Cut.configuration(undefined),'LEGACY_COMPATIBLE');for(const v of ['',null,'contract20261029'])assert.throws(()=>Cut.configuration(v),{code:'INVALID_CUSTOMIZATION_CONTRACT_POLICY'});
});

test('official-source 2026 candidate includes spring-festival and national-day makeups; never guesses 2027',()=>{
 const c=require('../../../../docs/operations/calendars/CN_2026.json');C.calendar(c);
 assert.equal(C.workingDeadline('2026-02-13T03:00:00.000Z',5,c).deadline_basis.deadline_date,'2026-02-27');
 assert.equal(C.workingDeadline('2026-09-30T03:00:00.000Z',5,c).deadline_basis.deadline_date,'2026-10-13');
 assert.throws(()=>C.workingDeadline('2026-12-30T03:00:00.000Z',5,c),{code:'CUSTOMIZATION_CALENDAR_COVERAGE_REQUIRED'});
});

test('release guard refuses an expired calendar when creating or approving a quote',()=>{
 const line={product_profile:{type:'PRIVATE_CUSTOMIZATION'},specification:{customization_delivery:terms()}};
 assert.throws(()=>Cut.newQuote([line],'CONTRACT_20261029','2028-01-01T00:00:00.000Z'),{code:'CUSTOMIZATION_CALENDAR_COVERAGE_REQUIRED'});
});
