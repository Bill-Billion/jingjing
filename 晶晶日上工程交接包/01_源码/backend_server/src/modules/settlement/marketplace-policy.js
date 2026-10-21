 'use strict';
const {id,shape,error}=require('../party/policy');
const {amount,copy}=require('../trade/policy');
const {digest,verifyRuleContent}=require('../governance/content');
const TYPES=['STOCK_VIDEO','COMMERCIAL','AUDITION'];
function rate(n){if(!Number.isInteger(n)||n<0||n>10000)throw error('INVALID_MARKETPLACE_RATE',400);return n;}
function mcnTerms(value){
 shape(value,['version','supply_share_bps']);
 const n=value.supply_share_bps===undefined?2000:value.supply_share_bps;
 if(value.version!=='V5'||!Number.isInteger(n)||n<1000||n>3000)throw error('INVALID_MCN_SUPPLY_SHARE',400);
 return {version:'V5',supply_share_bps:n};
}
function config(v){
 shape(v,['model','product_type','fee_base','platform_party_id','platform_bps','referral_bps','rounding']);
 if(v.model!=='V5_TWO_LAYER'||!TYPES.includes(v.product_type)||v.fee_base!=='NET_PAID'||v.rounding!=='HALF_UP_PLATFORM_REMAINDER')throw error('INVALID_MARKETPLACE_RULE',400);
 id(v.platform_party_id);rate(v.platform_bps);rate(v.referral_bps);
 if(v.referral_bps>v.platform_bps)throw error('REFERRAL_EXCEEDS_PLATFORM',400);
 return copy(v);
}
function allocation(v){
 shape(v,['model','product_type','fee_base','platform_party_id','platform_bps','supplier_party_id','mcn_party_id','mcn_supply_bps','referrer_party_id','referral_bps','rounding']);
 config({model:v.model,product_type:v.product_type,fee_base:v.fee_base,platform_party_id:v.platform_party_id,platform_bps:v.platform_bps,referral_bps:v.referral_bps,rounding:v.rounding});
 id(v.supplier_party_id);
 if(v.mcn_party_id===null){if(v.mcn_supply_bps!==0)throw error('MCN_RELATION_REQUIRED',409);}else{id(v.mcn_party_id);mcnTerms({version:'V5',supply_share_bps:v.mcn_supply_bps});}
 if(v.referrer_party_id===null){if(v.referral_bps!==0)throw error('REFERRAL_ATTRIBUTION_REQUIRED',409);}else id(v.referrer_party_id);
 const ids=[v.platform_party_id,v.supplier_party_id,v.mcn_party_id,v.referrer_party_id].filter(Boolean);
 if(new Set(ids).size!==ids.length)throw error('MARKETPLACE_PARTIES_OVERLAP',409);
 return copy(v);
}
function participants(v){allocation(v);return [['PLATFORM',v.platform_party_id],['SUPPLIER',v.supplier_party_id],['MCN',v.mcn_party_id],['REFERRER',v.referrer_party_id]].filter(x=>x[1]).map(([role,party_id])=>({role,party_id}));}
function split(net,v){
 amount(net,true);allocation(v);
 // Use exact fractions until the final fen: a supply share is NOT a GMV share.
 const n=BigInt(net),p=BigInt(v.platform_bps),m=BigInt(v.mcn_supply_bps),r=BigInt(v.referral_bps),scale=100000000n;
 const weights={PLATFORM:(p-r)*10000n,SUPPLIER:(10000n-p)*(10000n-m),MCN:(10000n-p)*m,REFERRER:r*10000n};
 const entries=participants(v).map(x=>({...x,amount_minor:Number((n*weights[x.role]+scale/2n)/scale)}));
 const rounding_diff_minor=net-entries.reduce((s,x)=>s+x.amount_minor,0);
 entries.find(x=>x.role==='PLATFORM').amount_minor+=rounding_diff_minor;
 return {net_minor:net,entries,rounding_diff_minor};
}
function checked(quote,merchant){
 const snap=quote.marketplace_finance;if(!snap)return null;
 shape(snap,['allocation','rule_snapshot','relation_snapshot','captured_at']);
 require('../trade/policy').instant(snap.captured_at);
 let rule;try{rule=verifyRuleContent(snap.rule_snapshot.content);}catch{throw error('STORED_CONTENT_MISMATCH',503);}
 const cfg=config(rule.terms.marketplace_finance),a=allocation(snap.allocation);
 if(quote.customization_finance||rule.id!==quote.rule_id||a.supplier_party_id!==merchant||quote.lines.length!==1||quote.lines[0].provider_party_id!==merchant||quote.lines[0].product_profile?.version!=='V5'||quote.lines[0].product_profile?.type!==a.product_type)throw error('MARKETPLACE_SOURCE_MISMATCH',409);
 for(const k of ['model','product_type','fee_base','platform_party_id','platform_bps','rounding'])if(a[k]!==cfg[k])throw error('MARKETPLACE_SOURCE_MISMATCH',409);
 if(a.referral_bps!==(a.referrer_party_id?cfg.referral_bps:0))throw error('MARKETPLACE_SOURCE_MISMATCH',409);
 // The accepted order freezes authenticated last-valid attribution, independently of client input.
 if(a.referrer_party_id){const r=quote.referral,s=r?.rule_snapshot;if(!r||r.status!=='ATTRIBUTED'||r.referrer_party_id!==a.referrer_party_id||r.supplier_party_id!==merchant||r.rate_bps!==a.referral_bps||!s||digest(s.data)!==s.content_sha256||s.data.rule.referral_bps[r.category]!==a.referral_bps)throw error('REFERRAL_ATTRIBUTION_REQUIRED',409);}
 if(a.mcn_party_id){
  const rel=snap.relation_snapshot;
  if(!rel||digest(rel.data)!==rel.content_sha256||rel.kind!=='RELATION'||rel.current_status!=='ACTIVE'||rel.owner_party_id!==a.mcn_party_id||rel.counterparty_id!==merchant||!rel.data.accepted_by||rel.data.valid_from>snap.captured_at||rel.data.valid_until<=snap.captured_at||mcnTerms(rel.data.v5_terms).supply_share_bps!==a.mcn_supply_bps)throw error('MCN_RELATION_SNAPSHOT_MISMATCH',409);
 }else if(snap.relation_snapshot!==null)throw error('MCN_RELATION_SNAPSHOT_MISMATCH',409);
 return snap;
}
function match(quote,merchant,rules,ruleId=quote.rule_id){
 const snap=checked(quote,merchant);
 if(!snap){if(rules.lines.some(l=>l.allocation))throw error('MARKETPLACE_SOURCE_REQUIRED',409);return null;}
 if(ruleId!==quote.rule_id||rules.lines.length!==1||rules.lines[0].line_id!==quote.lines[0].line_id||digest(rules.lines[0].allocation||null)!==digest(snap.allocation))throw error('MARKETPLACE_SOURCE_MISMATCH',409);
 return snap;
}
module.exports={rate,mcnTerms,config,allocation,participants,split,checked,match};
