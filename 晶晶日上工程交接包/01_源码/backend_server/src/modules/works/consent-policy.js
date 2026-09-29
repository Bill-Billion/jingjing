'use strict';
const {shape,id,label,error}=require('../party/policy');
function instant(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)throw error('INVALID_INSTANT',400);return value;}
function normalizeConsent(input){
 shape(input,['avatar_id','subject_party_id','features','purposes','territories','valid_from','valid_until','terms','evidence_asset_ids']);
 id(input.avatar_id);id(input.subject_party_id);instant(input.valid_from);instant(input.valid_until);label(input.terms,8000);
 if(input.valid_from>=input.valid_until)throw error('INVALID_CONSENT_PERIOD',400);
 for(const field of ['features','purposes','territories','evidence_asset_ids']){
  if(!Array.isArray(input[field])||!input[field].length||input[field].length>100||new Set(input[field]).size!==input[field].length)throw error('INVALID_CONSENT_SCOPE',400);
 }
 if(input.features.some(x=>!['FACE','VOICE'].includes(x)))throw error('INVALID_CONSENT_SCOPE',400);
 for(const text of [...input.purposes,...input.territories])label(text,100);
 input.evidence_asset_ids.forEach(id);
 return {...input,features:[...input.features],purposes:[...input.purposes],territories:[...input.territories],evidence_asset_ids:[...input.evidence_asset_ids]};
}
// A narrow scope check, never authority to generate, publish or issue a license.
function coversConsent(record,request,now){
 shape(request,['feature','purpose','territory']);instant(now);
 if(!['FACE','VOICE'].includes(request.feature))throw error('INVALID_CONSENT_SCOPE',400);
 label(request.purpose,100);label(request.territory,100);
 const c=normalizeConsent(record.data.consent);
 return record.current_status==='APPROVED'&&c.valid_from<=now&&now<c.valid_until&&c.features.includes(request.feature)&&c.purposes.includes(request.purpose)&&c.territories.includes(request.territory);
}
module.exports={normalizeConsent,coversConsent};
