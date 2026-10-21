 'use strict';
const {shape,error}=require('../party/policy');
const TYPES=Object.freeze(['PRIVATE_CUSTOMIZATION','MANUAL_SAMPLE','STOCK_VIDEO','COMMERCIAL','AUDITION','AVATAR_CREATION','AVATAR_HOSTING','HALO_REVIEW']);
// Versioned product identity is reviewed with SPEC and copied into the quote/order.
function profile(value){
 if(value===undefined)return undefined;
 shape(value,['version','type']);
 if(value.version!=='V5'||!TYPES.includes(value.type))throw error('INVALID_PRODUCT_PROFILE',400);
 return {version:'V5',type:value.type};
}
function requirement(value){
 if(value===undefined||value==='false')return false;
 if(value==='true')return true;
 throw error('INVALID_PRODUCT_POLICY_CONFIGURATION',503);
}
function specification(value,previous,lineKind,required=false){
 const next=profile(value),old=profile(previous);
 if(old&&(!next||old.type!==next.type))throw error('PRODUCT_PROFILE_CANNOT_CHANGE',409);
 if(required&&!next)throw error('PRODUCT_PROFILE_REQUIRED',409);
 if(['PRIVATE_CUSTOMIZATION','MANUAL_SAMPLE'].includes(next?.type)&&lineKind!=='PRODUCTION')throw error('PRODUCT_LINE_KIND_MISMATCH',400);
 return next;
}
function quote(lines,{customization_source,requireV5Products=false,artist_service_source}){
 const profiles=lines.map(l=>profile(l.product_profile)),typed=profiles.filter(Boolean);
 if(!typed.length){
  if(requireV5Products||customization_source||artist_service_source)throw error('PRODUCT_PROFILE_REQUIRED',409);
  return; // Existing legacy business before the explicit V5 cutover.
 }
 if(typed.length!==lines.length||typed.some(p=>p.type!==typed[0].type))throw error('MIXED_PRODUCT_PROFILES',409);
 if(require('../artists/service-policy').TYPES.includes(typed[0].type)){if(!artist_service_source||customization_source||lines.length!==1||lines[0].quantity!==1||lines[0].line_kind!=='OTHER')throw error('ARTIST_SERVICE_SOURCE_REQUIRED',409);return;}
 if(artist_service_source)throw error('ARTIST_PRODUCT_MISMATCH',409);
 if(!['PRIVATE_CUSTOMIZATION','MANUAL_SAMPLE'].includes(typed[0].type))throw error('PRODUCT_FLOW_NOT_IMPLEMENTED',409);
 if(typed[0].type==='MANUAL_SAMPLE'&&(lines.length!==1||lines[0].quantity!==1))throw error('MANUAL_SAMPLE_ONE_SERVICE_REQUIRED',409);
 if(!customization_source)throw error('CUSTOMIZATION_SOURCE_REQUIRED',409);
 if(lines.some(l=>l.line_kind!=='PRODUCTION'))throw error('PRODUCT_LINE_KIND_MISMATCH',400);
}
module.exports={TYPES,profile,requirement,specification,quote};
