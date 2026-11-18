'use strict';
const {shape,label,id,error}=require('../party/policy'),{instant}=require('../trade/policy'),{digest}=require('../governance/content');
const kinds=['CATEGORY','COLLECTION','PLACEMENT'];
function code(value){if(typeof value!=='string'||!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(value))throw error('CATALOG_CODE_INVALID',400);return value;}
function text(v,max){label(v,max);if(/[<>]|javascript:|data:/i.test(v))throw error('CATALOG_PLAIN_TEXT_REQUIRED',400);}
function content(kind,i){
 if(!kinds.includes(kind))throw error('CATALOG_KIND_INVALID',400);
 const base=['title','description','sort_order'];
 shape(i,[...base,...(kind==='COLLECTION'?['category_id','collection_kind','theme_code','listing_ids','valid_from','valid_until']:kind==='PLACEMENT'?['collection_id','slot_code','valid_from','valid_until']:[])]);
 text(i.title,120);text(i.description,2000);if(!Number.isInteger(i.sort_order)||i.sort_order<0||i.sort_order>10000)throw error('CATALOG_SORT_INVALID',400);
 if(kind!=='CATEGORY'){instant(i.valid_from);instant(i.valid_until);if(i.valid_from>=i.valid_until)throw error('CATALOG_PERIOD_INVALID',400);}
 if(kind==='COLLECTION'){
  id(i.category_id);code(i.theme_code);if(!['HOLIDAY','THEME','TEMPLATE'].includes(i.collection_kind))throw error('CATALOG_COLLECTION_KIND_INVALID',400);
  if(!Array.isArray(i.listing_ids)||!i.listing_ids.length||i.listing_ids.length>50||new Set(i.listing_ids).size!==i.listing_ids.length)throw error('CATALOG_LISTINGS_INVALID',400);i.listing_ids.forEach(id);
 }
 if(kind==='PLACEMENT'){id(i.collection_id);code(i.slot_code);}
 return structuredClone(i);
}
function page(i,scope){const limit=i.limit??20;if(!Number.isInteger(limit)||limit<1||limit>100)throw error('INVALID_LIMIT',400);const hash=digest([scope,i.kind||'',i.code||'',i.category_id||'',i.slot_code||'']);let after=null;
 if(i.cursor){try{if(typeof i.cursor!=='string'||i.cursor.length>512||!/^[A-Za-z0-9_-]+$/.test(i.cursor))throw 0;after=JSON.parse(Buffer.from(i.cursor,'base64url').toString());shape(after,['scope','id','sort']);if(after.scope!==hash||!Number.isInteger(after.sort)||after.sort<0||after.sort>10000)throw 0;id(after.id);}catch{throw error('INVALID_CURSOR',400);}}
 return {limit,after:after?.id||'',sort:after?.sort??0,scope:hash};
}
const cursor=(id,scope,sort=0)=>Buffer.from(JSON.stringify({id,scope,sort})).toString('base64url');
module.exports={kinds,code,content,page,cursor};
