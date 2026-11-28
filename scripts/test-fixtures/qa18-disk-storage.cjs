'use strict';
// Explicit synthetic QA storage. No runtime defaults or external service credentials.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash,randomUUID}=require('node:crypto');
const {protectPrivateState}=require('./private-state.cjs');
const sha=b=>createHash('sha256').update(b).digest('hex');
async function openQaStorage(directory,{seed=new Map()}={}){
 const dir=path.resolve(directory);assert(dir.split(path.sep).includes('.local'),'QA_STORAGE_LOCAL_ONLY');
 await fs.mkdir(dir,{recursive:true});const index=path.join(dir,'STORAGE.private.json');let rows={};
 try{rows=JSON.parse(await fs.readFile(index,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 function valid(key){assert(typeof key==='string'&&key.length>0&&key.length<=1024&&!/[\x00-\x1f]/.test(key),'INVALID_STORAGE_KEY');}
 for(const[k,v]of Object.entries(rows)){valid(k);assert(v.file===sha(k)&&/^[a-f0-9]{64}$/.test(v.sha256)&&Number.isSafeInteger(v.size)&&v.size>=0,'INVALID_STORAGE_INDEX');}
 let queue=Promise.resolve();
 async function privateWrite(file,bytes){const tmp=file+'.'+randomUUID()+'.tmp';await fs.writeFile(tmp,'',{flag:'wx'});await protectPrivateState(tmp);await fs.writeFile(tmp,bytes);await fs.rename(tmp,file);}
 const storage={
  async put({key,body}){valid(key);const bytes=Buffer.from(body),digest=sha(bytes);const action=async()=>{const old=rows[key];if(old){assert(old.sha256===digest&&old.size===bytes.length,'QA_IMMUTABLE_OBJECT_CONFLICT');const actual=await storage.getBuffer(key);assert(actual.equals(bytes));return {key,size:old.size,sha256:old.sha256};}const file=sha(key);await privateWrite(path.join(dir,file),bytes);rows[key]={file,size:bytes.length,sha256:digest};await privateWrite(index,JSON.stringify(rows,null,2));return {key,size:bytes.length,sha256:digest};};const result=queue.then(action);queue=result.catch(()=>{});return result;},
  async getBuffer(key){valid(key);const row=rows[key];if(!row)return undefined;const bytes=await fs.readFile(path.join(dir,row.file));assert(bytes.length===row.size&&sha(bytes)===row.sha256,'QA_STORAGE_INTEGRITY_FAILURE');return bytes;},
 };
 for(const[key,body]of seed)await storage.put({key,body});
 return {storageFactory:()=>storage,inventory:()=>structuredClone(rows),directory:dir};
}
module.exports={openQaStorage};
