 'use strict';
const {digest}=require('../governance/content');
// Financial condition only. Existing licensing checks still govern rights and signatures.
async function licensePaymentUsable(tx,reservationId){
 const [[link]]=await tx.execute('SELECT order_id FROM trade_license_orders WHERE reservation_id=?',[reservationId]);if(!link)return true;
 const [[row]]=await tx.execute('SELECT * FROM trade_records WHERE id=? FOR SHARE',[link.order_id]);if(!row||['CANCELLED','PAYMENT_REVIEW_REQUIRED'].includes(row.current_status))return false;
 const data=typeof row.data_json==='string'?JSON.parse(row.data_json):row.data_json;if(digest(data)!==row.data_sha256)return false;
 const fees=data.quote.lines.filter(x=>x.line_kind==='LICENSE');if(fees.length!==1)return false;
 const [facts]=await tx.execute('SELECT r.data_json,r.data_sha256,j.direction FROM trade_journal j JOIN trade_records r ON r.id=j.source_id WHERE j.order_id=?',[row.id]);let received=0;
 for(const fact of facts){const d=typeof fact.data_json==='string'?JSON.parse(fact.data_json):fact.data_json;if(digest(d)!==fact.data_sha256)return false;const allocated=d.allocations.filter(x=>x.line_id===fees[0].line_id).reduce((n,x)=>n+x.amount_minor,0);if(fact.direction==='REFUND'&&allocated>0)return false;if(fact.direction==='RECEIPT')received+=allocated;}
 const [[reservation]]=await tx.execute('SELECT data_json,data_sha256 FROM license_records WHERE id=? FOR SHARE',[reservationId]);if(!reservation)return false;const terms=typeof reservation.data_json==='string'?JSON.parse(reservation.data_json):reservation.data_json;if(digest(terms)!==reservation.data_sha256||!Number.isSafeInteger(terms.payment_due_minor))return false;return received>=terms.payment_due_minor;
}
module.exports={licensePaymentUsable};
