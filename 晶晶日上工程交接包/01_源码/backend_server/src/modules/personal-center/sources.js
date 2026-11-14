"use strict";
const {error}=require('../party/policy'),{digest}=require('../governance/content');
const {readSource}=require('../operations/sources');
const {money}=require('./policy');
const partyFilter=(column)=>({party})=>({where:column+'=?',args:[party]});
const pairFilter=(a,b)=>({party})=>({where:`(${a}=? OR ${b}=?)`,args:[party,party]});
const projects=({party})=>({where:"(r.owner_party_id=? OR JSON_CONTAINS(r.data_json,JSON_OBJECT('party_id',?), '$.confirmers') OR EXISTS(SELECT 1 FROM project_records p WHERE p.id=r.project_id AND p.owner_party_id=?))",args:[party,party,party]});
const gigs=({party})=>({where:"(r.owner_party_id=? OR r.counterparty_id=? OR JSON_UNQUOTE(JSON_EXTRACT(r.data_json,'$.relation.mcn_party_id'))=?)",args:[party,party,party]});
const definitions={
 CONTRACT_SNAPSHOTS:{category:'contracts',label:'封存合同内容',table:'governance_snapshots',domain:'CONTRACT_SNAPSHOTS',filter:({party,account})=>({where:"EXISTS(SELECT 1 FROM governance_snapshot_readers x WHERE x.snapshot_id=r.id AND x.account_id=?) AND JSON_CONTAINS(r.content_json,JSON_QUOTE(?),'$.party_ids')",args:[account,party]})},
 TRADE_ORDERS:{category:'contracts',label:'订单约定',table:'trade_records',kind:'ORDER',domain:'TRADE',filter:pairFilter('r.buyer_party_id','r.merchant_party_id')},
 PARTICIPATION_CONTRACTS:{category:'contracts',label:'参演约定',table:'project_records',kind:'PARTICIPATION',domain:'PROJECTS',filter:projects},
 INCOME_AGREEMENTS:{category:'contracts',label:'发行收入约定',table:'project_records',kind:'INCOME_AGREEMENT',domain:'PROJECTS',filter:projects},
 LICENSE_RESERVATIONS:{category:'contracts',label:'剧本许可预留',table:'license_records',kind:'RESERVATION',domain:'LICENSE',filter:pairFilter('r.owner_party_id','r.counterparty_id')},
 LICENSE_GRANTS:{category:'contracts',label:'已取得剧本许可',table:'license_records',kind:'GRANT',domain:'LICENSE',filter:pairFilter('r.owner_party_id','r.counterparty_id')},
 COMMERCIAL_OFFERS:{category:'contracts',label:'商单接单约定',table:'gig_records',kind:'OFFER',domain:'GIGS',filter:gigs},
 MCN_RELATIONS:{category:'contracts',label:'MCN合作约定',table:'gig_records',kind:'RELATION',domain:'GIGS',filter:gigs},
 SUPPLY_WORKS:{category:'works',label:'提交的剧本与作品版本',table:'supply_records',kind:'WORK_VERSION',domain:'SUPPLY',filter:partyFilter('r.owner_party_id')},
 PRODUCTION_PROJECTS:{category:'works',label:'定制制作项目',table:'production_records',kind:'PROJECT',domain:'PRODUCTION',filter:({party})=>({where:"(EXISTS(SELECT 1 FROM trade_records o WHERE o.id=r.order_id AND (o.buyer_party_id=? OR o.merchant_party_id=?)) OR JSON_UNQUOTE(JSON_EXTRACT(r.data_json,'$.producer_party_id'))=?)",args:[party,party,party]})},
 PROJECT_EDITIONS:{category:'works',label:'发行成片版本',table:'project_records',kind:'EDITION',domain:'PROJECTS',filter:projects},
 STOCK_LISTINGS:{category:'works',label:'我销售的现成视频',table:'stock_listings',domain:'STOCK',filter:partyFilter('r.seller_party_id')},
 STOCK_PURCHASES:{category:'works',label:'我购买的现成视频',table:'trade_records',kind:'ORDER',domain:'STOCK_PURCHASE',filter:({party})=>({where:'EXISTS(SELECT 1 FROM stock_purchases p WHERE p.order_id=r.id AND p.buyer_party_id=?)',args:[party]})},
 FINANCE:{category:'income',label:'已登记的收入核算',table:'finance_records',kind:'AGREEMENT',domain:'FINANCE',filter:({party})=>({where:"JSON_CONTAINS(r.data_json,JSON_QUOTE(?),'$.parties')",args:[party]})},
 COMMISSIONS:{category:'income',label:'商单佣金来源记录',table:'gig_records',kind:'COMMISSION',domain:'GIGS',filter:gigs}
};
const inTx=tx=>({withTransaction:fn=>fn(tx),execute:(...args)=>tx.execute(...args)});
async function read(tx,principal,definition,record,party){
 const options={resolvePrincipal:async()=>principal};
 if(definition.domain==='CONTRACT_SNAPSHOTS')return require('../governance/repository').createGovernanceRepository(inTx(tx),options).readSnapshotForParty({}, {snapshot_id:record,party_id:party});
 if(['STOCK','STOCK_PURCHASE'].includes(definition.domain)){const repo=require('../stock/repository').createStockRepository(inTx(tx),options);return definition.domain==='STOCK'?repo.read({}, {record_id:record,party_id:party}):repo.purchased({}, {order_id:record,party_id:party});}
 return readSource(tx,principal,definition.domain,record,party);
}
async function income(tx,record,party){
 const d=record.data;if(!['SANDBOX','PRODUCTION'].includes(d.environment)||d.currency!=='CNY')throw error('INCOME_SCOPE_INVALID',503);
 const [rows]=await tx.execute('SELECT category,amount_minor,data_json,data_sha256 FROM finance_entries WHERE agreement_id=? AND party_id=? ORDER BY id LIMIT 10001',[record.id,party]);
 if(rows.length>10000)throw error('INCOME_DETAIL_LIMIT',503);
 for(const r of rows){const v=typeof r.data_json==='string'?JSON.parse(r.data_json):r.data_json;if(digest(v)!==r.data_sha256)throw error('STORED_CONTENT_MISMATCH',503);}
 const totals=money(rows),retained=record.owner_party_id===party;
 return {...totals,pending_minor:retained?0:totals.pending_minor,retained_minor:retained?totals.pending_minor:0,currency:d.currency,environment:d.environment,meaning:record.owner_party_id===party?'MERCHANT_RETAINED_NOT_TRANSFER':'PAYABLE_NOT_BANK_BALANCE',basis:'POSTED_LEDGER_ONLY',bank_arrival_verified:false};
}
async function summarize(tx,def,row,value,party){
 const d=value.data||{},title=d.title||d.version?.content?.title||d.listing_snapshot?.title||def.label;
 return {key:def.domain+':'+row.source_id,source_domain:def.domain,record_id:row.source_id,title:String(title).slice(0,240),current_status:value.current_status||value.order_status,object_version:value.object_version,created_at:new Date(row.sort_at.replace(' ','T')+'Z').toISOString(),target:{domain:def.domain,record_id:row.source_id},income:def.domain==='FINANCE'?await income(tx,value,party):null,notice:def.category==='income'&&def.domain==='GIGS'?'佣金来源记录；查看原明细，不与结算台账重复相加':def.domain==='CONTRACT_SNAPSHOTS'?'仅内容封存，不表示已签署或付款':def.category==='works'?'进原业务查看交付、授权和下载条件':def.category==='income'?'核算记录，不代表银行到账或可立即提现':'以原业务当前状态及历史约定为准'};
}
module.exports={definitions,read,summarize};
