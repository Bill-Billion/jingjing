"use strict";
const {shape,label,id,capabilityCodes,error}=require('../party/policy');
const {instant}=require('../trade/policy'),{digest}=require('../governance/content');
function windowOf(i){instant(i.valid_from);instant(i.valid_until);if(i.valid_from>=i.valid_until)throw error('DIRECTORY_PERIOD_INVALID',400);}
function profile(i){shape(i,['display_name','introduction','city','capabilities','cover_asset_id','evidence_asset_ids','valid_from','valid_until']);label(i.display_name,120);label(i.introduction,2000);label(i.city,100);windowOf(i);
 if(!Array.isArray(i.capabilities)||i.capabilities.length>5||new Set(i.capabilities).size!==i.capabilities.length||i.capabilities.some(x=>!capabilityCodes.includes(x)))throw error('DIRECTORY_CAPABILITIES_INVALID',400);
 if(i.cover_asset_id!==null)id(i.cover_asset_id);
 if(!Array.isArray(i.evidence_asset_ids)||!i.evidence_asset_ids.length||i.evidence_asset_ids.length>10||new Set(i.evidence_asset_ids).size!==i.evidence_asset_ids.length)throw error('DIRECTORY_EVIDENCE_REQUIRED',400);i.evidence_asset_ids.forEach(id);
 return {...i,capabilities:[...i.capabilities],evidence_asset_ids:[...i.evidence_asset_ids]};
}
function feature(i){shape(i,['listing_id','recommendation','sort_order','valid_from','valid_until']);id(i.listing_id);label(i.recommendation,500);windowOf(i);if(!Number.isInteger(i.sort_order)||i.sort_order<0||i.sort_order>10000)throw error('DIRECTORY_ORDER_INVALID',400);return {...i};}
function page(i,kind){const limit=i.limit??20;if(!Number.isInteger(limit)||limit<1||limit>100)throw error('INVALID_LIMIT',400);if(i.city!==undefined)label(i.city,100);if(i.q!==undefined)label(i.q,100);const scope=digest([kind,i.city||'',i.q||'',i.party_id||'']);let after=null;
 if(i.cursor){try{if(typeof i.cursor!=='string'||i.cursor.length>512||!/^[A-Za-z0-9_-]+$/.test(i.cursor))throw 0;after=JSON.parse(Buffer.from(i.cursor,'base64url').toString('utf8'));shape(after,['v','scope','sort','id']);if(after.v!==1||after.scope!==scope||!Number.isInteger(after.sort)||after.sort<0||after.sort>10000)throw 0;id(after.id);}catch{throw error('INVALID_CURSOR',400);}}
 return {limit,scope,after};
}
const cursor=(r,scope)=>Buffer.from(JSON.stringify({v:1,scope,sort:r.sort_order,id:r.id})).toString('base64url');
module.exports={profile,feature,page,cursor};
