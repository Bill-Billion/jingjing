'use strict';
const A=require('../artists/context'),C=require('./context'),P=require('./policy'),{error}=require('../party/policy');
async function enforce(db,account,path,method){
 if(/^\/(guardians(?:\/|$)|privacy(?:\/|$)|auth(?:\/|$)|support(?:\/|$)|infringement(?:\/|$))/.test(path)||method==='GET'&&/^\/(me|parties)(\/|$)/.test(path))return;
 return db.withTransaction(async tx=>{
 const raw=await A.one(tx,"SELECT * FROM guardian_records WHERE kind='LINK' AND child_account_id=? ORDER BY created_at DESC,id DESC LIMIT 1 FOR SHARE",[account.id]);if(!raw)return;
 const r=await C.active(tx,C.checked(raw));
 // Guardian permission is not an authorization to collect/model children or charge their money.
 if(method!=='GET'||!/^\/(discovery|directory|stock\/catalog|notices)(\/|$)/.test(path))throw error('MINOR_REAL_SERVICE_NOT_ENABLED',403);
 const at=await A.now(tx),usage=await A.one(tx,'SELECT * FROM guardian_usage WHERE child_account_id=? AND local_date=?',[account.id,P.date(at)]);
 P.use(r.data,at,usage);throw error('MINOR_CONTENT_POOL_NOT_ENABLED',403);
 });
}
module.exports={enforce};
