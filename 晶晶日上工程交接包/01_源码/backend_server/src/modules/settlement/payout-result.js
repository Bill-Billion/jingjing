'use strict';
const {error}=require('../party/policy'),C=require('./context'),P=require('./policy');
// The agreement lock held by mutate serializes independently reviewed receipts.
// A debt or submitted receipt is not returned cash: count only approved evidence.
async function result(tx,payout,outcome,amount,code){
 if(payout.kind!=='PAYOUT')throw error(code,409);
 if(outcome!=='RETURNED'){
  if(payout.current_status!=='APPROVED'||!['PAID','FAILED'].includes(outcome)||amount!==payout.data.amount_minor)throw error(code,409);
  return {status:outcome,data:payout.data};
 }
 if(payout.current_status!=='PAID')throw error(code,409);
 const [rows]=await tx.execute("SELECT * FROM finance_records WHERE agreement_id=? AND kind='PAYOUT_EVIDENCE' AND current_status='APPROVED' AND JSON_UNQUOTE(JSON_EXTRACT(data_json,'$.payout_id'))=? AND JSON_UNQUOTE(JSON_EXTRACT(data_json,'$.outcome'))='RETURNED' FOR SHARE",[payout.agreement_id,payout.id]);
 let returned=0;for(const row of rows){const r=C.dto(row);returned=P.signed(returned+r.data.amount_minor);}
 if(amount>payout.data.amount_minor-returned)throw error(code,409);
 returned=P.signed(returned+amount);
 return {status:returned===payout.data.amount_minor?'RETURNED':'PAID',data:{...payout.data,returned_minor:returned}};
}
module.exports={result};
