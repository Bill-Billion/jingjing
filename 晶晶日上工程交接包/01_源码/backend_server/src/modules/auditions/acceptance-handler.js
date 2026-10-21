"use strict";
const {createHash}=require('node:crypto');
function createAuditionHandlers(db,{env={},storageFactory}={}){
 const repo=require('./repository').createAuditionsRepository(db),caps=new WeakMap();
 const storage=storageFactory?storageFactory():require('../providers/private-storage').createPrivateStorage({env,repository:require('../providers/readiness').createReadinessRepository(db),authorize:async({operation,key,context})=>operation==='get'&&caps.get(context)===key});
 return new Map([['AUDITION_EXPIRY',{async execute(job){await repo.expireJob(job);return {status:'SUCCEEDED',result_ref:job.payload_ref};}}],['AUDITION_ACCEPTANCE',{async execute(job){let state;try{state=await repo.timeoutContext(job);}catch(e){if(![403,404,409].includes(e.status))throw e;await repo.finishTimeout(job,false);return {status:'SUCCEEDED',result_ref:job.payload_ref};}if(!state)return {status:'SUCCEEDED',result_ref:job.payload_ref};let available=true;for(const f of state.files){const ctx={};caps.set(ctx,f.object_key);try{const b=await storage.getBuffer(f.object_key,ctx);if(!Buffer.isBuffer(b)||b.length!==f.byte_size||createHash('sha256').update(b).digest('hex')!==f.content_sha256)available=false;}catch{available=false;}finally{caps.delete(ctx);}}await repo.finishTimeout(job,available);return {status:'SUCCEEDED',result_ref:job.payload_ref};}}]]);
}
module.exports={createAuditionHandlers};
