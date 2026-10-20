"use strict";
const express=require('express'),{shape,id,ref,error}=require('../modules/party/policy');
function createMediaRouter(options){const router=express.Router(),service=require('../modules/media/service').createMediaService(options.db,options),wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
 const reply=(req,res,data)=>res.json({meta:{request_id:req.requestId,actor:{account_id:req.account.id},acting_party:req.actingParty||null},data});
 router.post('/tasks',wrap(async(req,res)=>{shape(req.query,[]);shape(req.body,['task_kind','source_kind','source_id','variant','policy_rule_id']);if(!req.get('X-Acting-Party'))throw error('ACTING_PARTY_REQUIRED',400);const party_id=req.actingParty=id(req.get('X-Acting-Party'));reply(req,res,await service.create(req,{...req.body,party_id,operation_key:ref(req.get('Idempotency-Key'))}));}));
 router.get('/tasks/:task_id',wrap(async(req,res)=>{shape(req.query,[]);if(req.get('X-Acting-Party'))throw error('ACTING_PARTY_NOT_ALLOWED',400);req.actingParty=null;reply(req,res,await service.read(req,id(req.params.task_id)));}));
 router.get('/operations/tasks/:task_id',wrap(async(req,res)=>{shape(req.query,[]);if(req.get('X-Acting-Party'))throw error('ACTING_PARTY_NOT_ALLOWED',400);req.actingParty=null;reply(req,res,await service.readForReview(req,id(req.params.task_id)));}));
 router.post('/operations/tasks/:task_id/review',wrap(async(req,res)=>{shape(req.query,[]);shape(req.body,['decision','reason','result_sha256']);if(req.get('X-Acting-Party'))throw error('ACTING_PARTY_NOT_ALLOWED',400);req.actingParty=null;reply(req,res,await service.review(req,{...req.body,task_id:id(req.params.task_id),operation_key:ref(req.get('Idempotency-Key'))}));}));
 return router;
}
module.exports={createMediaRouter};
