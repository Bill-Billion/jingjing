'use strict';
const {id,error}=require('../party/policy'),Risk=require('../operations/message-risk');
const sections={MESSAGE_DECISIONS:'PROFILE'};
async function page(tx,account,{section,after='',limit}){
 if(section!=='MESSAGE_DECISIONS')throw error('INVALID_INPUT',400);if(after)id(after);
 const sql='SELECT * FROM conversation_message_attempts WHERE actor_account_id=?';
 if(after&&!(await tx.execute(sql+' AND id=?',[account,after]))[0].length)throw error('INVALID_CURSOR',400);
 const rows=(await tx.execute(sql+' AND id>? ORDER BY id LIMIT ?',[account,after,limit+1]))[0];
 return {section,items:rows.slice(0,limit).map(Risk.checked),next_cursor:rows.length>limit?rows[limit-1].id:null,coverage:'OWN_ACCOUNT_RECORDS_ONLY',request_completion:'NOT_CONFIRMED'};
}
module.exports={sections,page};
