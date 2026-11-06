'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../src/modules/customization/quote-policy');
const line=(total,mode='SCRIPT_BEFORE_INTERIM')=>({line_id:'film',total_minor:total,product_profile:{type:'PRIVATE_CUSTOMIZATION'},specification:{customization_delivery:{preview_payment_order:mode}}});
const steps=(lines,kind='SCRIPT')=>P.schedule(lines).triggers.map((trigger,i)=>({key:String(i),trigger,allocations:lines.map(l=>({line_id:l.line_id,amount_minor:P.amounts(l.total_minor,kind)[i]}))}));
test('new frozen specification requires script and 30/40/30, never legacy 30/60/10',()=>{
 const lines=[line(10001)],v=steps(lines);assert.deepEqual(v.map(s=>s.allocations[0].amount_minor),[3000,4000,3001]);assert.equal(P.plan(lines,v),v);
 const bad=structuredClone(v);bad[1].trigger='CUSTOMIZATION_INTERIM_CONFIRMED';assert.throws(()=>P.plan(lines,bad),{code:'CUSTOMIZATION_PAYMENT_PLAN_INVALID'});
 assert.throws(()=>P.plan(lines,steps(lines,'LEGACY')),{code:'CUSTOMIZATION_PAYMENT_PLAN_INVALID'});
});
test('old terms, manual sample 50/50 and mixed-version rejection stay explicit',()=>{
 const old=[line(10001,'PREVIEW_BEFORE_INTERIM')];assert.deepEqual(P.plan(old,steps(old,'LEGACY')).map(s=>s.allocations[0].amount_minor),[3000,6000,1001]);
 const manual=[{line_id:'film',total_minor:1001,product_profile:{type:'MANUAL_SAMPLE'}}];assert.deepEqual(P.plan(manual,steps(manual,'MANUAL_SAMPLE')).map(s=>s.allocations[0].amount_minor),[500,501]);
 assert.throws(()=>P.schedule([line(100),{...line(100,'PREVIEW_BEFORE_INTERIM'),line_id:'other'}]),{code:'CUSTOMIZATION_PAYMENT_PLAN_INVALID'});
 assert.throws(()=>P.schedule([{...line(100),product_profile:{type:'MANUAL_SAMPLE'}}]),{code:'CUSTOMIZATION_PAYMENT_PLAN_INVALID'});
});
test('rounding conserves every cent including full entitlement, without floating-point money',()=>{
 for(const total of [0,10,11,101,10001,Number.MAX_SAFE_INTEGER])for(const kind of ['SCRIPT','LEGACY','MANUAL_SAMPLE']){
  const a=P.amounts(total,kind);assert.equal(a.reduce((s,n)=>s+BigInt(n),0n),BigInt(total));assert.ok(a.every(Number.isSafeInteger));
 }
});
