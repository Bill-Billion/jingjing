'use strict';
const express=require('express'),{shape,id,ref,version,error}=require('../modules/party/policy');
function createRechargeRefundRouter({db,resolvePrincipal,env={},storageFactory}){
 const router=express.Router(),repo=require('../modules/wallet/recharge-refunds').createRechargeRefunds(db,{resolvePrincipal}),{view}=require('../modules/wallet/recharge-refund-view');
 const wrap=f=>(req,res,next)=>Promise.resolve().then(()=>f(req,res)).catch(next);
 function party(req,own){const v=req.get('X-Acting-Party');if(own&&!v)throw error('ACTING_PARTY_REQUIRED',400);if(!own&&v)throw error('ACTING_PARTY_NOT_ALLOWED',400);return req.actingParty=v?id(v):null;}
 function expected(req){const v=req.get('If-Match');if(!v)throw error('EXPECTED_VERSION_REQUIRED',428);if(!/^"[1-9][0-9]*"$/.test(v))throw error('INVALID_VERSION',400);return version(Number(v.slice(1,-1)));}
 function input(req,fields,match=false){shape(req.query,[]);shape(req.body,fields);return {...req.body,...req.params.record_id?{record_id:id(req.params.record_id)}:{},...match?{expected_version:expected(req)}:{},operation_key:ref(req.get('Idempotency-Key'))};}
 function reply(req,res,data){res.set('Cache-Control','no-store');if(data.object_version)res.set('ETag','"'+data.object_version+'"');res.json({meta:{request_id:req.requestId,actor:{account_id:req.account.id},acting_party:req.actingParty},data});}
 const fields=['recharge_id','amount_minor','reason','evidence_asset_ids'];
 router.post('/recharge-refunds',wrap(async(q,s)=>{const p=party(q,true);reply(q,s,view(await repo.request(q,{...input(q,fields),party_id:p})));}));
 router.post('/guardian-recharge-refunds',wrap(async(q,s)=>{party(q,false);const i=input(q,[...fields,'child_party_id','guardian_link_id']);const {child_party_id,...rest}=i;reply(q,s,view(await repo.request(q,{...rest,party_id:id(child_party_id),guardian_link_id:id(rest.guardian_link_id)})));}));
 for(const [prefix,mode]of [['/recharge-refunds','SELF'],['/guardian-recharge-refunds','GUARDIAN'],['/operations/recharge-refunds','OPERATIONS']]){
  router.get(prefix,wrap(async(q,s)=>{const p=party(q,mode==='SELF');shape(q.query,['cursor','limit']);if(q.query.limit!==undefined&&!/^[1-9][0-9]{0,2}$/.test(q.query.limit))throw error('INVALID_LIMIT',400);reply(q,s,await repo.list(q,{...mode==='SELF'?{party_id:p}:mode==='GUARDIAN'?{guardian:true}:{operations:true},after:q.query.cursor||'',limit:q.query.limit===undefined?20:Number(q.query.limit)}));}));
  router.get(prefix+'/:record_id',wrap(async(q,s)=>{const p=party(q,mode==='SELF');shape(q.query,[]);const record_id=id(q.params.record_id),r=mode==='GUARDIAN'?await repo.readForGuardian(q,{record_id}):await repo.read(q,{record_id,...mode==='SELF'?{party_id:p}:{operations:true}});reply(q,s,view(r,{operations:mode==='OPERATIONS'}));}));
 }
 router.post('/recharge-refunds/:record_id/cancellation',wrap(async(q,s)=>{const p=party(q,true);reply(q,s,view(await repo.cancel(q,{...input(q,['reason'],true),party_id:p})));}));
 for(const [suffix,method,fields]of [['review','review',['decision','amount_minor','reason','checks']],['scheduling','schedule',[]],['retry','retryTask',['reason']]]){
  router.post('/operations/recharge-refunds/:record_id/'+suffix,wrap(async(q,s)=>{party(q,false);const r=await repo[method](q,input(q,fields,true));reply(q,s,view(r.record||r,{operations:true}));}));
 }
 const files=require('../modules/works/assets').createSupplyAssets({db,env,storageFactory,repository:{assetAccess:(ctx,asset_id)=>repo.evidence(ctx,{record_id:id(ctx.params.record_id),asset_id})}});
 router.get('/operations/recharge-refunds/:record_id/evidence/:asset_id',wrap(async(q,s)=>{party(q,false);shape(q.query,[]);const f=await files.download(q,id(q.params.asset_id));s.set({'Cache-Control':'no-store','Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="refund-evidence"','X-Content-Type-Options':'nosniff'}).end(f.body);}));
 return router;
}
module.exports={createRechargeRefundRouter};
