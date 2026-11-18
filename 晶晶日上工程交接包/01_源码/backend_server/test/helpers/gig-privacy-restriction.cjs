'use strict';
const {randomUUID:key}=require('node:crypto');
const {createRuleContent}=require('../../src/modules/governance/content');

// Real privacy command flow against the same isolated database as the commercial order.
// The effective policy is a synthetic precondition, never a production legal basis.
module.exports=async function restrictions({db,resolvePrincipal,author,reviewer,applicant}) {
 const repo=require('../../src/modules/privacy/repository').createPrivacyRepository(db,{resolvePrincipal});
 for(const user of [author,reviewer])for(const action of ['PRIVACY_HANDLE','PRIVACY_REVIEW'])
  await require('../../src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:user.account_id,action,enabled:true,expires_at:null,expected_version:0,authority_ref:'synthetic:gig-privacy',reason:'isolated test'});
 const id=key(),rule_key='privacy.execution';
 const content=createRuleContent({id,rule_key,version:id,terms:{privacy_execution:{actions:['RESTRICT_CONTENT','RELEASE_CONTENT'],basis:'Synthetic independently reviewed scope',contact_reference:'synthetic:contact',backup_strategy:'REAPPLY_ERASURE_REGISTER_BEFORE_ACCESS',retention_rule_id:null}}});
 await db.execute('INSERT INTO governance_rules(id,rule_key,version_label,content_json,effective_at,created_by,current_status) VALUES (?,?,?,?,?,?,?)',[id,rule_key,id,JSON.stringify(content),'2020-01-01 00:00:00',author.account_id,'EFFECTIVE']);
 async function execute(request,action,target,details){
  let proposal=await repo.proposeExecution(author.ctx,{request_id:request.id,expected_version:request.object_version,action,target_id:target,details:{reason:'Synthetic restricted message attachment',...details},policy_rule_id:id,operations:true,operation_key:key()});
  proposal=await repo.reviewExecution(reviewer.ctx,{request_id:request.id,execution_id:proposal.id,expected_version:proposal.object_version,proposal_sha256:proposal.proposal_sha256,decision:'APPROVE',reason:'Independent synthetic review',scope_verified:true,retention_verified:true,operation_key:key()});
  return repo.execute(author.ctx,{request_id:request.id,execution_id:proposal.id,expected_version:proposal.object_version,confirmed:true,operations:true,operation_key:key()});
 }
 return {
  async restrict(asset_id){const request=await repo.create(applicant.ctx,{request:{type:'COMPLAINT',scopes:['CONTENT'],details:'Synthetic restriction request'},operation_key:key()});const execution=await execute(request,'RESTRICT_CONTENT',asset_id,{target_kind:'ASSET'});return {request,execution};},
  async release({request,execution}){const current=await repo.read(applicant.ctx,{request_id:request.id});return execute(current,'RELEASE_CONTENT',execution.result.restriction_id,{});},
 };
};
