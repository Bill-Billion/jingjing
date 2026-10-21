 'use strict';
const express=require('express'),{id,ref,shape,version,error}=require('../modules/party/policy');
const posts=[
 ['/service-credits','claimServiceCredit',['benefit_id','stock_id'],'required'],
 ['/pools','createPool',['config','bindings','starts_at','ends_at','terms','cost_limit_single_minor','cost_limit_ten_minor','evidence_asset_ids'],'required'],
 ['/pools/:record_id/review','reviewPool',['channel','decision','reason','evidence_asset_id'],'none',true],
 ['/pools/:record_id/retirement','retirePool',['reason'],'none',true],
 ['/draws','draw',['pool_id','rules_sha256','count'],'required'],
 ['/grants/:record_id/checkout','holdCoupon',['quote_id'],'required',true],
 ['/holds/:record_id/release','releaseCoupon',[],'required',true],
 ['/stock','createStock',['template','evidence_asset_ids'],'required'],
 ['/stock/:record_id/review','reviewStock',['decision','reason'],'none',true],
 ['/exchanges','exchange',['stock_id','template_sha256'],'required'],
 ['/grants/:record_id/bind','bind',['person_id','avatar_id','cast','profile_id'],'required',true],
 ['/grants/:record_id/deliveries','proposeDelivery',['starts_at','ends_at','reference','evidence_asset_id'],'none',true],
 ['/deliveries/:record_id/review','reviewDelivery',['decision','reason'],'none',true],
 ['/grants/:record_id/confirmation','acknowledge',['accepted'],'required',true],
 ['/grants/:record_id/finish','finish',['outcome','evidence_asset_id','reason'],'none',true],
 ['/grants/:record_id/remedies','requestRemedy',['reason'],'required',true],
 ['/remedies/:record_id/review','reviewRemedy',['decision','reason','evidence_asset_id'],'none',true]
];
const gets=[['/pools','pools',[],'none'],['/pools/:record_id','pool',[],'none'],['/draws','myDraws',[],'required'],['/draws/:record_id','drawRecord',[],'required'],['/catalog','catalog',[],'none'],['/grants','myGrants',[],'required'],['/grants/:record_id','grant',[],'required'],['/queue','queue',['kind','cursor','limit'],'none'],['/exposures','exposures',['city'],'none']];
function createRedemptionRouter({db,resolvePrincipal,env={},storageFactory}){const router=express.Router(),repo=require('../modules/redemption/repository').createRedemptionRepository(db,{resolvePrincipal});const wrap=f=>(req,res,next)=>Promise.resolve().then(()=>f(req,res)).catch(next);function party(req,mode){const v=req.get('X-Acting-Party');if(mode==='none'&&v)throw error('ACTING_PARTY_NOT_ALLOWED',400);if(mode==='required'&&!v)throw error('ACTING_PARTY_REQUIRED',400);req.actingParty=v?id(v):null;return req.actingParty;}function expected(req){const v=req.get('If-Match');if(!v)throw error('EXPECTED_VERSION_REQUIRED',428);if(!/^"[1-9][0-9]*"$/.test(v))throw error('INVALID_VERSION',400);return version(Number(v.slice(1,-1)));}function reply(req,res,data){res.set('Cache-Control','no-store');if(data.object_version)res.set('ETag','"'+data.object_version+'"');res.json({meta:{request_id:req.requestId,actor:{account_id:req.account.id},acting_party:req.actingParty},data});}
for(const [path,method,fields,mode,match]of posts)router.post(path,wrap(async(req,res)=>{shape(req.query,[]);shape(req.body,fields);const p=party(req,mode);reply(req,res,await repo[method](req,{...req.body,...(mode==='none'?{}:{party_id:p}),...(req.params.record_id?{record_id:id(req.params.record_id)}:{}),...(match?{expected_version:expected(req)}:{}),operation_key:ref(req.get('Idempotency-Key'))}));}));
for(const [path,method,fields,mode]of gets)router.get(path,wrap(async(req,res)=>{shape(req.query,fields);const p=party(req,mode);reply(req,res,await repo[method](req,{...req.query,...(req.query.limit?{limit:Number(req.query.limit)}:{}),...(req.query.cursor?{after:id(req.query.cursor)}:{}),...(req.params.record_id?{record_id:id(req.params.record_id)}:{}),...(mode==='none'?{}:{party_id:p})}));}));
const files=require('../modules/works/assets').createSupplyAssets({db,env,storageFactory,repository:{assetAccess:(ctx,assetId)=>repo.evidence(ctx,{record_id:id(ctx.params.record_id),asset_id:id(assetId)})}});
router.get('/records/:record_id/evidence/:asset_id',wrap(async(req,res)=>{shape(req.query,[]);party(req,'none');const f=await files.download(req,id(req.params.asset_id));res.set({'Cache-Control':'no-store','Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="private-evidence"','X-Content-Type-Options':'nosniff'}).end(f.body);}));
return router;}
module.exports={createRedemptionRouter,posts,gets};
