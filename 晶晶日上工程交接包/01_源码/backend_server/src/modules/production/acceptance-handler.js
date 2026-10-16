"use strict";
const {createHash}=require('node:crypto');
const {createProductionRepository}=require('./repository');
function createCustomizationAcceptanceHandlers(db,{env={},storageFactory}={}){
 const repo=createProductionRepository(db),caps=new WeakMap();
 const storage=storageFactory?storageFactory():require('../providers/private-storage').createPrivateStorage({env,repository:require('../providers/readiness').createReadinessRepository(db),authorize:async({operation,key,context})=>operation==='get'&&caps.get(context)===key});
 return new Map([['CUSTOMIZATION_ACCEPTANCE',{async execute(job){
  const state=await repo.customizationAcceptanceContext(job);if(!state)return {status:'SUCCEEDED',result_ref:job.payload_ref};const d=state.file.data,ctx={};let available=false;caps.set(ctx,d.object_key);try{const bytes=await storage.getBuffer(d.object_key,ctx);available=Buffer.isBuffer(bytes)&&bytes.length===d.byte_size&&createHash('sha256').update(bytes).digest('hex')===d.content_sha256;}catch{}finally{caps.delete(ctx);}
  await repo.finishCustomizationAcceptance(job,{available,delivery_id:state.delivery_id});return {status:'SUCCEEDED',result_ref:job.payload_ref};
 }}]]);
}
module.exports={createCustomizationAcceptanceHandlers};
