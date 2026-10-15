 'use strict';
const express=require('express'),{createHash}=require('node:crypto');
const {createSettlementRepository}=require('../modules/settlement/repository');
const {createPrivateStorage}=require('../modules/providers/private-storage');
const {createReadinessRepository}=require('../modules/providers/readiness');
const {shape,id,ref,version,error}=require('../modules/party/policy');
function createSettlementRouter({db,resolvePrincipal,env={},storageFactory,providerFactory}){
 const router=express.Router(),repo=createSettlementRepository(db,{resolvePrincipal}),caps=new WeakMap();
 const storage=storageFactory?storageFactory():createPrivateStorage({env,repository:createReadinessRepository(db),authorize:async({operation,key,context})=>caps.get(context)?.key===key&&caps.get(context)?.operation===operation});
 const wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
 const acting=(req,required=true)=>{const v=req.get('X-Acting-Party');if(!v){if(required)throw error('ACTING_PARTY_REQUIRED',400);return null;}return req.actingParty=id(v);};
 const expected=req=>{const v=req.get('If-Match');if(!v)throw error('EXPECTED_VERSION_REQUIRED',428);if(!/^"[1-9][0-9]*"$/.test(v))throw error('INVALID_VERSION',400);return version(Number(v.slice(1,-1)));};
 const reply=(req,res,data)=>res.status(200).set('Cache-Control','no-store').type('application/json').end(JSON.stringify({meta:{request_id:req.requestId,actor:{account_id:req.account.id},acting_party:req.actingParty||null},data}));
 function post(path,method,fields,{party=true,existing=false}={}){router.post(path,wrap(async(req,res)=>{shape(req.query,[]);shape(req.body,fields);reply(req,res,await repo[method](req,{...req.body,operation_key:ref(req.get('Idempotency-Key')),...(party?{party_id:acting(req)}:{}),...(existing?{record_id:id(req.params.record_id),expected_version:expected(req)}:{})}));}));}
 post("/agreements","agreement",["source_type", "source_id", "previous_agreement_id", "environment", "rule_id", "rules", "evidence_asset_id"],{party:true,existing:false});
 post("/records/:record_id/confirmations","confirm",["content_sha256", "decision", "reason"],{party:true,existing:true});
 post("/agreements/:record_id/settlements","settle",["period_reference", "note"],{party:true,existing:true});
 post("/agreements/:record_id/statements","statement",["external_reference", "period_start", "period_end", "gross_minor", "refund_minor", "channel_fee_minor", "tax_minor", "direction", "original_statement_id", "evidence_asset_id", "note"],{party:true,existing:true});
 post("/statements/:record_id/receipts","receipt",["amount_minor", "external_reference", "occurred_at", "evidence_asset_id", "note"],{party:true,existing:true});
 post("/agreements/:record_id/adjustments","adjust",["entries", "reason", "evidence_asset_id"],{party:true,existing:true});
 post("/agreements/:record_id/payouts","requestPayout",["recipient_party_id", "amount_minor", "destination_asset_id", "note"],{party:true,existing:true});
 post("/payouts/:record_id/evidence","payoutEvidence",["outcome", "amount_minor", "external_reference", "occurred_at", "evidence_asset_id", "note"],{party:true,existing:true});
 post("/payouts/:record_id/cancellation","cancelPayout",["reason"],{party:true,existing:true});
 post("/records/:record_id/disputes","dispute",["category", "reason", "evidence_asset_ids"],{party:true,existing:true});
 post("/disputes/:record_id/responses","respond",["message", "evidence_asset_ids"],{party:true,existing:true});
 post("/disputes/:record_id/decisions","decideDispute",["decision", "reason", "action_record_id"],{party:false,existing:true});
 post("/records/:record_id/reviews","review",["decision", "reason", "verification"],{party:false,existing:true});
 post("/agreements/:record_id/reconciliations","reconcile",["provider", "environment", "external_reference", "items", "evidence_asset_id"],{party:true,existing:true});
 router.get('/agreements',wrap(async(req,res)=>{shape(req.query,['cursor','limit']);reply(req,res,await repo.list(req,{kind:'AGREEMENT',party_id:acting(req,false),after:req.query.cursor||'',limit:req.query.limit===undefined?20:Number(req.query.limit)}));}));
 router.get('/agreements/:record_id/records',wrap(async(req,res)=>{shape(req.query,['kind','cursor','limit']);reply(req,res,await repo.list(req,{agreement_id:id(req.params.record_id),party_id:acting(req,false),kind:req.query.kind,after:req.query.cursor||'',limit:req.query.limit===undefined?20:Number(req.query.limit)}));}));
 router.get('/records/:record_id',wrap(async(req,res)=>{shape(req.query,[]);reply(req,res,await repo.read(req,{record_id:id(req.params.record_id),party_id:acting(req,false)}));}));
 for(const [path,method] of [['/records/:record_id/confirmations','confirmations'],['/agreements/:record_id/readiness','readiness'],['/agreements/:record_id/balances','balances']])router.get(path,wrap(async(req,res)=>{shape(req.query,[]);reply(req,res,await repo[method](req,{record_id:id(req.params.record_id),party_id:acting(req,false)}));}));
 router.get('/agreements/:record_id/entries',wrap(async(req,res)=>{shape(req.query,['cursor','limit']);reply(req,res,await repo.entries(req,{record_id:id(req.params.record_id),party_id:acting(req,false),after:req.query.cursor===undefined?0:Number(req.query.cursor),limit:req.query.limit===undefined?50:Number(req.query.limit)}));}));
 router.get('/notifications',wrap(async(req,res)=>{shape(req.query,['cursor','limit']);reply(req,res,await repo.notifications(req,{party_id:acting(req),after:req.query.cursor===undefined?0:Number(req.query.cursor),limit:req.query.limit===undefined?30:Number(req.query.limit)}));}));
 async function download(asset){const data=asset.data||asset,ctx={};caps.set(ctx,{operation:'get',key:data.object_key});try{const bytes=await storage.getBuffer(data.object_key,ctx);if(!Buffer.isBuffer(bytes)||bytes.length!==data.byte_size||createHash('sha256').update(bytes).digest('hex')!==data.content_sha256)throw error('PRIVATE_CONTENT_MISMATCH',503);return bytes;}finally{caps.delete(ctx);}}
 const bytes=(res,body)=>res.status(200).set({'Cache-Control':'no-store','Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="finance-evidence"','X-Content-Type-Options':'nosniff'}).end(body);
 router.get('/records/:record_id/evidence/:asset_id',wrap(async(req,res)=>{shape(req.query,[]);const input={record_id:id(req.params.record_id),asset_id:id(req.params.asset_id),party_id:acting(req,false)},asset=await repo.evidence(req,input),body=await download(asset);await repo.evidence(req,input);bytes(res,body);}));
 return router;
}
module.exports={createSettlementRouter};
