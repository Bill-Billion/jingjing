'use strict';
const {error}=require('../party/policy');
// The reviewed specification travels with the quote/order. Never infer a
// historical order's payment promises from today's configuration.
const SCRIPT_TERMS='SCRIPT_BEFORE_INTERIM';
const SCRIPT_TRIGGER='CUSTOMIZATION_SCRIPT_CONFIRMED';
function scriptTerms(line){return line.specification?.customization_delivery?.preview_payment_order===SCRIPT_TERMS;}
function amounts(total,kind){
 const n=BigInt(total);
 if(kind==='MANUAL_SAMPLE')return [Number(n/2n),Number(n-n/2n)];
 const first=n*30n/100n,throughMiddle=n*BigInt(kind==='SCRIPT'?70:90)/100n;
 return [Number(first),Number(throughMiddle-first),Number(n-throughMiddle)];
}
function schedule(lines){
 const sample=lines.every(l=>l.product_profile?.type==='MANUAL_SAMPLE');
 const script=lines.some(scriptTerms);
 if(script&&(sample||!lines.every(scriptTerms)))throw error('CUSTOMIZATION_PAYMENT_PLAN_INVALID',400);
 const kind=sample?'MANUAL_SAMPLE':script?'SCRIPT':'LEGACY';
 return {kind,triggers:sample?['ORDER_ACCEPTED','FINAL_ACCEPTED']:['ORDER_ACCEPTED',script?SCRIPT_TRIGGER:'CUSTOMIZATION_INTERIM_CONFIRMED','FINAL_ACCEPTED']};
}
function plan(lines,steps){
 const {kind,triggers}=schedule(lines);
 if(steps.length!==triggers.length||steps.some((s,i)=>s.trigger!==triggers[i]))throw error('CUSTOMIZATION_PAYMENT_PLAN_INVALID',400);
 for(const line of lines){
  const expected=amounts(line.total_minor,kind);
  for(let i=0;i<expected.length;i++)if(steps[i].allocations.filter(a=>a.line_id===line.line_id).reduce((n,a)=>n+a.amount_minor,0)!==expected[i])throw error('CUSTOMIZATION_PAYMENT_PLAN_INVALID',400);
 }
 return steps;
}
function interimTrigger(terms){return terms.preview_payment_order===SCRIPT_TERMS?SCRIPT_TRIGGER:'CUSTOMIZATION_INTERIM_CONFIRMED';}
module.exports={plan,schedule,amounts,scriptTerms,interimTrigger,SCRIPT_TERMS,SCRIPT_TRIGGER};
