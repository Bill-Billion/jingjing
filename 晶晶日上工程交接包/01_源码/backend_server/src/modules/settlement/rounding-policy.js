'use strict';
const {error}=require('../party/policy');
const LEGACY='HALF_UP_PLATFORM_REMAINDER',MODERN='LARGEST_REMAINDER_PLATFORM_MAX_ONE_FEN';
function valid(v){return [LEGACY,MODERN].includes(v);}
function newRule(terms){const configured=process.env.FINANCE_ROUNDING_CONTRACT_POLICY||'LEGACY_COMPATIBLE';if(!['LEGACY_COMPATIBLE','CONTRACT_20261029'].includes(configured))throw error('INVALID_FINANCE_ROUNDING_POLICY',503);if(configured==='CONTRACT_20261029')for(const k of ['marketplace_finance','customization_finance'])if(terms[k]&&terms[k].rounding!==MODERN)throw error('FINANCE_ROUNDING_RULE_REQUIRED',409);}
function allocate(total,rows,platform,denominator){
 if(!Number.isSafeInteger(total)||total<0||rows.length<1||rows.length>30||rows.filter(x=>x.party_id===platform).length!==1||denominator<=0n||rows.some(x=>x.weight<0n)||rows.reduce((s,x)=>s+x.weight,0n)!==denominator)throw error('INVALID_ROUNDING_INPUT',400);
 const n=BigInt(total),entries=rows.map((x,index)=>({...x,index,amount_minor:Number(n*x.weight/denominator),fraction:n*x.weight%denominator}));
 let remaining=total-entries.reduce((s,x)=>s+x.amount_minor,0);
 // Stable signed participant order breaks equal-fraction ties. No new recipient or percentage.
 const ranked=[...entries].sort((a,b)=>a.fraction===b.fraction?a.index-b.index:a.fraction>b.fraction?-1:1);
 for(let j=0;j<remaining;j++)ranked[j].amount_minor++;
 const p=entries.find(x=>x.party_id===platform),rounded=Number((n*p.weight+denominator/2n)/denominator);
 return {entries:entries.map(({weight,index,fraction,...x})=>x),rounding_diff_minor:p.amount_minor-rounded};
}
function needsReview(result){return Math.abs(result.rounding_diff_minor)>1||result.entries.some(x=>x.amount_minor<0);}
module.exports={LEGACY,MODERN,valid,newRule,allocate,needsReview};
