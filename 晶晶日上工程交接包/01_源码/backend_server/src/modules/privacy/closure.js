"use strict";
const {digest}=require('../governance/content');
const {error}=require('../party/policy');
function checked(r){const d=typeof r.data_json==='string'?JSON.parse(r.data_json):r.data_json;if(digest(d)!==r.data_sha256)throw error('STORED_CONTENT_MISMATCH',503);return d;}
// Only positively identified, completed buyer purchases may bypass manual resolution.
// A merchant's continuing financial/licensing obligations are deliberately not inferred away.
async function hasTradeObligations(tx,party){
 const [rows]=await tx.execute("SELECT * FROM trade_records WHERE (buyer_party_id=? OR merchant_party_id=?) AND ((kind='ORDER' AND current_status NOT IN ('CANCELLED','REFUNDED')) OR (kind IN ('PAYMENT','REFUND') AND current_status NOT IN ('SUCCEEDED','FAILED','CANCELLED','REJECTED'))) FOR SHARE",[party,party]);
 for(const r of rows){
  if(r.kind!=='ORDER'||r.merchant_party_id===party||r.buyer_party_id!==party||r.current_status!=='PAID')return true;
  const order=checked(r);
  const [[stock]]=await tx.execute('SELECT * FROM stock_purchases WHERE order_id=? AND buyer_party_id=? FOR SHARE',[r.id,party]);
  if(stock){const d=checked(stock);if(d.status==='ACTIVE'&&d.accepted_at&&!d.current_case_id)continue;return true;}
  const lines=order.quote?.lines;if(!Array.isArray(lines)||!lines.length||lines.some(l=>l.product_profile?.type!=='PRIVATE_CUSTOMIZATION'))return true;
  for(const line of lines){
   const [[f]]=await tx.execute('SELECT f.* FROM production_order_lines l JOIN production_fulfillments f ON f.project_id=l.project_id WHERE l.order_id=? AND l.line_id=? FOR SHARE',[r.id,line.line_id]);
   if(!f)return true;const d=checked(f);if(d.state!=='DELIVERED'||!d.completion?.version_id||d.cancellation)return true;
   const [[open]]=await tx.execute("SELECT id FROM production_fulfillment_cases WHERE project_id=? AND current_status<>'RESOLVED' LIMIT 1 FOR SHARE",[f.project_id]);if(open)return true;
  }
 }
 return false;
}
module.exports={hasTradeObligations};
