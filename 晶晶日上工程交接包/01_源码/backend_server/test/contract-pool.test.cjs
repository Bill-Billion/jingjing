'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),P=require('../src/modules/redemption/contract-pool'),L=require('../src/modules/redemption/lottery-policy');
test('contract candidate preserves all stated probabilities and requires explicit cost basis',()=>{
 const costs=Object.fromEntries(P.prizes.map(([key])=>[key,0])),cost_basis={source_ref:'synthetic reviewed costing; not launch approval',single_consumption_minor:3000,ten_consumption_minor:27000};
 assert.throws(()=>P.candidate({costs:{},cost_basis}),{code:'LOTTERY_REVIEWED_COST_REQUIRED'});
 const c=P.candidate({costs,cost_basis});assert.equal(c.prizes.length,11);assert.equal(c.prizes.reduce((n,p)=>n+p.weight,0),10000);assert.equal(c.prizes.find(p=>p.key==='free').weight,5);
 const bad=structuredClone(c);bad.prizes[0].weight++;bad.prizes[1].weight--;assert.throws(()=>L.pool(bad),{code:'LOTTERY_CONTRACT_PROBABILITY_MISMATCH'});
 assert.throws(()=>P.candidate({costs:{...costs,open:100000},cost_basis}),{code:'LOTTERY_CONTRACT_COST_LIMIT'});
 const equal=Object.fromEntries(P.prizes.map(([key])=>[key,3]));assert.doesNotThrow(()=>P.candidate({costs:equal,cost_basis:{...cost_basis,single_consumption_minor:300,ten_consumption_minor:3000}}));
 assert.throws(()=>P.candidate({costs:equal,cost_basis:{...cost_basis,single_consumption_minor:299,ten_consumption_minor:3000}}),{code:'LOTTERY_CONTRACT_COST_LIMIT'});
 const d=L.distribution(c);assert(d.forced_tenth_branch_probability>0);assert.notEqual(d.prizes[0].single_probability,d.prizes[0].tenth_probability);
});
test('binding rejects substituted coupon faces and no-price free film, retains legacy snapshots',()=>{
 const c={source_profile:'CONTRACT_20261029'},bindings=P.prizes.map(([key,kind])=>({key,stock_id:['NONE','POINT_BACK'].includes(kind)?null:key,point_back:kind==='POINT_BACK'?100:0}));
 const stocks=new Map(P.prizes.map(([key,kind,,face])=>[key,{data:{template:{production:{face_minor:face||10000,spec_ids:['reviewed exact spec']}}}}]));
 P.checkBindings(c,bindings,stocks);stocks.get('credit50').data.template.production.face_minor=10000;assert.throws(()=>P.checkBindings(c,bindings,stocks),{code:'LOTTERY_CONTRACT_PRIZE_MISMATCH'});
 assert.doesNotThrow(()=>P.checkBindings({},bindings,stocks));
});
