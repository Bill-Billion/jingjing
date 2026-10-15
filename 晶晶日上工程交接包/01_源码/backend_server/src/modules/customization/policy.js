'use strict';
// Story intake rules are independent of storage, HTTP and external providers.
const {canonical}=require('../governance/content');
const {error,id}=require('../party/policy');
const MAX_TEMPLATE_BYTES=16*1024,MAX_ANSWERS_BYTES=48*1024,MAX_FIELDS=40,MAX_TEXT_LENGTH=12000;
const FIELD_KEY=/^[a-z][a-z0-9_]{0,63}$/;
const BLOCKED_KEYS=new Set(['__proto__','constructor','prototype']);
function fail(status,field,reason){throw Object.assign(error('CUSTOMIZATION_VALIDATION_FAILED',status),{details:[{field,reason}]});}
function plain(value,field){if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail(400,field,'INVALID_TYPE');}
function keys(value,allowed,field){plain(value,field);if(Object.keys(value).some(k=>!allowed.includes(k)))fail(400,field,'UNKNOWN_FIELD');}
function text(value,max,field,{empty=false}={}){if(typeof value!=='string')fail(400,field,'INVALID_TYPE');if(!empty&&!value.trim())fail(422,field,'REQUIRED');if(Array.from(value).length>max)fail(400,field,'TOO_LONG');return value;}
function copy(value,max,field){let json;try{json=canonical(value);}catch(e){fail(400,field,e.code==='CONTENT_TOO_LARGE'?'TOO_LARGE':'INVALID_TYPE');}if(Buffer.byteLength(json,'utf8')>max)fail(400,field,'TOO_LARGE');return JSON.parse(json);}
function fieldKey(value){return typeof value==='string'&&FIELD_KEY.test(value)&&!BLOCKED_KEYS.has(value);}
function categoryCode(value){if(typeof value!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(value))fail(400,'category_code','INVALID_TYPE');return value;}
function templateVersion(value){if(!Number.isInteger(value)||value<1||value>=4294967295)fail(400,'template_version','INVALID_TYPE');return value;}
function sourceRef(value){return text(value,500,'source_ref');}
function operationKey(value){if(typeof value!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{15,127}$/.test(value))fail(400,'operation_key','INVALID_TYPE');return value;}
function normalizeTemplate(input){
 const value=copy(input,MAX_TEMPLATE_BYTES,'template_snapshot');
 keys(value,['title','description','fields'],'template_snapshot');text(value.title,160,'template_snapshot.title');text(value.description,2000,'template_snapshot.description',{empty:true});
 if(!Array.isArray(value.fields)||!value.fields.length||value.fields.length>MAX_FIELDS)fail(400,'template_snapshot.fields','INVALID_TYPE');
 const seen=new Set();
 for(const f of value.fields){
  keys(f,['key','label','type','required','max_length','options'],'template_snapshot.fields');
  if(!fieldKey(f.key)||seen.has(f.key))fail(400,'template_snapshot.fields','INVALID_TYPE');seen.add(f.key);
  text(f.label,120,'template_snapshot.fields');if(!['TEXT','CHOICE','PRIVATE_ATTACHMENT'].includes(f.type)||typeof f.required!=='boolean')fail(400,'template_snapshot.fields','INVALID_TYPE');
  if(f.type==='TEXT'){
   if(Object.hasOwn(f,'options'))fail(400,'template_snapshot.fields','UNKNOWN_FIELD');
   if(Object.hasOwn(f,'max_length')&&(!Number.isInteger(f.max_length)||f.max_length<1||f.max_length>MAX_TEXT_LENGTH))fail(400,'template_snapshot.fields','INVALID_TYPE');
  }else if(f.type==='CHOICE'){
   if(Object.hasOwn(f,'max_length')||!Array.isArray(f.options)||!f.options.length||f.options.length>50||new Set(f.options).size!==f.options.length)fail(400,'template_snapshot.fields','INVALID_TYPE');
   for(const option of f.options)text(option,120,'template_snapshot.fields');
  }else if(Object.hasOwn(f,'options')||Object.hasOwn(f,'max_length'))fail(400,'template_snapshot.fields','UNKNOWN_FIELD');
 }
 return value;
}
function normalizeAnswers(template,input,{submission=false}={}){
 const value=copy(input,MAX_ANSWERS_BYTES,'answers');plain(value,'answers');
 const fields=new Map(template.fields.map(f=>[f.key,f]));
 if(Object.keys(value).length>MAX_FIELDS)fail(400,'answers','TOO_LARGE');
 const problems=[];
 for(const [key,answer] of Object.entries(value)){
  if(!fieldKey(key)||!fields.has(key))fail(400,'answers','UNKNOWN_FIELD');
  if(typeof answer!=='string')fail(400,'answers.'+key,'INVALID_TYPE');
  const f=fields.get(key);
  if(Array.from(answer).length>(f.type==='TEXT'?(f.max_length||MAX_TEXT_LENGTH):MAX_TEXT_LENGTH))fail(400,'answers.'+key,'TOO_LONG');
  if(f.type==='PRIVATE_ATTACHMENT'&&answer!=='')fail(400,'answers.'+key,'ATTACHMENT_NOT_SUPPORTED');
  if(f.type==='CHOICE'&&answer!==''&&!f.options.includes(answer))problems.push({field:'answers.'+key,reason:'INVALID_CHOICE'});
 }
 if(submission)for(const f of template.fields){
  if(f.type==='PRIVATE_ATTACHMENT'&&f.required)problems.push({field:'answers.'+f.key,reason:'ATTACHMENT_SUBMISSION_NOT_READY'});
  else if(f.required&&(!Object.hasOwn(value,f.key)||!value[f.key].trim()))problems.push({field:'answers.'+f.key,reason:'REQUIRED'});
 }
 if(problems.length)throw Object.assign(error('CUSTOMIZATION_VALIDATION_FAILED',422),{details:problems});
 return value;
}
function validateSubmission(template,answers){return normalizeAnswers(template,answers,{submission:true});}
function availability(template){const blocked=template.fields.some(f=>f.type==='PRIVATE_ATTACHMENT'&&f.required);return {submission_available:!blocked,unavailable_reason:blocked?'ATTACHMENT_SUBMISSION_NOT_READY':null};}
function page({after='',limit=20,current_status=null}={}, {operations=false}={}){
 if(after!=='')id(after);if(!Number.isInteger(limit)||limit<1||limit>100)fail(400,'limit','INVALID_TYPE');
 if(current_status!==null&&!(operations?['SUBMITTED','INTAKE']:['DRAFT','SUBMITTED','INTAKE']).includes(current_status))fail(400,'current_status','INVALID_TYPE');
 return {after,limit,current_status};
}
module.exports={MAX_TEMPLATE_BYTES,MAX_ANSWERS_BYTES,MAX_FIELDS,MAX_TEXT_LENGTH,normalizeTemplate,normalizeAnswers,validateSubmission,availability,page,categoryCode,templateVersion,sourceRef,operationKey};
