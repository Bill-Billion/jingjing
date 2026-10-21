"use strict";
const {createHash}=require('node:crypto');
function createStockAcceptanceHandlers(db,{env={},storageFactory}={}){
 const repo=require('./repository').createStockRepository(db),caps=new WeakMap();
 const storage=storageFactory?storageFactory():require('../providers/private-storage').createPrivateStorage({env,repository:require('../providers/readiness').createReadinessRepository(db),authorize:async({operation,key,context})=>operation==='get'&&caps.get(context)===key});
 return new Map([['STOCK_ACCEPTANCE',{async execute(job){
  let state;try{state=await repo.acceptanceContext(job);}catch(e){if(![403,404,409].includes(e.status))throw e;await repo.finishAcceptance(job,false);return {status:'SUCCEEDED',result_ref:job.payload_ref};}
  if(!state)return {status:'SUCCEEDED',result_ref:job.payload_ref};const d=state.file,ctx={};let available=false;caps.set(ctx,d.object_key);try{const bytes=await storage.getBuffer(d.object_key,ctx);available=Buffer.isBuffer(bytes)&&bytes.length===d.byte_size&&createHash('sha256').update(bytes).digest('hex')===d.content_sha256;}catch{}finally{caps.delete(ctx);}
  await repo.finishAcceptance(job,available);return {status:'SUCCEEDED',result_ref:job.payload_ref};
 }}]]);
}
module.exports={createStockAcceptanceHandlers};
