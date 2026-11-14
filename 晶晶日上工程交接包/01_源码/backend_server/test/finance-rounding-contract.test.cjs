'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID:id}=require('node:crypto'),R=require('../src/modules/settlement/rounding-policy'),M=require('../src/modules/settlement/marketplace-policy'),C=require('../src/modules/customization/finance-policy');
const platform=id(),supplier=id(),mcn=id(),referrer=id();
const base={model:'V5_TWO_LAYER',product_type:'STOCK_VIDEO',fee_base:'NET_PAID',platform_party_id:platform,platform_bps:1800,supplier_party_id:supplier,mcn_party_id:mcn,mcn_supply_bps:2000,referrer_party_id:referrer,referral_bps:1500,rounding:R.MODERN};
test('new fen allocation stays nonnegative and conserved through partial refunds and maximal amounts',()=>{
 for(const p of [1800,2200])for(const m of [1000,1001,2000,2999,3000])for(const r of [1000,1500])for(const n of [0,1,2,3,5,7,9,10,11,25,99,101,10001,900000000000]){
 const result=M.split(n,{...base,platform_bps:p,mcn_supply_bps:m,referral_bps:r});assert.equal(result.entries.reduce((s,x)=>s+x.amount_minor,0),n);assert.ok(result.entries.every(x=>Number.isSafeInteger(x.amount_minor)&&x.amount_minor>=0));assert.ok(Math.abs(result.rounding_diff_minor)<=1);
 }
 const shares=[{party_id:platform,role:'PLATFORM',bps:1},...Array.from({length:28},()=>({party_id:id(),role:'PARTICIPANT',bps:333})),{party_id:id(),role:'PRODUCER',bps:675}];
 for(let n=0;n<200;n++){const result=C.split(n,shares,platform,R.MODERN);assert.equal(result.entries.reduce((s,x)=>s+x.amount_minor,0),n);assert.ok(result.entries.every(x=>x.amount_minor>=0));assert.ok(Math.abs(result.rounding_diff_minor)<=1);}
 const old=C.split(2,shares,platform);assert.equal(old.rounding_diff_minor,2);assert.equal(R.needsReview(old),true);
 assert(C.split(16,shares,platform).entries.some(x=>x.amount_minor<0));assert.deepEqual(C.split(2,shares,platform),old); // legacy remains explicit, never silently rewritten
});
test('new rule cutover is opt-in and does not alter historical calculation',()=>{
 const prev=process.env.FINANCE_ROUNDING_CONTRACT_POLICY;
 try{process.env.FINANCE_ROUNDING_CONTRACT_POLICY='CONTRACT_20261029';assert.throws(()=>R.newRule({marketplace_finance:{rounding:R.LEGACY}}),{code:'FINANCE_ROUNDING_RULE_REQUIRED'});R.newRule({marketplace_finance:{rounding:R.MODERN}});assert.equal(M.split(100,{...base,rounding:R.LEGACY}).net_minor,100);process.env.FINANCE_ROUNDING_CONTRACT_POLICY='typo';assert.throws(()=>R.newRule({}),{code:'INVALID_FINANCE_ROUNDING_POLICY'});}finally{if(prev===undefined)delete process.env.FINANCE_ROUNDING_CONTRACT_POLICY;else process.env.FINANCE_ROUNDING_CONTRACT_POLICY=prev;}
});
