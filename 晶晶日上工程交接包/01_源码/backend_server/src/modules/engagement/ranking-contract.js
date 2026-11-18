"use strict";
const {error}=require('../party/policy');
const VERSION='CONTRACT_20261029';
const WEIGHTS=[3000,2500,2000,1000,1500],HALO=[0,10000,13000,16000];
function validate(rule,{required=false}={}){
 const modern=rule.ranking_contract_policy===VERSION;
 if(rule.ranking_contract_policy!==undefined&&!modern||required&&!modern)throw error('RANKING_CONTRACT_POLICY_REQUIRED',409);
 if(modern&&(JSON.stringify(rule.rank.weights)!==JSON.stringify(WEIGHTS)||JSON.stringify(rule.rank.halo_bps)!==JSON.stringify(HALO)))throw error('RANKING_CONTRACT_RATE_MISMATCH',409);
 return rule;
}
function mode(v){if(v===undefined)return 'LEGACY_COMPATIBLE';if(!['LEGACY_COMPATIBLE',VERSION].includes(v))throw error('INVALID_RANKING_CONTRACT_POLICY',503);return v;}
function required(rule,policy){return validate(rule,{required:policy===VERSION});}
module.exports={VERSION,WEIGHTS,HALO,validate,mode,required};
