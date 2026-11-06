"use strict";
const P=require('./policy'),W=require('../production/working-calendar'),{verifyRuleContent}=require('../governance/content'),{error}=require('../party/policy');
// Missing/insufficient calendars must not prevent a person from lodging a request.
// Such dates stay explicitly estimated; only a verified published rule earns REVIEWED_CALENDAR.
async function deadline(tx,at,{calendar={},calendarVersion=null}={}){
 const [rows]=await tx.execute("SELECT * FROM governance_rules WHERE rule_key='privacy.working-calendar' AND current_status='EFFECTIVE' AND effective_at<=CURRENT_TIMESTAMP(3) ORDER BY effective_at DESC,id DESC LIMIT 1 FOR SHARE");
 if(!rows.length)return {date:P.dueDate(new Date(at),calendar),version:calendarVersion};
 const r=rows[0],c=verifyRuleContent(typeof r.content_json==='string'?JSON.parse(r.content_json):r.content_json);
 if(c.id!==r.id||c.rule_key!==r.rule_key||c.version!==r.version_label)throw error('STORED_CONTENT_MISMATCH',503);
 try{
  const d=W.workingDeadline(at,15,c.terms.working_calendar),version=r.id;
  return {date:d.deadline_basis.deadline_date,version};
 }catch(e){if(!['CUSTOMIZATION_CALENDAR_COVERAGE_REQUIRED','INVALID_WORKING_CALENDAR'].includes(e.code))throw e;return {date:P.dueDate(new Date(at)),version:null};}
}
module.exports={deadline};
