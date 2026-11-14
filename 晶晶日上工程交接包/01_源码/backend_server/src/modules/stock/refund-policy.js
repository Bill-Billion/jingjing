'use strict';
// Separate the reviewed cash amount from the reviewed licence outcome.
// Missing fields retain the legacy full-refund/revoke operation; they never imply KEEP.
const {error}=require('../party/policy');
async function decision(tx,order,p,i,caseId){
 const explicit=i.refund_minor!=null||i.license_action!=null;
 if(i.decision!=='REFUND'){
  if(explicit)throw error('INVALID_STOCK_REFUND_DECISION',400);
  return null;
 }
 if(!explicit){
  if(p.data.refund_plan||order.data.financial.refunded_minor>0)throw error('STOCK_REFUND_DECISION_REQUIRED',409);
  return null;
 }
 if(!Number.isSafeInteger(i.refund_minor)||i.refund_minor<1||!['KEEP','REVOKE'].includes(i.license_action))throw error('INVALID_STOCK_REFUND_DECISION',400);
 const f=order.data.financial;
 if(order.current_status==='PAYMENT_REVIEW_REQUIRED'||i.refund_minor>f.received_minor-f.refunded_minor)throw error('STOCK_REFUND_AMOUNT_MISMATCH',409);
 if(i.license_action==='KEEP'&&(!p.data.granted_at||p.data.status==='REVOKED'))throw error('STOCK_LICENSE_CANNOT_RESTORE',409);
 const [pending]=await tx.execute("SELECT id FROM trade_records WHERE kind='REFUND' AND order_id=? AND current_status NOT IN ('REJECTED','FAILED','SUCCEEDED')",[order.id]);
 if(pending.length||p.data.status==='REFUND_REQUIRED')throw error('STOCK_REFUND_PENDING',409);
 return {case_id:caseId,amount_minor:i.refund_minor,target_refunded_minor:f.refunded_minor+i.refund_minor,license_action:i.license_action};
}
function retained(order,p){
 const plan=p.data.refund_plan;
 return !!plan&&plan.license_action==='KEEP'&&plan.target_refunded_minor===order.data.financial.refunded_minor&&!!p.data.granted_at&&['PARTIALLY_REFUNDED','REFUNDED'].includes(order.current_status);
}
async function allowed(tx,order,p,allocations){
 const plan=p.data.refund_plan;
 if(!plan)return false;
 if(p.data.current_case_id||p.data.status!=='REFUND_REQUIRED')throw error('STOCK_REFUND_REVIEW_REQUIRED',409);
 const [pending]=await tx.execute("SELECT id FROM trade_records WHERE kind='REFUND' AND order_id=? AND current_status NOT IN ('REJECTED','FAILED','SUCCEEDED')",[order.id]);
 if(pending.length)throw error('STOCK_REFUND_PENDING',409);
 if(allocations.length!==1||allocations[0].line_id!=='stock'||allocations[0].amount_minor!==plan.target_refunded_minor-order.data.financial.refunded_minor)throw error('STOCK_REFUND_AMOUNT_MISMATCH',409);
 return true;
}
module.exports={decision,retained,allowed};
