'use strict';
const {id,error}=require('../party/policy'),A=require('../artists/context');
const sections={AUDITION_DISTANCE_LOCATIONS:'PROFILE'};
async function page(tx,account,{section,after='',limit}){
 if(section!=='AUDITION_DISTANCE_LOCATIONS')throw error('INVALID_INPUT',400);if(after)id(after);
 const sql="SELECT l.* FROM audition_distance_locations l JOIN audition_records r ON r.id=l.offer_id JOIN parties p ON p.id=r.owner_party_id WHERE p.kind='PERSON' AND p.personal_account_id=? AND l.consent_account_id=?";
 if(after&&!(await tx.execute(sql+' AND l.offer_id=?',[account,account,after]))[0].length)throw error('INVALID_CURSOR',400);
 const rows=(await tx.execute(sql+' AND l.offer_id>? ORDER BY l.offer_id LIMIT ?',[account,account,after,limit+1]))[0];
 return {section,items:rows.slice(0,limit).map(r=>({offer_id:r.offer_id,object_version:r.object_version,enabled:!!r.enabled,grid:r.enabled?{latitude_grid:r.latitude_grid,longitude_grid:r.longitude_grid}:null,notice_version:r.notice_version,updated_at:A.instant(r.updated_at)})),next_cursor:rows.length>limit?rows[limit-1].offer_id:null,coverage:'OWN_ACCOUNT_RECORDS_ONLY',request_completion:'NOT_CONFIRMED'};
}
module.exports={sections,page};
