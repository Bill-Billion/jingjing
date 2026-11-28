'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {targets,allowed}=require('./pm03-phone-targets.cjs');
test('only original seeded numbers and two explicit synthetic change targets are admitted',()=>{
 const accounts={buyer:{phone:'19910000000'},stock_buyer:{phone:'19910000001'}};
 const state={synthetic_only:true,mode:'BATCH',accounts,scenarios:{phone_change:targets(accounts)}};
 assert.equal(allowed(state,accounts.buyer.phone),true);
 for(const r of Object.values(state.scenarios.phone_change))assert.equal(allowed(state,r.new_phone),true);
 assert.equal(allowed(state,'19910009999'),false);
 assert.equal(allowed({...state,mode:'STOCK_NOTICE'},state.scenarios.phone_change.buyer.new_phone),false);
 assert.equal(allowed({...state,synthetic_only:false},accounts.buyer.phone),false);
 assert.equal(allowed({...state,scenarios:{phone_change:{buyer:{new_phone:'19910009999'}}}},'19910009999'),false);
 assert.equal(allowed({...state,accounts:{}},state.scenarios.phone_change.buyer.new_phone),false);
});
