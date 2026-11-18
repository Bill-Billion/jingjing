"use strict";
const {error}=require('../party/policy');
const {terms}=require('../production/customization-policy');
const {SCRIPT_TERMS}=require('./quote-policy');
function configuration(value){
 const v=value===undefined?'LEGACY_COMPATIBLE':value;
 if(!['LEGACY_COMPATIBLE','CONTRACT_20261029'].includes(v))throw error('INVALID_CUSTOMIZATION_CONTRACT_POLICY',500);
 return v;
}
function identity(lines,policy){
 if(configuration(policy)==='CONTRACT_20261029'&&lines.some(l=>l.line_kind==='PRODUCTION'&&!['PRIVATE_CUSTOMIZATION','MANUAL_SAMPLE'].includes(l.product_profile?.type)))throw error('PRODUCT_PROFILE_REQUIRED',409);
}
function newQuote(lines,policy,at){
 if(configuration(policy)!=='CONTRACT_20261029')return;
 for(const l of lines){
  if(l.product_profile?.type==='MANUAL_SAMPLE')continue;
  const t=l.specification?.customization_delivery;
  if(l.product_profile?.type!=='PRIVATE_CUSTOMIZATION'||!t||t.preview_payment_order!==SCRIPT_TERMS||t.acceptance_working_days!==5||t.acceptance_hours!==null)throw error('CUSTOMIZATION_CONTRACT_VERSION_REQUIRED',409);
  terms(t);
  if(at!==undefined)require('../production/working-calendar').workingDeadline(at,5,t.acceptance_calendar);
 }
}
module.exports={configuration,newQuote,identity};
