 'use strict';
const {shape,id,error}=require('../party/policy');
const {digest,verifyRuleContent}=require('../governance/content');
const P=require('../settlement/policy');
function policy(value,lines,merchant){
 if(!value)throw error('CUSTOMIZATION_FINANCE_RULE_REQUIRED',409);
 shape(value,['model','platform_party_id','rounding','rules']);
 if(value.model!=='V5_SELF_OPERATED'||value.rounding!=='HALF_UP_PLATFORM_REMAINDER'||id(value.platform_party_id)!==merchant)throw error('CUSTOMIZATION_FINANCE_RULE_INVALID',409);
 const rules=P.rules(value.rules);
 if(rules.release_condition!=='DELIVERY_ACCEPTED'||rules.lines.length!==lines.length)throw error('CUSTOMIZATION_FINANCE_RULE_INVALID',409);
 for(const row of rules.lines){
  const line=lines.find(l=>l.line_id===row.line_id);
  if(!line||row.deductions.reduce((n,x)=>n+x.amount_minor,0)>line.total_minor)throw error('CUSTOMIZATION_FINANCE_RULE_INVALID',409);
  const platforms=row.shares.filter(x=>x.role==='PLATFORM');
  if(platforms.length!==1||platforms[0].party_id!==merchant||!row.shares.some(x=>x.party_id===line.provider_party_id)||row.shares.some(x=>!['PLATFORM','PRODUCER','RIGHTSHOLDER','PARTICIPANT','SUPPLIER'].includes(x.role)))throw error('CUSTOMIZATION_FINANCE_RULE_INVALID',409);
 }
 return {model:value.model,platform_party_id:merchant,rounding:value.rounding,rules};
}
function fromRule(row,lines,merchant){
 let content;try{content=verifyRuleContent(typeof row.content_json==='string'?JSON.parse(row.content_json):row.content_json);}catch{throw error('STORED_CONTENT_MISMATCH',503);}
 if(content.id!==row.id)throw error('STORED_CONTENT_MISMATCH',503);
 return {...policy(content.terms.customization_finance,lines,merchant),rule_snapshot:{content,current_status:row.current_status,effective_at:new Date(row.effective_at.replace(' ','T')+'Z').toISOString()}};
}
function checked(quote,merchant){
 const snap=quote.customization_finance;
 if(!snap)return null; // Orders issued before this version keep their prior rules.
 shape(snap,['model','platform_party_id','rounding','rules','rule_snapshot']);
 let content;try{content=verifyRuleContent(snap.rule_snapshot.content);}catch{throw error('STORED_CONTENT_MISMATCH',503);}
 const p=policy(content.terms.customization_finance,quote.lines,merchant);
 if(content.id!==quote.rule_id||digest(p)!==digest({model:snap.model,platform_party_id:snap.platform_party_id,rounding:snap.rounding,rules:snap.rules}))throw error('CUSTOMIZATION_FINANCE_SNAPSHOT_MISMATCH',409);
 return snap;
}
function match(quote,merchant,rules,ruleId=quote.rule_id){
 const snap=checked(quote,merchant);
 if(snap&&(ruleId!==quote.rule_id||digest(rules)!==digest(snap.rules)))throw error('CUSTOMIZATION_FINANCE_SNAPSHOT_MISMATCH',409);
 return snap;
}
function split(total,shares,platform){
 P.amount(total,true);P.shares(shares);
 if(shares.filter(s=>s.role==='PLATFORM'&&s.party_id===platform).length!==1)throw error('CUSTOMIZATION_FINANCE_RULE_INVALID',409);
 const entries=shares.map(s=>({...s,amount_minor:Number((BigInt(total)*BigInt(s.bps)+5000n)/10000n)}));
 const rounding_diff_minor=total-entries.reduce((n,s)=>n+s.amount_minor,0);
 entries.find(s=>s.party_id===platform).amount_minor+=rounding_diff_minor;
 return {entries,rounding_diff_minor};
}
module.exports={policy,fromRule,checked,match,split};
