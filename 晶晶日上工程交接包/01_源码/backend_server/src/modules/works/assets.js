'use strict';
const {createHash}=require('node:crypto');
const {createPrivateStorage}=require('../providers/private-storage');
const {createReadinessRepository}=require('../providers/readiness');
const {error}=require('../party/policy');
function metadata(a){return {id:a.id,owner_party_id:a.owner_party_id,purpose:a.purpose,media_type:a.media_type,byte_size:a.byte_size,content_sha256:a.content_sha256,current_status:a.current_status};}
function createSupplyAssets({db,repository,env={},storageFactory}){
 const grants=new WeakMap();
 const storage=storageFactory?storageFactory():createPrivateStorage({env,repository:createReadinessRepository(db),authorize:async({operation,key,context})=>{const grant=grants.get(context);return !!grant&&grant.operation===operation&&grant.key===key;}});
 async function call(operation,key,work){const ctx={};grants.set(ctx,{operation,key});try{return await work(ctx);}finally{grants.delete(ctx);}}
 return Object.freeze({
  async upload(ctx,input){
   const {asset,replay}=await repository.reserveAsset(ctx,input);if(replay)return metadata(asset);
   try{
    const result=await call('put',asset.object_key,context=>storage.put({key:asset.object_key,body:input.body,contentType:asset.media_type,isPrivate:true},context));
    if(result.sha256!==asset.content_sha256||result.size!==asset.byte_size||result.key!==asset.object_key)throw error('PRIVATE_UPLOAD_MISMATCH',503);
    return metadata(await repository.finishAsset(ctx,asset.id,true));
   }catch(e){await repository.finishAsset(ctx,asset.id,false).catch(()=>{});throw e;}
  },
  async read(ctx,id,partyId){return metadata(await repository.assetAccess(ctx,id,partyId));},
  async download(ctx,id,partyId){
   const asset=await repository.assetAccess(ctx,id,partyId);
   const body=await call('get',asset.object_key,context=>storage.getBuffer(asset.object_key,context));
   if(!Buffer.isBuffer(body)||body.length!==asset.byte_size||createHash('sha256').update(body).digest('hex')!==asset.content_sha256)throw error('PRIVATE_CONTENT_MISMATCH',503);
   // Recheck permission after transport; never redirect to a public or signed URL.
   await repository.assetAccess(ctx,id,partyId);return {body,metadata:metadata(asset)};
  },
 });
}
module.exports={createSupplyAssets};
