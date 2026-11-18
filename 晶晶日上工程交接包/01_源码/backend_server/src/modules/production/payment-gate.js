"use strict";
const {digest}=require('../governance/content');
const QP=require('../customization/quote-policy');
const S=require('./customization-state');
async function productionPaymentGate(tx,{order,trigger}){
 const stage={SAMPLE_ACCEPTED:'SAMPLE',FINAL_ACCEPTED:'FINAL',CUSTOMIZATION_INTERIM_CONFIRMED:'SAMPLE',CUSTOMIZATION_SCRIPT_CONFIRMED:'SCRIPT'}[trigger];
 if(!stage)return false;
 const lines=order.data.quote.lines.filter(x=>x.line_kind==='PRODUCTION');
 if(!lines.length)return false;
 for(const line of lines){
  const [[row]]=await tx.execute('SELECT r.* FROM production_order_lines l JOIN production_records r ON r.id=l.project_id WHERE l.order_id=? AND l.line_id=? FOR SHARE',[order.id,line.line_id]);
  if(!row||!['IN_PROGRESS','ACCEPTED'].includes(row.current_status))return false;
  const d=typeof row.data_json==='string'?JSON.parse(row.data_json):row.data_json;
  if(digest(d)!==row.data_sha256)return false;
  const project={...row,data:d},flow=await S.get(tx,project);
  if(trigger===QP.SCRIPT_TRIGGER||trigger==='CUSTOMIZATION_INTERIM_CONFIRMED'){
   if(!flow||QP.interimTrigger(flow.terms)!==trigger||!flow.started_at||flow.state!=='STARTED')return false;
   if(trigger===QP.SCRIPT_TRIGGER){
    if(!d.current.SCRIPT||d.current.SCRIPT!==d.accepted.SCRIPT)return false;
   }else if(flow.terms.preview_payment_order==='INTERIM_BEFORE_PREVIEW'){
    if(!d.current.SCRIPT||d.accepted.SCRIPT!==d.current.SCRIPT||!d.current.SAMPLE)return false;
    const [[v]]=await tx.execute("SELECT current_status FROM production_records WHERE id=? AND kind='VERSION'",[d.current.SAMPLE]);
    if(v?.current_status!=='APPROVED')return false;
   }else if(!d.current.SAMPLE||d.accepted.SAMPLE!==d.current.SAMPLE)return false;
  }else if(!d.current[stage]||d.current[stage]!==d.accepted[stage])return false;
  if(flow&&!flow.manual_sample&&trigger==='FINAL_ACCEPTED'&&!await S.paidStep(tx,order,QP.interimTrigger(flow.terms)))return false;
  await require('./eligibility').productionUsable(tx,project,{paid:false});
 }
 return true;
}
module.exports={productionPaymentGate};
