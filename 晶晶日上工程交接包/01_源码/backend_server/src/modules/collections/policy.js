"use strict";
const {createHmac,timingSafeEqual}=require('node:crypto');
const {shape,id,error}=require('../party/policy');
const kinds=Object.freeze(['ARTIST','STOCK','NOTICE']);
function target(kind,key){if(!kinds.includes(kind))throw error('INVALID_COLLECTION_KIND',400);id(key);}
function settings(env={}){
 const integer=(name,fallback,max)=>{const value=env[name]??String(fallback);if(!/^[1-9][0-9]*$/.test(String(value))||Number(value)>max)throw error('COLLECTION_CONFIG_INVALID',503);return Number(value);};
 return {history_days:integer('COLLECTION_HISTORY_DAYS',30,365),history_max_entries:integer('COLLECTION_HISTORY_MAX_ENTRIES',200,1000)};
}
function page(input){shape(input,['kind','cursor','limit']);if(input.kind!==undefined&&!kinds.includes(input.kind))throw error('INVALID_COLLECTION_KIND',400);const limit=input.limit??20;if(!Number.isInteger(limit)||limit<1||limit>100)throw error('INVALID_LIMIT',400);return {kind:input.kind||null,limit};}
function cursors(secret){
 const mac=(scope,value)=>createHmac('sha256',secret).update(JSON.stringify(['collections-v1',scope,value])).digest();
 return {
  encode:(scope,sequence)=>{const value=Buffer.from(String(sequence)).toString('base64url');return value+'.'+mac(scope,value).toString('hex');},
  decode(scope,cursor){if(cursor===undefined)return null;try{if(typeof cursor!=='string'||cursor.length>256)throw 0;const [value,signature,extra]=cursor.split('.');if(extra||!value||!/^[A-Za-z0-9_-]+$/.test(value)||!/^[a-f0-9]{64}$/.test(signature)||!timingSafeEqual(mac(scope,value),Buffer.from(signature,'hex')))throw 0;const sequence=Buffer.from(value,'base64url').toString('utf8');if(!/^[1-9][0-9]{0,19}$/.test(sequence)||BigInt(sequence)>18446744073709551615n)throw 0;return sequence;}catch{throw error('INVALID_CURSOR',400);}}
 };
}
module.exports={kinds,target,settings,page,cursors};
