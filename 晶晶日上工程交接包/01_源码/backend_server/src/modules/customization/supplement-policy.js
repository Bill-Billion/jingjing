 'use strict';
const {shape,error}=require('../party/policy');
const {canonical}=require('../governance/content');
function text(x,max){if(typeof x!=='string'||!x.trim()||Array.from(x).length>max)throw error('INVALID_SUPPLEMENT',400);}
function bounded(value){if(Buffer.byteLength(canonical(value),'utf8')>16*1024)throw error('SUPPLEMENT_TOO_LARGE',400);return value;}
function items(template,input){
 if(!Array.isArray(input)||!input.length||input.length>40)throw error('INVALID_SUPPLEMENT',400);
 const seen=new Set(),fields=new Map(template.fields.map(f=>[f.key,f]));
 for(const item of input){
  shape(item,['field_key','reason','instruction']);
  const field=fields.get(item.field_key);
  if(!field||seen.has(item.field_key))throw error('INVALID_SUPPLEMENT_FIELD',400);
  seen.add(item.field_key);text(item.reason,500);text(item.instruction,1000);
 }
 return bounded(input);
}
function responses(items,input,{submit=false}={}){
 shape(input,items.map(x=>x.field_key));
 for(const value of Object.values(input))if(typeof value!=='string'||Array.from(value).length>2000)throw error('INVALID_SUPPLEMENT_RESPONSE',400);
 bounded(input);
 if(submit){const details=items.filter(x=>!input[x.field_key]?.trim()).map(x=>({field:'responses.'+x.field_key,reason:'REQUIRED'}));
  if(details.length)throw Object.assign(error('CUSTOMIZATION_VALIDATION_FAILED',422),{details});}
 return input;
}
module.exports={items,responses};
