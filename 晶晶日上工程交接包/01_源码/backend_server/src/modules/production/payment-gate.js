 'use strict';
const {digest}=require('../governance/content');
async function productionPaymentGate(tx,{order,trigger}){
 const stage={SAMPLE_ACCEPTED:'SAMPLE',FINAL_ACCEPTED:'FINAL'}[trigger];if(!stage)return false;
 const lines=order.data.quote.lines.filter(x=>x.line_kind==='PRODUCTION');if(!lines.length)return false;
 for(const line of lines){const [[row]]=await tx.execute('SELECT r.* FROM production_order_lines l JOIN production_records r ON r.id=l.project_id WHERE l.order_id=? AND l.line_id=? FOR SHARE',[order.id,line.line_id]);if(!row||!['IN_PROGRESS','ACCEPTED'].includes(row.current_status))return false;const d=typeof row.data_json==='string'?JSON.parse(row.data_json):row.data_json;if(digest(d)!==row.data_sha256||!d.current[stage]||d.current[stage]!==d.accepted[stage])return false;await require('./eligibility').productionUsable(tx,{...row,data:d},{paid:false});}
 return true;
}
module.exports={productionPaymentGate};
