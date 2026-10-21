'use strict';
const {shape,ref,label,id,error}=require('../party/policy');
const EXCLUDED=Object.freeze(['COMMERCIAL_ADVERTISING','ADAPTATION','DISTRIBUTION','VOICE_SEPARATELY','AI_REGENERATION','SOURCE_OR_MODEL_FILES','NEW_AVATAR_CONTENT','EXCLUSIVE_BUYOUT']);
function specification(v){
 shape(v,['version','stock_license','terms']);ref(v.version);label(v.terms,8000);
 const x=v.stock_license;shape(x,['scope','exclusive','territory','duration','personal_social_sharing','acceptance_hours','aftercare_terms']);
 if(x.scope!=='PERSONAL_NONCOMMERCIAL'||x.exclusive!==false||x.territory!=='WORLDWIDE'||x.duration!=='PERPETUAL'||x.personal_social_sharing!==true||!Number.isInteger(x.acceptance_hours)||x.acceptance_hours<1||x.acceptance_hours>720)throw error('INVALID_STOCK_LICENSE',400);
 label(x.aftercare_terms,8000);return JSON.parse(JSON.stringify(v));
}
function participants(v){if(!Array.isArray(v)||v.length>20)throw error('INVALID_STOCK_PARTICIPANTS',400);const seen=new Set();for(const x of v){shape(x,['person_id','avatar_id','consent_id']);id(x.person_id);id(x.avatar_id);id(x.consent_id);if(seen.has(x.person_id))throw error('DUPLICATE_STOCK_PERSON',400);seen.add(x.person_id);}return v;}
function license(spec){return {...spec.stock_license,excluded:[...EXCLUDED],limited_to_buyer:true};}
module.exports={specification,participants,license,EXCLUDED};
