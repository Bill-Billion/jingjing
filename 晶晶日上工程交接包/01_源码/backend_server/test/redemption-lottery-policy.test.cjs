'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),P=require('../src/modules/redemption/lottery-policy');
const rule={version:'synthetic-V2-default-calculation',single_points:300,ten_points:2700,algorithm:'NINE_THEN_CONDITIONAL_TENTH_V1',prizes:[
 {key:'priority',kind:'INTERVIEW_PRIORITY',weight:100,estimated_cost_minor:0},{key:'open',kind:'INTERVIEW_OPEN',weight:900,estimated_cost_minor:0},
 {key:'free',kind:'PRODUCTION_FREE',weight:5,estimated_cost_minor:162000},{key:'credit1000',kind:'PRODUCTION_CREDIT',weight:20,estimated_cost_minor:15000},
 {key:'credit500',kind:'PRODUCTION_CREDIT',weight:50,estimated_cost_minor:7500},{key:'credit200',kind:'PRODUCTION_CREDIT',weight:150,estimated_cost_minor:3000},
 {key:'credit100',kind:'PRODUCTION_CREDIT',weight:300,estimated_cost_minor:1500},{key:'credit50',kind:'PRODUCTION_CREDIT',weight:800,estimated_cost_minor:750},
 {key:'exposure',kind:'EXPOSURE',weight:1800,estimated_cost_minor:0},{key:'back',kind:'POINT_BACK',weight:3000,estimated_cost_minor:100},{key:'none',kind:'NONE',weight:2875,estimated_cost_minor:0}]};
test('V2 distribution includes ten-draw guarantee rather than advertising independent odds',()=>{
 const d=P.distribution(rule);assert.ok(Math.abs(d.prizes.reduce((n,p)=>n+p.expected_count_per_ten,0)-10)<1e-12);
 assert.ok(Math.abs(d.prizes.reduce((n,p)=>n+p.single_probability,0)-1)<1e-12);
 assert.ok(d.independent_ten_miss_probability>0.07&&d.independent_ten_miss_probability<0.072);
 assert.ok(d.expected_ten_cost_minor>d.expected_single_cost_minor*10);assert.ok(d.prizes.find(p=>p.key==='free').average_probability_per_ten_slot>0.0005);
});
test('nine misses force only last draw, 2700 charged as one batch; single costs 300',()=>{
 let calls=0;const d=P.draw(rule,10,max=>{calls++;return max-1;});assert.equal(calls,10);assert.equal(d.points,2700);assert.equal(d.results.filter(r=>r.guaranteed_slot).length,1);assert.equal(d.results[9].kind,'PRODUCTION_CREDIT');assert.equal(P.draw(rule,1,max=>max-1).points,300);
});
test('an earlier qualifying prize leaves tenth unchanged; exact random boundaries and invalid entropy',()=>{
 let calls=0;const d=P.draw(rule,10,max=>calls++===0?0:max-1);assert.equal(d.results[0].key,'priority');assert.equal(d.results[9].key,'none');assert.equal(d.results[9].guaranteed_slot,false);
 assert.equal(P.draw(rule,1,()=>100).results[0].key,'open');assert.throws(()=>P.draw(rule,1,max=>max),{code:'LOTTERY_ENTROPY_INVALID'});
});
test('incorrect sum, duplicate prize, disabled final interview, missing guarantee and fractional price reject',()=>{
 for(const mutation of [r=>r.prizes[0].weight++,r=>r.prizes[1].key=r.prizes[0].key,r=>r.prizes[0].kind='INTERVIEW_FINAL',r=>r.prizes.forEach(p=>p.kind='NONE'),r=>r.single_points=300.1]){const r=structuredClone(rule);mutation(r);assert.throws(()=>P.pool(r));}
});
