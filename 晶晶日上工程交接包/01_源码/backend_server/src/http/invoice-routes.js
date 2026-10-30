'use strict';
const express=require('express'),{shape,id,ref,version,error}=require('../modules/party/policy');
function createInvoiceRouter(options){
 const router=express.Router(),repo=require('../modules/invoices/repository').createInvoiceRepository(options.db,options),files=require('../modules/works/assets').createSupplyAssets({...options,repository:repo});
 const wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
 const scope=(req,operations)=>{const party=req.get('X-Acting-Party');if(operations&&party)throw error('ACTING_PARTY_NOT_ALLOWED',400);if(!operations&&!party)throw error('ACTING_PARTY_REQUIRED',400);req.actingParty=party?id(party):null;return {operations,party_id:req.actingParty,...req.params.invoice_id?{invoice_id:id(req.params.invoice_id)}:{}};};
 const reply=(req,res,data)=>{if(data.object_version)res.set('ETag','"'+data.object_version+'"');res.set('Cache-Control','no-store').json({meta:{request_id:req.requestId,actor:{account_id:req.account.id},acting_party:req.actingParty},data});};
 const expected=req=>{const v=req.get('If-Match');if(!v)throw error('EXPECTED_VERSION_REQUIRED',428);if(!/^"[1-9][0-9]*"$/.test(v))throw error('INVALID_VERSION',400);return version(Number(v.slice(1,-1)));};
 const page=req=>({after:req.query.cursor||'',limit:req.query.limit===undefined?20:Number(req.query.limit)});
 const send=(res,body,name)=>res.type('application/octet-stream').set({'Cache-Control':'no-store','Content-Disposition':'attachment; filename="'+name+'"','X-Content-Type-Options':'nosniff'}).send(body);
 router.get('/orders/:order_id/eligibility',wrap(async(req,res)=>{shape(req.query,[]);const s=scope(req,false);reply(req,res,await repo.eligibility(req,{party_id:s.party_id,order_id:id(req.params.order_id)}));}));
 router.post('/requests',wrap(async(req,res)=>{shape(req.query,[]);shape(req.body,['order_id','amount_minor','header','text','asset_ids']);const s=scope(req,false);reply(req,res,await repo.create(req,{...req.body,party_id:s.party_id,operation_key:ref(req.get('Idempotency-Key'))}));}));
 for(const operations of [false,true]){
  const prefix=operations?'/operations/requests':'/requests';
  router.get(prefix,wrap(async(req,res)=>{shape(req.query,['cursor','limit','status']);reply(req,res,await repo.list(req,{...scope(req,operations),...page(req),...req.query.status?{status:req.query.status}:{}}));}));
  router.get(prefix+'/:invoice_id',wrap(async(req,res)=>{shape(req.query,[]);reply(req,res,await repo.read(req,scope(req,operations)));}));
  router.get(prefix+'/:invoice_id/history',wrap(async(req,res)=>{shape(req.query,['cursor','limit']);reply(req,res,await repo.history(req,{...scope(req,operations),...page(req),after:req.query.cursor===undefined?0:Number(req.query.cursor)}));}));
  router.get(prefix+'/:invoice_id/documents',wrap(async(req,res)=>{shape(req.query,['cursor','limit']);reply(req,res,await repo.documents(req,{...scope(req,operations),...page(req)}));}));
  router.post(prefix+'/:invoice_id/actions',wrap(async(req,res)=>{shape(req.query,[]);shape(req.body,['action','text','header','asset_ids','document']);const i={...scope(req,operations),...req.body,expected_version:expected(req),operation_key:ref(req.get('Idempotency-Key'))};
   if(i.action==='VERIFY_DOCUMENT'&&operations){const r=await repo.read(req,i);if(r.pending_document_id){const s={...i,document_id:r.pending_document_id},d=await repo.documentAccess(req,s);if(d.asset_id)await files.download(req,d.asset_id,s);}}
   reply(req,res,await repo.act(req,i));
  }));
  router.get(prefix+'/:invoice_id/assets/:asset_id/content',wrap(async(req,res)=>{shape(req.query,[]);const f=await files.download(req,id(req.params.asset_id),scope(req,operations));send(res,f.body,'invoice-application-evidence.bin');}));
  router.get(prefix+'/:invoice_id/documents/:document_id/content',wrap(async(req,res)=>{shape(req.query,[]);const s={...scope(req,operations),document_id:id(req.params.document_id)},d=await repo.documentAccess(req,s);if(d.asset_id){const f=await files.download(req,d.asset_id,s);send(res,f.body,'invoice-'+d.id+'.pdf');}else{const body=Buffer.from('模拟凭证，非真实发票\n'+JSON.stringify(d.content,null,2)+'\n','utf8');await repo.documentAccess(req,s);send(res,body,'SIMULATION-NOT-TAX-INVOICE-'+d.id+'.txt');}}));
 }
 return router;
}
module.exports={createInvoiceRouter};
