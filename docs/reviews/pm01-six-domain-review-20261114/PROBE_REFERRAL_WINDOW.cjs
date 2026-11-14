'use strict';
const path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const backend=path.resolve(process.cwd(),'晶晶日上工程交接包/01_源码/backend_server');
require(path.join(backend,'scripts/test-network-guard.cjs'));
const {capture}=require(path.join(backend,'src/modules/engagement/referrals')),{digest}=require(path.join(backend,'src/modules/governance/content'));
const ids=Object.fromEntries(['buyer','supplier','otherSupplier','referrer','rule','matchingLink','otherLink'].map(k=>[k,randomUUID()]));
const now=Date.parse('2026-11-14T08:00:00.000Z');
function row(id,kind,owner,parent,status,data,created_at){return {id,kind,owner_party_id:owner,parent_id:parent,current_status:status,object_version:1,created_by:randomUUID(),data_json:JSON.stringify(data),data_sha256:digest(data),created_at};}
const links=[row(ids.matchingLink,'REFERRAL_LINK',ids.referrer,null,'ACTIVE',{target_party_id:ids.supplier,category:'CUSTOMIZATION',rule_id:ids.rule}),row(ids.otherLink,'REFERRAL_LINK',ids.referrer,null,'ACTIVE',{target_party_id:ids.otherSupplier,category:'CUSTOMIZATION',rule_id:ids.rule})];
const rule=row(ids.rule,'RULE',ids.referrer,null,'EFFECTIVE',{rule:{referral_contract_policy:'CONTRACT_20261029',referral_bps:{STOCK:1000,AUDITION:1000,CUSTOMIZATION:1000,COMMERCIAL:1000}}});
async function scenario(unrelatedCount){
 const clicks=Array.from({length:unrelatedCount},(_,i)=>row(randomUUID(),'REFERRAL_CLICK',ids.buyer,ids.otherLink,'VALID',{at:new Date(now-1000-i*1000).toISOString()},new Date(now-1000-i*1000).toISOString()));
 const matching=row(randomUUID(),'REFERRAL_CLICK',ids.buyer,ids.matchingLink,'VALID',{at:new Date(now-600000).toISOString()},new Date(now-600000).toISOString());clicks.push(matching);
 const queries=[];const tx={async execute(sql,params){
  if(sql.includes('UNIX_TIMESTAMP'))return [[{ms:now}]];
  if(sql.includes("kind='REFERRAL_CLICK'")){queries.push(sql);const limit=/LIMIT (\d+)/.exec(sql);return [clicks.slice(0,limit?Number(limit[1]):clicks.length)];}
  if(sql.startsWith('SELECT * FROM engagement_records WHERE id='))return [[...links,rule].filter(x=>x.id===params[0])];
  if(sql.includes('FROM party_memberships'))return [[]];
  if(sql.startsWith('SELECT * FROM parties'))return [[{id:params[0],current_status:'ACTIVE'}]];
  throw Error('UNEXPECTED_QUERY');
 }};
 const quote={customization:{},customization_finance:{}};const result=await capture(tx,quote,ids.buyer,ids.supplier);
 return {unrelated_clicks:unrelatedCount,matching_click_position:unrelatedCount+1,matching_click_age_ms:600000,captured:result.referral?.click_id===matching.id,query_uses_limit_100:queries.some(s=>/LIMIT 100\b/.test(s)),business_provider_called:false,scope:'current capture with in-memory SQL result substitute, not HTTP/MySQL'};
}
(async()=>{const below=await scenario(99),above=await scenario(100);console.log(JSON.stringify({below,above},null,2));assert.equal(below.captured,true);assert.equal(above.captured,true,'Valid seven-day attribution must not disappear after 100 unrelated supplier clicks');})().catch(e=>{console.error(e.message);process.exitCode=1;});
