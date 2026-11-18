"use strict";
const {error}=require('../party/policy');
const {digest}=require('../governance/content');
const fields=['id','content_sha256','byte_size','media_type'];
const snapshot=row=>Object.fromEntries(fields.map(key=>[key,row[key]]));

// Only called after request/operator authorization, while the request is locked.
// Reuse the private-download boundary, including content restrictions and hashing.
async function verifyResponseFiles(tx,{ids,proposer,snapshots,env={},storageFactory}){
 if(snapshots!==undefined&&(!Array.isArray(snapshots)||snapshots.length!==ids.length))throw error('PRIVACY_EVIDENCE_CHANGED',409);
 const scopedDb={withTransaction:work=>work(tx)};
 const repository={async assetAccess(ctx,key){
  const [[row]]=await tx.execute("SELECT * FROM supply_assets WHERE id=? AND current_status='READY' AND purpose='REVIEW_EVIDENCE' FOR SHARE",[key]);
  if(!row)throw error('PRIVACY_EVIDENCE_NOT_READY',409);
  if(row.created_by!==proposer)throw error('PRIVACY_EVIDENCE_OWNER_REQUIRED',403);
  if(snapshots!==undefined){
   const matches=snapshots.filter(s=>s.id===key);
   if(matches.length!==1||digest(snapshot(row))!==digest(matches[0]))throw error('PRIVACY_EVIDENCE_CHANGED',409);
  }
  return row;
 }};
 const files=require('../works/assets').createSupplyAssets({db:scopedDb,repository,env,storageFactory});
 const result=[];
 for(const key of ids){const {metadata}=await files.download({},key);result.push(snapshot(metadata));}
 return result;
}
module.exports={verifyResponseFiles};
