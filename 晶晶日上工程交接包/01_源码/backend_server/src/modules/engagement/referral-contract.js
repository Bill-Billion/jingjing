'use strict';
const {error}=require('../party/policy'),VERSION='CONTRACT_20261029';
function validate(rule,{required=false}={}){const modern=rule.referral_contract_policy===VERSION;if(rule.referral_contract_policy!==undefined&&!modern||required&&!modern)throw error('REFERRAL_CONTRACT_POLICY_REQUIRED',409);if(modern)for(const k of ['STOCK','AUDITION','CUSTOMIZATION','COMMERCIAL'])if(!Number.isInteger(rule.referral_bps[k])||rule.referral_bps[k]<1000||rule.referral_bps[k]>1500)throw error('REFERRAL_CONTRACT_RATE_MISMATCH',409);return rule;}
function newRule(rule){return validate(rule,{required:process.env.REFERRAL_CONTRACT_POLICY===VERSION});}
module.exports={VERSION,validate,newRule};
