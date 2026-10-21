 'use strict';
const express=require('express'),{createOperationsRepository}=require('../modules/operations/repository');
const {shape,id,ref,version,error}=require('../modules/party/policy'),{csv}=require('../modules/operations/policy');
function createBusinessOperationsRouter({db,resolvePrincipal}){
 const router=express.Router(),repo=createOperationsRepository(db,{resolvePrincipal});
 const wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
 const acting=(req,required=false)=>{const p=req.get('X-Acting-Party');if(!p&&required)throw error('ACTING_PARTY_REQUIRED',400);return req.actingParty=p?id(p):null;};
 const key=req=>ref(req.get('Idempotency-Key'));
 const expected=req=>{const v=req.get('If-Match');if(!v)throw error('EXPECTED_VERSION_REQUIRED',428);if(!/^"[1-9][0-9]*"$/.test(v))throw error('INVALID_VERSION',400);return version(Number(v.slice(1,-1)));};
 const reply=(req,res,data)=>res.status(200).json({meta:{request_id:req.requestId,actor:{account_id:req.account.id},acting_party:req.actingParty||null},data});
 const page=req=>({before:req.query.cursor===undefined?0:Number(req.query.cursor),limit:req.query.limit===undefined?30:Number(req.query.limit)});
 const target=req=>({domain:req.params.domain,record_id:id(req.params.record_id),party_id:acting(req)});
 router.get('/notifications',wrap(async(req,res)=>{shape(req.query,['cursor','limit','unread_only']);if(req.query.unread_only!==undefined&&!['true','false'].includes(req.query.unread_only))throw error('INVALID_FILTER',400);reply(req,res,await repo.inbox(req,{...page(req),unread_only:req.query.unread_only==='true',party_id:acting(req,true)}));}));
 router.post('/notifications/:event_id/read',wrap(async(req,res)=>{shape(req.query,[]);shape(req.body,[]);key(req);reply(req,res,await repo.markRead(req,{event_id:Number(req.params.event_id),party_id:acting(req,true)}));}));
 router.get('/objects/:domain/:record_id/comments',wrap(async(req,res)=>{shape(req.query,['cursor','limit']);reply(req,res,await repo.comments(req,{...target(req),after:req.query.cursor||'',limit:req.query.limit===undefined?30:Number(req.query.limit)}));}));
 router.post('/objects/:domain/:record_id/comments',wrap(async(req,res)=>{shape(req.query,[]);shape(req.body,['body','reply_to']);reply(req,res,await repo.addComment(req,{...target(req),...req.body,operation_key:key(req)}));}));
 router.post('/comments/:comment_id/actions',wrap(async(req,res)=>{shape(req.query,[]);shape(req.body,['action','reason']);reply(req,res,await repo.changeComment(req,{...req.body,comment_id:id(req.params.comment_id),party_id:acting(req),operation_key:key(req),expected_version:expected(req)}));}));
 router.get('/audit',wrap(async(req,res)=>{shape(req.query,['cursor','limit','object_id']);reply(req,res,await repo.audit(req,{...page(req),object_id:req.query.object_id||null}));}));
 router.get('/objects/:domain/:record_id/audit',wrap(async(req,res)=>{shape(req.query,['cursor','limit']);reply(req,res,await repo.businessAudit(req,{...target(req),after:req.query.cursor||'',limit:req.query.limit===undefined?30:Number(req.query.limit)}));}));
 router.post('/reports',wrap(async(req,res)=>{shape(req.query,[]);shape(req.body,['kind','environment','period_start','period_end']);reply(req,res,await repo.requestReport(req,{...req.body,party_id:acting(req),operation_key:key(req)}));}));
 router.get('/reports/:report_id',wrap(async(req,res)=>{shape(req.query,[]);reply(req,res,await repo.report(req,{report_id:id(req.params.report_id),party_id:acting(req)}));}));
 router.get('/reports/:report_id/content',wrap(async(req,res)=>{shape(req.query,[]);const r=await repo.report(req,{report_id:id(req.params.report_id),party_id:acting(req)});if(!r.result)throw error('REPORT_NOT_READY',409);res.status(200).set({'Cache-Control':'no-store','Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="business-report.csv"','X-Content-Type-Options':'nosniff'}).end(csv(r.result));}));
 router.post('/reports/:report_id/retries',wrap(async(req,res)=>{shape(req.query,[]);shape(req.body,['reason']);reply(req,res,await repo.retryReport(req,{...req.body,report_id:id(req.params.report_id),party_id:acting(req),operation_key:key(req)}));}));
 return router;
}
module.exports={createBusinessOperationsRouter};
