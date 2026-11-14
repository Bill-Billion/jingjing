"use strict";
const express=require('express'),{shape,id,ref,version,error}=require('../modules/party/policy');
function createSupportRouter(options){
 const router=express.Router(),repo=require('../modules/support/repository').createSupportRepository(options.db,options),files=require('../modules/works/assets').createSupplyAssets({...options,repository:repo});
 const wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
 const scope=(req,operations)=>{const party=req.get('X-Acting-Party');if(operations&&party)throw error('ACTING_PARTY_NOT_ALLOWED',400);if(!operations&&!party)throw error('ACTING_PARTY_REQUIRED',400);req.actingParty=party?id(party):null;return {operations,party_id:req.actingParty,...req.params.ticket_id?{ticket_id:id(req.params.ticket_id)}:{}};};
 const reply=(req,res,data)=>{if(data.object_version)res.set('ETag','"'+data.object_version+'"');res.set('Cache-Control','no-store').json({meta:{request_id:req.requestId,actor:{account_id:req.account.id},acting_party:req.actingParty},data});};
 const expected=req=>{const v=req.get('If-Match');if(!v)throw error('EXPECTED_VERSION_REQUIRED',428);if(!/^"[1-9][0-9]*"$/.test(v))throw error('INVALID_VERSION',400);return version(Number(v.slice(1,-1)));};
 for(const operations of [false,true]){
  const prefix=operations?'/operations/tickets':'/tickets';
  router.get(prefix,wrap(async(req,res)=>{shape(req.query,['cursor','limit','status']);reply(req,res,await repo.list(req,{...scope(req,operations),after:req.query.cursor||'',limit:req.query.limit===undefined?20:Number(req.query.limit),...req.query.status!==undefined?{status:req.query.status}:{}}));}));
  router.get(prefix+'/:ticket_id',wrap(async(req,res)=>{shape(req.query,[]);reply(req,res,await repo.read(req,scope(req,operations)));}));
  router.get(prefix+'/:ticket_id/history',wrap(async(req,res)=>{shape(req.query,['cursor','limit']);reply(req,res,await repo.history(req,{...scope(req,operations),after:req.query.cursor===undefined?0:Number(req.query.cursor),limit:req.query.limit===undefined?20:Number(req.query.limit)}));}));
  router.post(prefix+'/:ticket_id/actions',wrap(async(req,res)=>{shape(req.query,[]);shape(req.body,['action','text','asset_ids']);reply(req,res,await repo.act(req,{...scope(req,operations),...req.body,expected_version:expected(req),operation_key:ref(req.get('Idempotency-Key'))}));}));
  router.get(prefix+'/:ticket_id/assets/:asset_id/content',wrap(async(req,res)=>{shape(req.query,[]);const file=await files.download(req,id(req.params.asset_id),scope(req,operations));res.type('application/octet-stream').set({'Cache-Control':'no-store','Content-Disposition':'attachment; filename="support-evidence.bin"','X-Content-Type-Options':'nosniff'}).send(file.body);}));
 }
 router.post('/tickets',wrap(async(req,res)=>{shape(req.query,[]);shape(req.body,['kind','title','target','text','asset_ids']);const s=scope(req,false);reply(req,res,await repo.create(req,{party_id:s.party_id,...req.body,operation_key:ref(req.get('Idempotency-Key'))}));}));
 return router;
}
module.exports={createSupportRouter};
