'use strict';
const A=require('../artists/context'),C=require('./checks'),{shape,id,error}=require('../party/policy');
const {digest}=require('../governance/content');
function createParticipationRules(db,{resolvePrincipal}) {
 const actor=A.createActor(resolvePrincipal);
 return async(ctx,i)=>{
  shape(i,['party_id','record_id','after','limit']);id(i.record_id);
  const limit=i.limit??20;if(!Number.isInteger(limit)||limit<1||limit>100)throw error('INVALID_LIMIT',400);
  if(i.after)id(i.after);
  return db.withTransaction(async tx=>{
   const a=await actor(tx,ctx);await A.owner(tx,a,i.party_id);
   const candidate=await C.load(tx,i.record_id,'CANDIDATE','FOR SHARE');
   if(candidate.owner_party_id!==i.party_id)throw error('PROJECT_PARTY_FORBIDDEN',403);
   const project=await C.load(tx,candidate.project_id,'PROJECT','FOR SHARE');
   if(candidate.current_status!=='CONFIRMED'||project.current_status!=='PREPARING')throw error('PARTICIPATION_CAST_NOT_CONFIRMED',409);
   if(!candidate.data.amount_minor)return {candidate_id:candidate.id,items:[],next_cursor:null};
   const rows=(await tx.execute("SELECT id FROM governance_rules WHERE current_status='EFFECTIVE' AND effective_at<=CURRENT_TIMESTAMP(3) AND JSON_UNQUOTE(JSON_EXTRACT(content_json,'$.terms.marketplace_finance.product_type'))='COMMERCIAL' AND id>? ORDER BY id LIMIT ?",[i.after||'',limit+1]))[0];
   const items=[];
   for(const row of rows.slice(0,limit)){
    try{
     const snapshot=await require('../settlement/marketplace-context').snapshot(tx,{rule_id:row.id,supplier_party_id:i.party_id,relation_id:null});
     if(snapshot.allocation.product_type!=='COMMERCIAL'||snapshot.allocation.platform_bps!==2200)continue;
     const rule=snapshot.rule_snapshot;
     items.push({rule_id:row.id,rule_key:rule.content.rule_key,version:rule.content.version,
      content_sha256:digest(rule.content),effective_at:rule.effective_at,current_status:rule.current_status,
      marketplace_finance:rule.content.terms.marketplace_finance});
    }catch(e){if(e.status!==409)throw e;}
   }
   return {candidate_id:candidate.id,items,next_cursor:rows.length>limit?rows[limit-1].id:null};
  });
 };
}
module.exports={createParticipationRules};
