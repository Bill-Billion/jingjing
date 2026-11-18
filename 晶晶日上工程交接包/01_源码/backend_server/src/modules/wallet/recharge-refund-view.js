'use strict';
// Never serialize the internal record, provider binding or trusted receipt to a client.
function view(r,{operations=false}={}){
 const d=r.data;
 return {id:r.id,current_status:r.current_status,object_version:r.object_version,recharge_id:r.parent_id,
 requested_minor:d.requested_minor,amount_minor:d.amount_minor,currency:d.currency,reason:d.reason,
 created_at:d.created_at,submitted_at:d.submitted_at,settled_at:d.settled_at,
 applicant_kind:d.guardian_link_id?'GUARDIAN':'SELF',task_scheduled:!!d.dispatch_job_id,
 ...(operations?{evidence_asset_ids:d.evidence_asset_ids}: {})};
}
module.exports={view};
