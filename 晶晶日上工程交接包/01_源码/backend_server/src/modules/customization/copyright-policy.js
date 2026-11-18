"use strict";
const {shape,id,label,error}=require('../party/policy');
const {copy}=require('../trade/policy');
const {digest}=require('../governance/content');
const VERSION='CONTRACT_20261029';
function configuration(v='LEGACY_COMPATIBLE'){
 if(!['LEGACY_COMPATIBLE',VERSION].includes(v))throw error('INVALID_COPYRIGHT_CONTRACT_POLICY',500);
 return v;
}
function terms(v){
 shape(v,['version','mode','buyout_price_included','license','personality_rights_retained','underlying_assets_excluded','third_party_licenses_retained']);
 if(v.version!==VERSION||!['BUYER_OWNERSHIP','PRODUCER_OWNERSHIP_LICENSE'].includes(v.mode)||v.personality_rights_retained!==true||v.underlying_assets_excluded!==true||v.third_party_licenses_retained!==true)throw error('INVALID_COPYRIGHT_TERMS',400);
 if(v.mode==='BUYER_OWNERSHIP'){
  if(v.buyout_price_included!==true||v.license!==null)throw error('COPYRIGHT_CHOICES_EXCLUSIVE',400);
 }else{
  if(v.buyout_price_included!==false||!v.license)throw error('COPYRIGHT_CHOICES_EXCLUSIVE',400);
  const l=v.license;shape(l,['scope','purposes','territories','perpetual','exclusive','transferable','sublicensable','terms_text']);
  if(!['PERSONAL_NONCOMMERCIAL','AGREED_SCOPE'].includes(l.scope)||l.perpetual!==true||l.exclusive!==false||l.transferable!==false||l.sublicensable!==false||!Array.isArray(l.territories)||!l.territories.length||l.territories.length>100||new Set(l.territories).size!==l.territories.length||l.territories.some(t=>!/^([A-Z]{2}|WORLD)$/.test(t)))throw error('INVALID_COPYRIGHT_LICENSE',400);
  if(!Array.isArray(l.purposes)||!l.purposes.length||new Set(l.purposes).size!==l.purposes.length||l.purposes.some(x=>!['PRIVATE','PUBLIC_SHARE','COMMERCIAL','RELEASE'].includes(x))||l.scope==='PERSONAL_NONCOMMERCIAL'&&l.purposes.some(x=>!['PRIVATE','PUBLIC_SHARE'].includes(x)))throw error('INVALID_COPYRIGHT_LICENSE',400);
  label(l.terms_text,8000);
 }
 return copy(v);
}
function snapshot(lines,buyer,merchant,manualSample,policy){
 require('./contract-policy').identity(lines,policy);
 const relevant=lines.filter(l=>['PRIVATE_CUSTOMIZATION','MANUAL_SAMPLE'].includes(l.product_profile?.type));
 if(!relevant.length){if(lines.some(l=>l.specification?.copyright_terms))throw error('COPYRIGHT_PRODUCT_MISMATCH',409);return null;}
 const modern=relevant.some(l=>l.specification?.copyright_terms)||!!manualSample?.copyright_terms;
 if(!modern&&configuration(policy)!==VERSION)return null;
 if(relevant.length!==1||lines.length!==1)throw error('COPYRIGHT_SINGLE_SERVICE_REQUIRED',409);
 const l=relevant[0];if(!l.specification?.copyright_terms)throw error('COPYRIGHT_CHOICE_REQUIRED',409);
 const chosen=terms(l.specification.copyright_terms);id(buyer);id(merchant);id(l.provider_party_id);
 let licensee=buyer,personality=null;
 if(l.product_profile.type==='MANUAL_SAMPLE'){
  if(!manualSample?.confirmation||!manualSample.copyright_terms||chosen.mode!=='PRODUCER_OWNERSHIP_LICENSE'||digest(chosen)!==digest(manualSample.copyright_terms)||manualSample.copyright_owner_party_id!==merchant||manualSample.personality_rights_owner_party_id!==manualSample.rights_owner_party_id)throw error('MANUAL_SAMPLE_COPYRIGHT_CONFIRMATION_REQUIRED',409);
  licensee=manualSample.personality_rights_owner_party_id;personality=licensee;
 }
 // This self-operated contract cannot silently give a subcontractor ownership.
 if(l.provider_party_id!==merchant)throw error('COPYRIGHT_PRODUCER_MISMATCH',409);
 return {version:VERSION,line_id:l.line_id,source_ref:l.product_profile.type==='MANUAL_SAMPLE'?'CONTRACT_20261029_09':'CONTRACT_20261029_13_ARTICLE_5',buyer_party_id:buyer,producer_party_id:merchant,copyright_owner_party_id:chosen.mode==='BUYER_OWNERSHIP'?buyer:merchant,licensee_party_id:chosen.license?licensee:null,personality_rights_owner_party_id:personality,personality_rights_basis:'INDIVIDUAL_CONSENTS_NOT_TRANSFERRED',terms:chosen};
}
function verify(quote,buyer,merchant,policy='LEGACY_COMPATIBLE'){
 const expected=snapshot(quote.lines,buyer,merchant,quote.manual_sample,quote.customization_change?'LEGACY_COMPATIBLE':policy);
 if(digest(expected)!==digest(quote.customization_copyright||null))throw error('COPYRIGHT_SNAPSHOT_MISMATCH',409);
 return expected;
}
function sameCommitment(a,b){const omit=v=>{if(!v)return null;const {line_id,...rest}=v;return rest;};return digest(omit(a))===digest(omit(b));}
function permitsUsage(s,party,{purpose,territory}){if(!s)return true;terms(s.terms);if(s.copyright_owner_party_id===party)return true;const l=s.terms.license;return !!(l&&s.licensee_party_id===party&&l.purposes.includes(purpose)&&(l.territories.includes('WORLD')||l.territories.includes(territory)));}
module.exports={permitsUsage,VERSION,configuration,terms,snapshot,verify,sameCommitment};
