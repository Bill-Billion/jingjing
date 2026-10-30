"use strict";
const {shape,id,label,error}=require('../party/policy');
const states=['SUBMITTED','PROCESSING','NEEDS_INFO','ANSWERED','CLOSED'];
function content(i){label(i.text,4000);if(!Array.isArray(i.asset_ids)||i.asset_ids.length>10||new Set(i.asset_ids).size!==i.asset_ids.length)throw error('INVALID_SUPPORT_ATTACHMENTS',400);i.asset_ids.forEach(id);return {text:i.text,asset_ids:i.asset_ids};}
function transition(status,action,staff){
 const allowed=staff?{START:[['SUBMITTED'],'PROCESSING'],REQUEST_INFO:[['PROCESSING'],'NEEDS_INFO'],ANSWER:[['PROCESSING'],'ANSWERED'],CLOSE:[['ANSWERED'],'CLOSED']}:{SUPPLEMENT:[['NEEDS_INFO'],'SUBMITTED'],REOPEN:[['ANSWERED','CLOSED'],'SUBMITTED'],CLOSE:[['ANSWERED'],'CLOSED']};
 const rule=allowed[action];if(!rule)throw error('SUPPORT_ACTION_FORBIDDEN',403);if(!rule[0].includes(status))throw error('SUPPORT_STATE_CONFLICT',409);return rule[1];
}
function page(i){shape(i,['party_id','operations','after','limit','status']);const limit=i.limit??20;if(!Number.isInteger(limit)||limit<1||limit>100)throw error('INVALID_LIMIT',400);if(i.after)id(i.after);if(i.status!==undefined&&!states.includes(i.status))throw error('INVALID_SUPPORT_STATUS',400);return limit;}
module.exports={content,transition,page,states};
