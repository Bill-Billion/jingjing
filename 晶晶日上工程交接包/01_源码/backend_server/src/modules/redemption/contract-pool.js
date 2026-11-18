'use strict';
// File 22, client contract bundle 20261029. Costs and base-film price are NOT inferred.
const {error,shape,label}=require('../party/policy');
const prizes=Object.freeze([
 ['priority','INTERVIEW_PRIORITY',100,null],['open','INTERVIEW_OPEN',900,null],['free','PRODUCTION_FREE',5,null],
 ['credit1000','PRODUCTION_CREDIT',20,100000],['credit500','PRODUCTION_CREDIT',50,50000],['credit200','PRODUCTION_CREDIT',150,20000],['credit100','PRODUCTION_CREDIT',300,10000],['credit50','PRODUCTION_CREDIT',800,5000],
 ['exposure','EXPOSURE',1800,null],['points','POINT_BACK',3000,null],['none','NONE',2875,null]
]);
function checkConfig(config){
 if(config.source_profile===undefined&&config.cost_basis===undefined)return;
 if(config.source_profile!=='CONTRACT_20261029')throw error('LOTTERY_SOURCE_PROFILE_INVALID',400);
 if(config.prizes.length!==prizes.length||prizes.some(([key,kind,weight])=>!config.prizes.some(p=>p.key===key&&p.kind===kind&&p.weight===weight)))throw error('LOTTERY_CONTRACT_PROBABILITY_MISMATCH',409);
 const b=config.cost_basis;shape(b,['source_ref','single_consumption_minor','ten_consumption_minor']);label(b.source_ref,200);
 for(const k of ['single_consumption_minor','ten_consumption_minor'])require('./policy').integer(b[k],1,1000000000);
 // Compare exact rational expectations. Floating-point rounding must not change a money limit.
 const D=10000n,guaranteed=new Set(['INTERVIEW_OPEN','INTERVIEW_PRIORITY','PRODUCTION_CREDIT','PRODUCTION_FREE']);
 let S=0n,G=0n,Gc=0n;for(const p of config.prizes){const w=BigInt(p.weight),cost=BigInt(p.estimated_cost_minor);S+=w*cost;if(guaranteed.has(p.kind)){G+=w;Gc+=w*cost;}}
 const F=(D-G)**9n,tenNumerator=10n*S*(D**9n)*G+F*(Gc*D-S*G),tenDenominator=(D**10n)*G;
 if(S*100n>BigInt(b.single_consumption_minor)*D||tenNumerator*100n>BigInt(b.ten_consumption_minor)*tenDenominator)throw error('LOTTERY_CONTRACT_COST_LIMIT',409);
}
function checkBindings(config,bindings,stocks){
 if(config.source_profile!=='CONTRACT_20261029')return;
 for(const [key,kind,,face] of prizes){const b=bindings.find(x=>x.key===key),template=b?.stock_id?stocks.get(b.stock_id)?.data.template:null;
  if(kind==='PRODUCTION_CREDIT'&&template?.production.face_minor!==face)throw error('LOTTERY_CONTRACT_PRIZE_MISMATCH',409);
  if(kind==='POINT_BACK'&&b?.point_back!==100)throw error('LOTTERY_CONTRACT_PRIZE_MISMATCH',409);
  if(kind==='PRODUCTION_FREE'&&(!template?.production?.spec_ids?.length||template.production.face_minor>5000000))throw error('LOTTERY_CONTRACT_PRIZE_MISMATCH',409);
 }
}
function candidate({costs,cost_basis}){
 const p=prizes.map(([key,kind,weight])=>{if(!Object.hasOwn(costs,key))throw error('LOTTERY_REVIEWED_COST_REQUIRED',409);return {key,kind,weight,estimated_cost_minor:costs[key]};});
 return require('./lottery-policy').pool({version:'CONTRACT_20261029_CANDIDATE',source_profile:'CONTRACT_20261029',cost_basis,algorithm:'NINE_THEN_CONDITIONAL_TENTH_V1',single_points:300,ten_points:2700,prizes:p});
}
module.exports={prizes,checkConfig,checkBindings,candidate};
