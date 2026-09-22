'use strict';
// Pure rules: no database, HTTP, worker or external provider imports.
const capabilityCodes=Object.freeze(['AUTHOR','SCRIPT_SUPPLIER','PRODUCER','MCN','BRAND_CLIENT']);
const error=(code,status=403)=>Object.assign(new Error(code),{code,status});
function ref(value) {
 if(typeof value!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value))throw error('INVALID_REFERENCE',400);
 return value;
}
function id(value) {
 if(typeof value!=='string'||!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(value))throw error('INVALID_ID',400);
 return value;
}
function shape(input,keys) {
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!keys.includes(k)))throw error('INVALID_INPUT',400);
}
function label(value,max) {
 if(typeof value!=='string'||!value.trim()||Array.from(value).length>max)throw error('INVALID_DISPLAY_NAME',400);
 return value;
}
function version(value) {
 if(!Number.isInteger(value)||value<1||value>=4294967295)throw error('EXPECTED_VERSION_REQUIRED',428);
 return value;
}
 function pending(row,expected) {
  if(row.object_version!==version(expected))throw error('VERSION_CONFLICT',412);
  if(row.current_status!=='INVITED')throw error('INVITATION_NOT_PENDING',409);
  if(Number(row.expired))throw error('INVITATION_EXPIRED',422);
 }
function assertOwner(p,m,organization=false) {
 if(!m||m.current_status!=='ACTIVE'||m.role_code!=='OWNER'||(organization&&p.kind!=='ORGANIZATION'))throw error('PARTY_ACTION_FORBIDDEN');
}
// Database reads and locking remain in the repository; this policy consumes verified records.
function allowedActions(p,m) {
 if(!m||m.current_status!=='ACTIVE'||['SUSPENDED','CLOSED'].includes(p.current_status))return [];
 const actions=['READ_PARTY'];
 if(m.role_code==='OWNER') {actions.push('REQUEST_CAPABILITY');if(p.kind==='ORGANIZATION')actions.push('MANAGE_MEMBERS');}
 return actions;
}
module.exports={capabilityCodes,error,ref,id,shape,label,version,pending,assertOwner,allowedActions};
