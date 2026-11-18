"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../src/modules/artists/commerce-admission');
const at='2026-11-02T00:00:00.000Z',person={current_status:'ACTIVE',identity_status:'VERIFIED',identity_valid_until:'2027-01-01T00:00:00.000Z',age_band:'ADULT'};
const record=level=>({current_status:'APPROVED',data:{level,valid_from:'2026-01-01T00:00:00.000Z',valid_until:'2027-01-01T00:00:00.000Z'}});
test('manual review is distinct from L1 and is bounded by status and both dates',()=>{
 assert.equal(P.manualReviewApproved([record(1)],at),false);assert.equal(P.manualReviewApproved([record(2)],at),true);
 for(const status of ['SUBMITTED','NEEDS_MATERIAL','REJECTED','WITHDRAWN'])assert.equal(P.manualReviewApproved([{...record(2),current_status:status}],at),false);
 for(const patch of [{valid_from:'2027-01-01T00:00:00.000Z'},{valid_until:at},{valid_from:undefined}])assert.equal(P.manualReviewApproved([{...record(2),data:{...record(2).data,...patch}}],at),false);
});
test('stock admission requires identity, L1 and manual review; approval never verifies identity',()=>{
 assert.equal(P.stockStatus(person,[record(1),record(2)],at).eligible,true);
 assert.deepEqual(P.stockStatus(person,[record(1)],at).blocking_reasons,['STOCK_HALO_REVIEW_REQUIRED']);
 assert.equal(P.stockStatus({...person,identity_status:'UNVERIFIED'},[record(1),record(2)],at).eligible,false);
 assert.equal(P.stockStatus({...person,age_band:'MINOR'},[record(1),record(2)],at).eligible,false);
});
