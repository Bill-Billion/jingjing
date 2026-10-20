'use strict';
// Pure rule calculation, not a public drawing endpoint. Publishing and spending must be atomic with stock.
const {randomInt}=require('node:crypto');
const {shape,label,error}=require('../party/policy'),{integer}=require('./policy');
const GUARANTEED=new Set(['INTERVIEW_OPEN','INTERVIEW_PRIORITY','PRODUCTION_CREDIT','PRODUCTION_FREE']);
const KINDS=new Set([...GUARANTEED,'EXPOSURE','POINT_BACK','NONE']);
function pool(input){
 shape(input,['version','single_points','ten_points','prizes','algorithm']);label(input.version,100);
 if(input.single_points!==300||input.ten_points!==2700||input.algorithm!=='NINE_THEN_CONDITIONAL_TENTH_V1')throw error('LOTTERY_RULE_INVALID',400);
 if(!Array.isArray(input.prizes)||!input.prizes.length||input.prizes.length>50)throw error('LOTTERY_RULE_INVALID',400);
 let sum=0,guarantee=0;const seen=new Set();
 for(const p of input.prizes){
  shape(p,['key','kind','weight','estimated_cost_minor']);label(p.key,100);integer(p.weight,1,10000);integer(p.estimated_cost_minor,0);
  if(seen.has(p.key)||!KINDS.has(p.kind))throw error('LOTTERY_PRIZE_INVALID',400);seen.add(p.key);sum+=p.weight;if(GUARANTEED.has(p.kind))guarantee+=p.weight;
 }
 if(sum!==10000||!guarantee)throw error('LOTTERY_PROBABILITY_INVALID',400);return structuredClone(input);
}
function choose(prizes,random=randomInt){
 const total=prizes.reduce((n,p)=>n+p.weight,0),ticket=random(total);
 if(!Number.isInteger(ticket)||ticket<0||ticket>=total)throw error('LOTTERY_ENTROPY_INVALID',503);
 let cursor=0;for(const p of prizes){cursor+=p.weight;if(ticket<cursor)return {key:p.key,ticket,total};}
 throw error('LOTTERY_ENTROPY_INVALID',503);
}
function draw(config,count,random=randomInt){
 const r=pool(config);if(![1,10].includes(count))throw error('LOTTERY_COUNT_INVALID',400);
 const results=[];let hasGuarantee=false;
 for(let index=0;index<count;index++){
  const forced=count===10&&index===9&&!hasGuarantee,prizes=forced?r.prizes.filter(p=>GUARANTEED.has(p.kind)):r.prizes;
  const result=choose(prizes,random),kind=prizes.find(p=>p.key===result.key).kind;
  if(GUARANTEED.has(kind))hasGuarantee=true;
  results.push({...result,index,kind,guaranteed_slot:forced});
 }
 return {algorithm:r.algorithm,points:count===1?r.single_points:r.ten_points,results};
}
function distribution(config){
 const r=pool(config),g=r.prizes.filter(p=>GUARANTEED.has(p.kind)).reduce((n,p)=>n+p.weight/10000,0),forced=Math.pow(1-g,9);
 const prizes=r.prizes.map(p=>{
  const single=p.weight/10000,conditional=GUARANTEED.has(p.kind)?single/g:0;
  const tenth=(1-forced)*single+forced*conditional,expected_ten=9*single+tenth;
  return {...p,single_probability:single,forced_tenth_probability:conditional,tenth_probability:tenth,expected_count_per_ten:expected_ten,average_probability_per_ten_slot:expected_ten/10};
 });
 return {algorithm:r.algorithm,forced_tenth_branch_probability:forced,independent_ten_miss_probability:Math.pow(1-g,10),prizes,expected_single_cost_minor:prizes.reduce((n,p)=>n+p.single_probability*p.estimated_cost_minor,0),expected_ten_cost_minor:prizes.reduce((n,p)=>n+p.expected_count_per_ten*p.estimated_cost_minor,0)};
}
// Decimal strings make published calculations stable across MySQL JSON double serialization.
function publishedDistribution(config){const d=distribution(config);return {...d,forced_tenth_branch_probability:d.forced_tenth_branch_probability.toFixed(15),independent_ten_miss_probability:d.independent_ten_miss_probability.toFixed(15),expected_single_cost_minor:d.expected_single_cost_minor.toFixed(8),expected_ten_cost_minor:d.expected_ten_cost_minor.toFixed(8),prizes:d.prizes.map(p=>({...p,...Object.fromEntries(['single_probability','forced_tenth_probability','tenth_probability','expected_count_per_ten','average_probability_per_ten_slot'].map(k=>[k,p[k].toFixed(15)]))}))};}
module.exports={pool,draw,distribution,publishedDistribution};
