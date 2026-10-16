'use strict';
const {error}=require('../party/policy');
// New customization only. Existing quote plans are never rewritten.
function plan(lines,steps){
 const triggers=['ORDER_ACCEPTED','CUSTOMIZATION_INTERIM_CONFIRMED','FINAL_ACCEPTED'];
 if(steps.length!==3||steps.some((s,i)=>s.trigger!==triggers[i]))throw error('CUSTOMIZATION_PAYMENT_PLAN_INVALID',400);
 for(const line of lines){
  const total=BigInt(line.total_minor),first=Number(total*30n/100n),cumulative=Number(total*90n/100n);
  const expected=[first,cumulative-first,Number(total)-cumulative];
  for(let i=0;i<3;i++)if(steps[i].allocations.filter(a=>a.line_id===line.line_id).reduce((n,a)=>n+a.amount_minor,0)!==expected[i])throw error('CUSTOMIZATION_PAYMENT_PLAN_INVALID',400);
 }
 return steps;
}
module.exports={plan};
