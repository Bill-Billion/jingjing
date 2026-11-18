"use strict";
// Approval is a server-reviewed record, never a client qualification checkbox.
const P=require('./policy');
const POLICY='CONTRACT_20261029';
function live(record,at){return record.current_status==='APPROVED'&&typeof record.data.valid_from==='string'&&record.data.valid_from<=at&&record.data.valid_until>at;}
function manualReviewApproved(records,at){return records.some(r=>live(r,at)&&[2,3].includes(r.data.level));}
function stockStatus(person,records,at){
 let identity_verified=true;try{P.adult(person,at);}catch(e){if(e.status!==409)throw e;identity_verified=false;}
 const l1_verified=identity_verified&&records.some(r=>live(r,at)&&r.data.level===1),manual_review_approved=manualReviewApproved(records,at);
 const blocking_reasons=[];if(!identity_verified)blocking_reasons.push('ARTIST_IDENTITY_REQUIRED');if(!l1_verified)blocking_reasons.push('STOCK_L1_REQUIRED');if(!manual_review_approved)blocking_reasons.push('STOCK_HALO_REVIEW_REQUIRED');
 return {policy_version:POLICY,identity_verified,l1_verified,manual_review_approved,eligible:blocking_reasons.length===0,blocking_reasons};
}
module.exports={POLICY,manualReviewApproved,stockStatus};
