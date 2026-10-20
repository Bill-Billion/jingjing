'use strict';
const {shape,id,error}=require('../party/policy'),{digest}=require('../governance/content');
const A=require('../artists/context'),C=require('./context'),P=require('./policy');
async function quote(tx,key){const r=await A.one(tx,"SELECT * FROM trade_records WHERE id=? AND kind='QUOTE' FOR UPDATE",[id(key)]);if(!r)throw error('TRADE_NOT_FOUND',404);return {...r,data:require('../production/customization-state').decode(r)};}
function discounted(q,g,holdId){
 const t=g.data.template,original=structuredClone(q.data);
 if(!['PRODUCTION_CREDIT','PRODUCTION_FREE','SERVICE_CREDIT'].includes(t.kind)||q.current_status!=='APPROVED'||q.buyer_party_id!==g.owner_party_id||original.transaction_model!=='PLATFORM_PRINCIPAL'||!original.customization||original.customization_change||original.cocreation||original.discount||original.channel==='APPLE')throw error('COUPON_QUOTE_NOT_ELIGIBLE',409);
 if(original.lines.length!==1||original.lines[0].quantity!==1||original.lines[0].product_profile?.type!=='PRIVATE_CUSTOMIZATION'||!t.production.spec_ids.includes(original.lines[0].spec_id))throw error('COUPON_PRODUCT_NOT_ELIGIBLE',409);
 if(original.total_minor<t.production.minimum_minor)throw error('COUPON_MINIMUM_NOT_MET',409);
 const discount_minor=t.production.face_minor,total_minor=original.total_minor-discount_minor;
 if(total_minor<0||total_minor>0&&total_minor<10)throw error('COUPON_FREE_ORDER_FLOW_REQUIRED',409);
 const lines=original.lines.map(l=>({...l,unit_minor:total_minor,total_minor}));
 const amounts=[Math.floor(total_minor*30/100),Math.floor(total_minor*90/100)-Math.floor(total_minor*30/100),total_minor-Math.floor(total_minor*90/100)];
 require('../customization/quote-policy').plan(original.lines,original.installments);
 const installments=total_minor===0?[]:original.installments.map((s,k)=>({...s,allocations:[{line_id:lines[0].line_id,amount_minor:amounts[k]}]}));
 const adjusted={...original,lines,installments,total_minor,discount:{hold_id:holdId,grant_id:g.id,original_quote_sha256:digest(original),original_total_minor:original.total_minor,original_lines:original.lines,discount_minor,rule_snapshot:t,coverage:total_minor===0?'FULL':'PARTIAL',source_kind:t.kind,refund_forfeit:true,cashable:false}};
 require('../customization/finance-policy').checked(adjusted,q.merchant_party_id);return adjusted;
}
function methods({db,actor}){return {
 async holdCoupon(ctx,i){
  shape(i,['record_id','party_id','expected_version','quote_id','operation_key']);
  return db.withTransaction(async tx=>{const a=await actor(tx,ctx);await A.owner(tx,a,i.party_id);const q=await quote(tx,i.quote_id),g=await C.load(tx,i.record_id,'GRANT');
   if(g.owner_party_id!==i.party_id||q.buyer_party_id!==i.party_id)throw error('REDEMPTION_NOT_FOUND',404);
   return C.command(tx,a,'COUPON_HOLD',i,async()=>{A.match(g,i.expected_version);await require('./service-credit').validSource(tx,g);const at=await A.now(tx);P.usable(g,at);if(g.data.template.kind!=='SERVICE_CREDIT')await C.owner(tx,a,i.party_id,true);
    if(q.data.expires_at<=at)throw error('QUOTE_NOT_ACCEPTABLE',409);
    const stock=await C.load(tx,g.parent_id,'STOCK','FOR SHARE');if(stock.owner_party_id!==q.merchant_party_id)throw error('COUPON_MERCHANT_MISMATCH',409);
    const expires_at=new Date(Math.min(Date.parse(g.data.expires_at),Date.parse(q.data.expires_at),Date.parse(at)+q.data.payment_window_minutes*60000)).toISOString();
    const h=await C.insert(tx,a,'COUPON_HOLD',i.party_id,g.id,'HELD',{quote_id:q.id,quote_sha256:digest(q.data),grant_id:g.id,expires_at,order_id:null,adjusted_quote:null,adjusted_quote_sha256:null});
    const adjusted_quote=discounted(q,g,h.id);await C.save(tx,a,g,'HELD',{...g.data,checkout_hold_id:h.id},'COUPON_HELD');
    return C.save(tx,a,h,'HELD',{...h.data,adjusted_quote,adjusted_quote_sha256:digest(adjusted_quote)},'COUPON_PRICE_PREVIEWED');});});
 },
 async releaseCoupon(ctx,i){
  shape(i,['record_id','party_id','expected_version','operation_key']);
  return db.withTransaction(async tx=>{const a=await actor(tx,ctx);await A.owner(tx,a,i.party_id);const hint=await C.load(tx,i.record_id,'COUPON_HOLD','');await quote(tx,hint.data.quote_id);const g=await C.load(tx,hint.parent_id,'GRANT'),h=await C.load(tx,hint.id,'COUPON_HOLD');
   if(h.owner_party_id!==i.party_id)throw error('REDEMPTION_NOT_FOUND',404);
   return C.command(tx,a,'COUPON_RELEASE',i,async()=>{A.match(h,i.expected_version);if(h.current_status!=='HELD'||h.data.order_id||g.current_status!=='HELD'||g.data.checkout_hold_id!==h.id)throw error('COUPON_CANCEL_ORDER_FIRST',409);
    await C.save(tx,a,g,'AVAILABLE',{...g.data,checkout_hold_id:null},'COUPON_RELEASED');return C.save(tx,a,h,'RELEASED',h.data,'COUPON_HOLD_RELEASED');});});
 }
};}
// Transaction ports called only by the existing trade repository, preserving order/receipt facts.
async function accept(tx,a,q,selection){
 if(selection===undefined)return q.data;
 shape(selection,['hold_id','adjusted_quote_sha256']);
 const hint=await C.load(tx,id(selection.hold_id),'COUPON_HOLD',''),g=await C.load(tx,hint.parent_id,'GRANT'),h=await C.load(tx,hint.id,'COUPON_HOLD');
 if(h.owner_party_id!==q.buyer_party_id||h.data.quote_id!==q.id||h.current_status!=='HELD'||h.data.order_id||h.data.expires_at<=await A.now(tx)||g.current_status!=='HELD'||g.data.checkout_hold_id!==h.id||h.data.quote_sha256!==digest(q.data)||h.data.adjusted_quote_sha256!==selection.adjusted_quote_sha256)throw error('COUPON_HOLD_NOT_VALID',409);
 await require('./service-credit').validSource(tx,g);if(g.data.template.kind!=='SERVICE_CREDIT')await A.verifiedAdultParty(tx,q.buyer_party_id);const adjusted=discounted(q,g,h.id);
 if(digest(adjusted)!==h.data.adjusted_quote_sha256)throw error('COUPON_PRICE_CHANGED',409);return adjusted;
}
async function bind(tx,a,order){const d=order.data.quote.discount;if(!d)return;const h=await C.load(tx,d.hold_id,'COUPON_HOLD');await C.save(tx,a,h,'BOUND',{...h.data,order_id:order.id,...(d.coverage==='FULL'?{expires_at:(await C.load(tx,d.grant_id,'GRANT','FOR SHARE')).data.expires_at}:{})},'COUPON_BOUND_TO_ORDER');}
async function payment(tx,order){
 const d=order.data.quote.discount;if(!d)return;const g=await C.load(tx,d.grant_id,'GRANT','FOR SHARE'),h=await C.load(tx,d.hold_id,'COUPON_HOLD','FOR SHARE');
 await require('./service-credit').validSource(tx,g);if(h.data.order_id!==order.id||!['BOUND','USED'].includes(h.current_status)||!['HELD','USED'].includes(g.current_status))throw error('COUPON_HOLD_NOT_VALID',409);
 // Once a provider has received a payment, reconciliation takes precedence over releasing its coupon.
 if(h.current_status==='BOUND'&&h.data.expires_at<=await A.now(tx))throw error('COUPON_HOLD_EXPIRED',409);
}
async function financial(tx,a,order){
 const d=order.data.quote.discount;if(!d||order.data.financial.received_minor<=0)return;
 const g=await C.load(tx,d.grant_id,'GRANT'),h=await C.load(tx,d.hold_id,'COUPON_HOLD');
 if(h.data.order_id!==order.id||!['BOUND','USED'].includes(h.current_status)||!['HELD','USED'].includes(g.current_status))throw error('COUPON_FINANCIAL_MISMATCH',503);
 if(h.current_status==='BOUND'){
  // Preserve trusted cash receipts even if the original activity was cancelled later.
  let source_problem=null;try{await require('./service-credit').consume(tx,a,g,order);}catch(e){if(e.code!=='SERVICE_CREDIT_SOURCE_REVOKED')throw e;source_problem=e.code;}
  if(source_problem)g.data={...g.data,source_problem};
  await C.save(tx,a,g,'USED',{...g.data,used_order_id:order.id,used_at:await A.now(tx)},'COUPON_USED_ON_RECEIPT');
  await C.save(tx,a,h,'USED',h.data,'COUPON_HOLD_USED');
 }
}
async function cancel(tx,a,order){
 const d=order.data.quote.discount;if(!d)return;const g=await C.load(tx,d.grant_id,'GRANT'),h=await C.load(tx,d.hold_id,'COUPON_HOLD');
 if(h.data.order_id!==order.id||h.current_status!=='BOUND'||g.current_status!=='HELD')throw error('COUPON_HOLD_NOT_VALID',409);
 await C.save(tx,a,g,'AVAILABLE',{...g.data,checkout_hold_id:null},'COUPON_CANCELLED_ORDER_RELEASED');await C.save(tx,a,h,'RELEASED',h.data,'COUPON_HOLD_RELEASED');
}
async function covered(tx,order){
 const d=order.data.quote.discount;if(!d||d.coverage!=='FULL')return false;
 if(order.current_status!=='REWARD_FUNDED'||order.data.quote.total_minor!==0||order.data.financial.received_minor!==0||order.data.financial.refunded_minor!==0)throw error('REWARD_ORDER_MISMATCH',409);
 await payment(tx,order);return true;
}
async function start(tx,a,order){
 if(!await covered(tx,order))return;
 const d=order.data.quote.discount,g=await C.load(tx,d.grant_id,'GRANT'),h=await C.load(tx,d.hold_id,'COUPON_HOLD');
 if(h.current_status==='USED')return;
 await require('./service-credit').consume(tx,a,g,order);
 await C.save(tx,a,g,'USED',{...g.data,used_order_id:order.id,used_at:await A.now(tx)},'REWARD_USED_ON_PRODUCTION_START');await C.save(tx,a,h,'USED',h.data,'COUPON_HOLD_USED');
}
module.exports={methods,discounted,accept,bind,payment,financial,cancel,covered,start};
