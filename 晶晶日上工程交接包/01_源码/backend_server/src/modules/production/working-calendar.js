"use strict";
// Pure, explicitly supplied calendar. No network, server locale or guessed holidays.
const {shape,ref,error}=require('../party/policy');
const {digest}=require('../governance/content');
const DAY=86400000,OFFSET=8*3600000;
function date(value){
 if(typeof value!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(value))throw error('INVALID_WORKING_CALENDAR',400);
 const n=Date.parse(value+'T00:00:00.000Z');
 if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==value)throw error('INVALID_WORKING_CALENDAR',400);
 return n;
}
function calendar(v){
 shape(v,['version','source_ref','timezone','valid_from','valid_until','non_working_dates','working_dates']);ref(v.version);ref(v.source_ref);
 const from=date(v.valid_from),until=date(v.valid_until);
 if(v.timezone!=='Asia/Shanghai'||until<from||until-from>3*366*DAY)throw error('INVALID_WORKING_CALENDAR',400);
 const seen=new Set();
 for(const name of ['non_working_dates','working_dates']){
  if(!Array.isArray(v[name])||v[name].length>1100)throw error('INVALID_WORKING_CALENDAR',400);
  for(const d of v[name]){const n=date(d);if(n<from||n>until||seen.has(d))throw error('INVALID_WORKING_CALENDAR',400);seen.add(d);}
 }
 return structuredClone(v);
}
function workingDeadline(start,days,c){
 c=calendar(c);
 if(!Number.isInteger(days)||days<1||days>30||typeof start!=='string'||!Number.isFinite(Date.parse(start)))throw error('INVALID_WORKING_CALENDAR',400);
 const received=new Date(Date.parse(start)+OFFSET).toISOString().slice(0,10);
 if(received<c.valid_from||received>c.valid_until)throw error('CUSTOMIZATION_CALENDAR_COVERAGE_REQUIRED',409);
 const nonWork=new Set(c.non_working_dates),work=new Set(c.working_dates);
 let n=date(received),remaining=days,deadline;
 while(remaining){
  n+=DAY;deadline=new Date(n).toISOString().slice(0,10);
  if(deadline>c.valid_until)throw error('CUSTOMIZATION_CALENDAR_COVERAGE_REQUIRED',409);
  const weekday=new Date(n).getUTCDay();
  if(work.has(deadline)||(!nonWork.has(deadline)&&weekday!==0&&weekday!==6))remaining--;
 }
 return {deadline_at:new Date(n+DAY-1-OFFSET).toISOString(),deadline_basis:{mode:'WORKING_DAYS',days,timezone:c.timezone,calendar_version:c.version,calendar_sha256:digest(c),received_date:received,deadline_date:deadline}};
}
function deadline(terms,stage,start){
 if(terms.acceptance_working_days!==undefined){
  if(stage!=='FINAL')return {deadline_at:null,deadline_basis:{mode:'EXPLICIT_CONFIRMATION'}};
  return workingDeadline(start,terms.acceptance_working_days,terms.acceptance_calendar);
 }
 return {deadline_at:new Date(Date.parse(start)+terms.acceptance_hours*3600000).toISOString()};
}
function verifyReceipt(terms,stage,r){
 if(terms.acceptance_working_days===undefined)return;
 const expected=deadline(terms,stage,r.started_at);
 if(!expected.deadline_at||!r.deadline_basis||r.deadline_at!==expected.deadline_at||digest(r.deadline_basis)!==digest(expected.deadline_basis))throw error('CUSTOMIZATION_ACCEPTANCE_CLOCK_MISMATCH',409);
}
module.exports={calendar,workingDeadline,deadline,verifyReceipt};
