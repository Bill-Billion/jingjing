"use strict";
const {shape,ref,label,id,error}=require('../party/policy');
const {copy,amount}=require('../trade/policy');
const TYPES=Object.freeze(['PLATFORM_CORRECTION','CREATIVE_CHANGE','FILE_UNAVAILABLE','EXTENSION','RIGHTS_DISPUTE','CANCEL','PRODUCTION_FAILED','RIGHTS_UNAVAILABLE','INFRINGEMENT']);
function terms(v){
 shape(v,['version','source_ref','preview_payment_order','acceptance_hours','cancellation_terms']);ref(v.version);ref(v.source_ref);label(v.cancellation_terms,8000);
 if(!['PREVIEW_BEFORE_INTERIM','INTERIM_BEFORE_PREVIEW'].includes(v.preview_payment_order)||!Number.isInteger(v.acceptance_hours)||v.acceptance_hours<1||v.acceptance_hours>720)throw error('INVALID_CUSTOMIZATION_DELIVERY_TERMS',400);
 return copy(v);
}
function cast(v,consents){
 shape(v,['uses_identifiable_people','cast']);if(typeof v.uses_identifiable_people!=='boolean'||!Array.isArray(v.cast)||v.cast.length>20||v.uses_identifiable_people!==(v.cast.length>0))throw error('INVALID_CUSTOMIZATION_CAST',400);
 const avatars=new Set(),used=new Set();for(const c of v.cast){shape(c,['person_id','avatar_id','supply_consent_id','artist_consent_ids','look_version_id','voice_version_id','usage']);for(const k of ['person_id','avatar_id','supply_consent_id','look_version_id'])id(c[k]);if(c.voice_version_id!==null)id(c.voice_version_id);if(!['EXISTING_MATERIAL','NEW_GENERATION'].includes(c.usage)||avatars.has(c.avatar_id)||!Array.isArray(c.artist_consent_ids)||!c.artist_consent_ids.length||c.artist_consent_ids.length>2||new Set(c.artist_consent_ids).size!==c.artist_consent_ids.length)throw error('INVALID_CUSTOMIZATION_CAST',400);c.artist_consent_ids.forEach(id);avatars.add(c.avatar_id);used.add(c.supply_consent_id);}
 if(used.size!==consents.length||consents.some(c=>!used.has(c)))throw error('CUSTOMIZATION_CAST_CONSENT_MISMATCH',409);return copy(v);
}
function changeKind(v){if(!['PLATFORM_CORRECTION','CREATIVE_CHANGE'].includes(v))throw error('CUSTOMIZATION_CHANGE_KIND_REQUIRED',400);return v;}
function caseInput(v){shape(v,['kind','reason','evidence_asset_ids']);if(!TYPES.includes(v.kind))throw error('INVALID_CUSTOMIZATION_CASE',400);label(v.reason,4000);if(!Array.isArray(v.evidence_asset_ids)||v.evidence_asset_ids.length>20||new Set(v.evidence_asset_ids).size!==v.evidence_asset_ids.length)throw error('INVALID_INPUT',400);v.evidence_asset_ids.forEach(id);return copy(v);}
function refundAllowance({kind,started,received,confirmed,retained}){amount(received,true);amount(confirmed,true);amount(retained,true);const full=!started||['PRODUCTION_FAILED','RIGHTS_UNAVAILABLE','INFRINGEMENT'].includes(kind);if(full&&retained!==0||retained>Math.min(received,confirmed))throw error('CUSTOMIZATION_RETAINED_AMOUNT_INVALID',409);return received-retained;}
module.exports={terms,cast,changeKind,caseInput,refundAllowance,TYPES};
