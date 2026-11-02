"use strict";
const {shape,ref,label,id,error}=require('../party/policy');
const EXCLUDED=Object.freeze(['COMMERCIAL_ADVERTISING','ADAPTATION','DISTRIBUTION','VOICE_SEPARATELY','AI_REGENERATION','SOURCE_OR_MODEL_FILES','NEW_AVATAR_CONTENT','EXCLUSIVE_BUYOUT']);
const COMMERCIAL_USES=Object.freeze(['BRAND_PROMOTION','COMMERCIAL_ADVERTISING','CORPORATE_DISPLAY']);
const commercial=x=>x?.scope==='COMMERCIAL_LIMITED';
function uses(v){if(!Array.isArray(v)||!v.length||v.length>COMMERCIAL_USES.length||new Set(v).size!==v.length||v.some(x=>!COMMERCIAL_USES.includes(x)))throw error('INVALID_STOCK_COMMERCIAL_USES',400);return v;}
function specification(v){
 shape(v,['version','stock_license','terms']);ref(v.version);label(v.terms,8000);
 const x=v.stock_license;shape(x,['scope','exclusive','territory','duration','personal_social_sharing','acceptance_hours','aftercare_terms','acceptance_policy',...(commercial(x)?['commercial_uses','valid_from','valid_until']:[])]);
 if(x.exclusive!==false||!Number.isInteger(x.acceptance_hours)||x.acceptance_hours<1||x.acceptance_hours>720)throw error('INVALID_STOCK_LICENSE',400);
 if(commercial(x)){
  if(x.duration!=='FIXED_TERM'||x.personal_social_sharing!==false)throw error('INVALID_STOCK_LICENSE',400);
  label(x.territory,100);uses(x.commercial_uses);
  for(const k of ['valid_from','valid_until'])require('../trade/policy').instant(x[k]);
  if(x.valid_from>=x.valid_until)throw error('INVALID_STOCK_LICENSE',400);
 }else if(x.scope!=='PERSONAL_NONCOMMERCIAL'||x.territory!=='WORLDWIDE'||x.duration!=='PERPETUAL'||x.personal_social_sharing!==true)throw error('INVALID_STOCK_LICENSE',400);
 require('../trade/acceptance-policy').validate(x);label(x.aftercare_terms,8000);return JSON.parse(JSON.stringify(v));
}
function participants(v){if(!Array.isArray(v)||v.length>20)throw error('INVALID_STOCK_PARTICIPANTS',400);const seen=new Set();for(const x of v){shape(x,['person_id','avatar_id','consent_id']);id(x.person_id);id(x.avatar_id);id(x.consent_id);if(seen.has(x.person_id))throw error('DUPLICATE_STOCK_PERSON',400);seen.add(x.person_id);}return v;}
function license(spec){const x=spec.stock_license;return {...x,excluded:EXCLUDED.filter(v=>v!=='COMMERCIAL_ADVERTISING'||!commercial(x)||!x.commercial_uses.includes(v)),limited_to_buyer:true};}
function active(x,at){if(commercial(x)&&(x.valid_from>at||x.valid_until<=at))throw error('STOCK_COMMERCIAL_LICENSE_NOT_ACTIVE',409);}
function coversConsent(x,c){
 if(!commercial(x))return;
 if(!c.purposes.includes('STOCK_COMMERCIAL')||!Array.isArray(c.stock_commercial_uses)||!x.commercial_uses.every(v=>c.stock_commercial_uses.includes(v))||!c.territories.some(t=>t==='WORLDWIDE'||t===x.territory)||c.valid_from>x.valid_from||c.valid_until<x.valid_until)throw error('STOCK_COMMERCIAL_CONSENT_REQUIRED',409);
}
module.exports={specification,participants,license,EXCLUDED,COMMERCIAL_USES,uses,commercial,active,coversConsent};
