"use strict";
const {error}=require('../party/policy');
const one=async(tx,q,a=[])=>(await tx.execute(q,a))[0][0];
const instant=v=>v instanceof Date?v.toISOString():new Date(String(v).replace(' ','T')+(String(v).includes('Z')?'':'Z')).toISOString();
// Counts and descriptions only. Related parties, provider keys and private business
// contents are never returned to the applicant through this summary.
async function dependencies(tx,assetId){
 const result=[];
 if(await one(tx,'SELECT asset_id FROM support_asset_refs WHERE asset_id=? LIMIT 1 FOR SHARE',[assetId]))result.push({code:'SUPPORT_EVIDENCE',message:'已作为反馈或举报材料提交，须人工核对保留与删除范围'});
 for(const [table,code,message] of [
  ['artist_records','ARTIST_ARCHIVE','已被艺人档案、授权或公开资料引用，先核对影响范围'],
  ['supply_records','SUPPLY_ARCHIVE','已被作品或数字人资料引用，先核对相关约定'],
  ['cocreation_records','COCREATION','已被多人共创引用，须核对其他参与人的约定'],
  ['production_records','PRODUCTION','已被制作项目引用，须核对交付和争议'],
  ['trade_records','TRANSACTION','已被交易约定引用，须核对订单保留依据']
 ]){
  const row=await one(tx,`SELECT id FROM ${table} WHERE JSON_SEARCH(data_json,'one',?) IS NOT NULL LIMIT 1 FOR SHARE`,[assetId]);
  if(row)result.push({code,message});
 }
 if(await one(tx,"SELECT id FROM content_restrictions WHERE target_kind='ASSET' AND target_id=? AND current_status='ACTIVE' LIMIT 1 FOR SHARE",[assetId]))result.push({code:'COMPLAINT_REVIEW',message:'存在待处理内容限制，须先核对投诉和证据'});
 return result;
}
async function describeFile(tx,f){
 const related=await dependencies(tx,f.id),pending=f.current_status==='ERASURE_PENDING';
 const disposition=pending?'PROVIDER_PENDING':f.current_status!=='READY'?'UNAVAILABLE':f.purpose!=='AVATAR_MATERIAL'||related.length?'DEPENDENCY_REVIEW':'READY_FOR_REVIEW';
 return {id:f.id,label:'本人原始素材 · '+instant(f.created_at).slice(0,10)+' · '+f.id.slice(0,8),content_sha256:f.content_sha256,media_type:f.media_type,byte_size:f.byte_size,created_at:instant(f.created_at),current_status:f.current_status,purpose:f.purpose,disposition,dependencies:related,
 explanation:pending?'当前访问已移除，仍等待存储处理回执；不代表备份或模型已删除。':disposition==='UNAVAILABLE'?'当前文件不可执行新的删除，请查看已有处理记录。':disposition==='DEPENDENCY_REVIEW'?'此素材有引用或保留事项，先由工作人员核对；此页面不会直接破坏原订单或他人约定。':'可以申请删除这一份当前原始文件；仍须独立审核和本人确认，备份、衍生模型及历史合同分别处理。'};
}
async function assertDeletable(tx,f){if(f.purpose!=='AVATAR_MATERIAL'||(await dependencies(tx,f.id)).length)throw error('PRIVACY_FILE_RETENTION_REVIEW_REQUIRED',409);}
module.exports={describeFile,assertDeletable};
