"use strict";
const {error}=require('../party/policy');
// Reversal target already includes spent/expired shortages. Do not subtract debt
// settlement, expiry or spending again: those change availability, not earnings.
function cumulative(earnings){
 let issued=0,withdrawn=0;
 for(const r of earnings){
  if(!['ISSUED','REVERSAL_PENDING'].includes(r.current_status))continue;
  const d=r.data;
  if(!Number.isSafeInteger(d.points)||d.points<0||!Number.isSafeInteger(d.growth_reversed)||d.growth_reversed<0||d.growth_reversed>d.points)throw error('WALLET_TOTALS_UNVERIFIED',503);
  issued+=d.points;withdrawn+=d.growth_reversed;
  if(!Number.isSafeInteger(issued)||!Number.isSafeInteger(withdrawn))throw error('WALLET_TOTALS_UNVERIFIED',503);
 }
 return {version:'NET_ISSUED_V1',issued,withdrawn,net_issued:issued-withdrawn};
}
module.exports={cumulative};
