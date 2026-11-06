"use strict";
const {error}=require('../party/policy');
const M=require('./marketplace-policy');
const VERSION='CONTRACT_20261029';
function configuration(v='LEGACY_COMPATIBLE'){
 if(!['LEGACY_COMPATIBLE',VERSION].includes(v))throw error('INVALID_MARKETPLACE_CONTRACT_POLICY',500);
 return v;
}
function rule(snapshot,type){
 if(!snapshot)throw error('MARKETPLACE_CONTRACT_RULE_REQUIRED',409);
 const a=M.allocation(snapshot.allocation),rates={STOCK_VIDEO:1800,COMMERCIAL:2200,AUDITION:2200};
 if(!rates[type]||a.product_type!==type||a.platform_bps!==rates[type])throw error('MARKETPLACE_CONTRACT_RATE_MISMATCH',409);
 return snapshot;
}
function commercial(quote,policy){
 if(configuration(policy)!==VERSION&&!quote.commercial?.marketplace_terms)return;
 if(!quote.commercial?.marketplace_terms)throw error('COMMERCIAL_CONTRACT_OFFER_REQUIRED',409);
 const t=quote.commercial.marketplace_terms,a=rule(quote.marketplace_finance,'COMMERCIAL').allocation;
 if(t.version!==VERSION||t.platform_bps!==a.platform_bps||t.mcn_supply_bps!==a.mcn_supply_bps||
    (quote.commercial.relation?.id||null)!==(quote.marketplace_finance.relation_snapshot?.id||null)||
    (quote.commercial.relation&&quote.commercial.relation.sha256!==quote.marketplace_finance.relation_snapshot.content_sha256))throw error('COMMERCIAL_CONTRACT_OFFER_CHANGED',409);
 M.checked(quote,a.supplier_party_id);
}
module.exports={VERSION,configuration,rule,commercial};
