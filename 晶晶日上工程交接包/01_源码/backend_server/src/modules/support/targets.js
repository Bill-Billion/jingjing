"use strict";
const {shape,id,error}=require('../party/policy');
const original=require('../operations/sources');
const extra={CUSTOMIZATION:['../customization/repository','createCustomizationRepository','request_id','get'],STOCK:['../stock/repository','createStockRepository','record_id'],AUDITIONS:['../auditions/repository','createAuditionsRepository','record_id'],ENGAGEMENT:['../engagement/repository','createEngagementRepository','record_id'],COCREATION:['../cocreation/repository','createCocreationRepository','record_id','room'],REDEMPTION:['../redemption/repository','createRedemptionRepository','record_id','grant']};
async function validate(tx,a,target,party){
 if(target===null)return null;shape(target,['domain','record_id']);id(target.record_id);
 if(['ARTIST_PUBLIC','STOCK_PUBLIC','NOTICE_PUBLIC'].includes(target.domain)){await require('../collections/source').read(tx,target.domain.split('_')[0],target.record_id);return target;}
 if(Object.hasOwn(original.tables,target.domain)||target.domain==='PRIVACY'){await original.readSource(tx,a.principal,target.domain,target.record_id,party);return target;}
 const f=extra[target.domain];if(!f)throw error('SUPPORT_TARGET_NOT_SUPPORTED',400);
 const repo=require(f[0])[f[1]]({withTransaction:fn=>fn(tx),execute:(...args)=>tx.execute(...args)},{resolvePrincipal:async()=>a.principal});await repo[f[3]||'read']({}, {[f[2]]:target.record_id,party_id:party});return target;
}
module.exports={validate};
