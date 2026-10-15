'use strict';
const {error}=require('../party/policy');
const {digest}=require('../governance/content');
const {coversConsent}=require('../works/consent-policy');
const one=async(tx,sql,args=[])=>(await tx.execute(sql,args))[0][0];
function checked(row){if(!row)throw error('PRODUCTION_NOT_FOUND',404);const data=typeof row.data_json==='string'?JSON.parse(row.data_json):row.data_json;if(digest(data)!==row.data_sha256)throw error('STORED_CONTENT_MISMATCH',503);return {...row,data};}
 async function productionUsable(tx,p,{paid=true}={}){
  for(const party of new Set([p.data.buyer_party_id,p.data.merchant_party_id,p.data.producer_party_id])){const row=await one(tx,'SELECT current_status FROM parties WHERE id=? FOR SHARE',[party]);if(!row||['SUSPENDED','CLOSED'].includes(row.current_status))throw error('PRODUCTION_PARTY_NOT_ACTIVE',409);}
  if(!await one(tx,"SELECT m.id FROM party_memberships m JOIN identity_accounts a ON a.id=m.account_id WHERE m.party_id=? AND m.account_id=? AND m.current_status='ACTIVE' AND a.current_status='ACTIVE' FOR SHARE",[p.data.producer_party_id,p.data.assignee_account_id]))throw error('ASSIGNEE_NOT_MEMBER',409);
  const order=checked(await one(tx,"SELECT * FROM trade_records WHERE id=? AND kind='ORDER' FOR SHARE",[p.order_id]));
  if(!['OPEN','PARTIALLY_PAID','PAID'].includes(order.current_status)||order.data.financial.refunded_minor>0)throw error('PRODUCTION_ORDER_BLOCKED',409);
  if(p.current_status!=='READY'&&p.current_status!=='IN_PROGRESS'&&p.current_status!=='ACCEPTED')throw error('PRODUCTION_NOT_READY',409);
  const source=checked(await one(tx,"SELECT * FROM supply_records WHERE id=? AND kind='WORK_VERSION' FOR SHARE",[p.data.script_version_id]));if(source.current_status!=='REVIEWS_COMPLETE')throw error('PRODUCTION_SCRIPT_NOT_APPROVED',409);
  if(!order.data.quote.license_reservation_id&&source.data.version.content.kind!=='ORIGINAL')throw error('PRODUCTION_LICENSE_NOT_READY',409);
  if(order.data.quote.license_reservation_id){const reservation=checked(await one(tx,"SELECT * FROM license_records WHERE id=? AND kind='RESERVATION' FOR SHARE",[order.data.quote.license_reservation_id]));const [bindings]=await tx.execute("SELECT b.id FROM license_records b JOIN license_records g ON g.id=b.parent_id WHERE b.kind='BINDING' AND b.current_status='ACTIVE' AND g.parent_id=? AND JSON_UNQUOTE(JSON_EXTRACT(b.data_json,'$.project_id'))=?",[reservation.id,p.data.license_project_id]);if(!reservation.data.terms.rights.includes('PRODUCE')||!bindings.length||source.data.version.content.source_version_id!==reservation.data.work_version_id)throw error('PRODUCTION_LICENSE_NOT_READY',409);const content=source.data.version.content;if(content.kind!=='PROJECT_ADAPTATION'||content.project_id!==p.data.license_project_id||!await require('../licensing/repository').validBinding(tx,{party_id:p.data.buyer_party_id,source:{id:content.source_version_id},project_id:p.data.license_project_id}))throw error('PRODUCTION_LICENSE_NOT_READY',409);}
  const now=new Date().toISOString();for(const consentId of p.data.consent_ids){const c=checked(await one(tx,"SELECT * FROM supply_records WHERE id=? AND kind='CONSENT' FOR SHARE",[consentId]));for(const feature of c.data.consent.features)if(!coversConsent(c,{feature,purpose:p.data.purpose,territory:p.data.territory},now))throw error('PRODUCTION_CONSENT_NOT_AVAILABLE',409);}
  if(paid){const steps=order.data.quote.installments.filter(x=>x.trigger==='ORDER_ACCEPTED');for(const step of steps){const paidStep=await one(tx,'SELECT payment_id FROM trade_installments WHERE order_id=? AND installment_key=?',[p.order_id,step.key]);if(!paidStep)throw error('PRODUCTION_PAYMENT_REQUIRED',409);}}
  return order;
 }
module.exports={productionUsable};
