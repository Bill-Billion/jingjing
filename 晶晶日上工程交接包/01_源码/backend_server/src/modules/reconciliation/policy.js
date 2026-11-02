'use strict';
const {shape,id,ref,label,error}=require('../party/policy'),{digest}=require('../governance/content');
const KINDS=['RECEIPT','REFUND','SPLIT','FEE','BANK'],MAX_ITEMS=2000;
function money(n){if(!Number.isSafeInteger(n)||n<0||n>900000000000)throw error('INVALID_RECONCILIATION_MONEY',400);return n;}
function day(v){if(typeof v!=='string'||!/^20[0-9]{2}-[0-9]{2}-[0-9]{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)throw error('INVALID_RECONCILIATION_DAY',400);return v;}
function period(v){day(v);const start=new Date(v+'T00:00:00+08:00');return {start:start.toISOString().slice(0,23).replace('T',' '),end:new Date(start.getTime()+86400000).toISOString().slice(0,23).replace('T',' ')};}
function scope(i,now){shape(i,['business_date','merchant_party_id','provider','environment','app_id','merchant_id']);day(i.business_date);id(i.merchant_party_id);ref(i.app_id);ref(i.merchant_id);if(!['ALIPAY','APPLE'].includes(i.provider)||!['SANDBOX','PRODUCTION'].includes(i.environment))throw error('INVALID_RECONCILIATION_SCOPE',400);if(i.business_date>=new Date(Date.parse(now)+8*3600000).toISOString().slice(0,10))throw error('RECONCILIATION_DAY_NOT_CLOSED',409);return {...i};}
function item(v){shape(v,['record_id','external_reference','direction','amount_minor']);id(v.record_id);ref(v.external_reference);if(!['IN','OUT'].includes(v.direction))throw error('INVALID_RECONCILIATION_DIRECTION',400);money(v.amount_minor);return {...v};}
const key=v=>v.record_id+'|'+v.external_reference;
function rows(v,max=200){if(!Array.isArray(v)||v.length>max)throw error('RECONCILIATION_ITEM_LIMIT',400);const items=v.map(item),ids=new Set();for(const x of items){if(ids.has(key(x)))throw error('RECONCILIATION_DUPLICATE_ROW',409);ids.add(key(x));}return items;}
function manual(v){shape(v,['id','kind','source_ids','external_reference','direction','amount_minor','evidence_asset_id','reason']);id(v.id);if(!['FEE','BANK'].includes(v.kind)||!Array.isArray(v.source_ids)||!v.source_ids.length||v.source_ids.length>100||new Set(v.source_ids).size!==v.source_ids.length)throw error('INVALID_RECONCILIATION_SOURCE',400);v.source_ids.forEach(id);id(v.evidence_asset_id);label(v.reason,2000);item({record_id:v.id,external_reference:v.external_reference,direction:v.direction,amount_minor:v.amount_minor});return structuredClone(v);}
function compare(facts,manual,books,warnings=[]){
 const differences=[],totals={};for(const kind of KINDS){const expected=[...facts.filter(x=>x.kind===kind),...manual.filter(x=>x.kind===kind).map(x=>({...x,record_id:x.id}))],book=books[kind];
 if(!book){differences.push({kind,reason:'STATEMENT_MISSING'});continue;}
 const actual=book.items,found=new Map(actual.map(x=>[key(x),x]));
 let signedExpected=0n,signedActual=0n;
 for(const x of expected){signedExpected+=BigInt(x.amount_minor)*(x.direction==='IN'?1n:-1n);const y=found.get(key(x));if(!y)differences.push({kind,record_id:x.record_id,external_reference:x.external_reference,reason:'MISSING_IN_STATEMENT'});else {if(x.amount_minor!==y.amount_minor||x.direction!==y.direction)differences.push({kind,record_id:x.record_id,external_reference:x.external_reference,reason:'AMOUNT_OR_DIRECTION_MISMATCH',expected_minor:x.amount_minor,actual_minor:y.amount_minor});found.delete(key(x));}}
 for(const x of actual)signedActual+=BigInt(x.amount_minor)*(x.direction==='IN'?1n:-1n);
 for(const x of found.values())differences.push({kind,record_id:x.record_id,external_reference:x.external_reference,reason:'UNKNOWN_PLATFORM_FACT'});
 if([signedExpected,signedActual].some(x=>x>BigInt(Number.MAX_SAFE_INTEGER)||x< -BigInt(Number.MAX_SAFE_INTEGER)))throw error('RECONCILIATION_TOTAL_OVERFLOW',409);
 totals[kind]={expected_count:expected.length,statement_count:actual.length,expected_net_minor:Number(signedExpected),statement_net_minor:Number(signedActual)};
 }
 for(const w of warnings)differences.push(w);
 return {differences,totals,matched:differences.length===0,manual_evidence_categories:['FEE','BANK'],meaning:'COMPARISON_ONLY_NO_PAYMENT_OR_TRANSFER'};
}
module.exports={KINDS,MAX_ITEMS,money,day,period,scope,item,key,rows,manual,compare};
