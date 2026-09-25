'use strict';
const {createAuthRepository}=require('../auth/repository');
const {createReadinessRepository}=require('../providers/readiness');
const {createGovernanceRepository}=require('./repository');
const {createBusinessGate}=require('./business-gate');
const {shape,error}=require('../party/policy');
const commands=Object.freeze(['create_rule','transition_rule','read_rule','create_source','read_source','transition_source','seal','read_snapshot','check_business']);
function validateCommand(request){
 shape(request,['command','input']);
 if(!commands.includes(request.command)||!request.input||typeof request.input!=='object'||Array.isArray(request.input))throw error('INVALID_GOVERNANCE_COMMAND',400);
 return request;
}
// Authenticated backend entry, also used by the maintenance client. No caller-supplied principal.
function createGovernanceService({db,secret,environment,bindings={}}){
 const auth=createAuthRepository(db,{secret});
 const principals=new WeakMap();
 const governance=createGovernanceRepository(db,{resolvePrincipal:async ctx=>principals.get(ctx)||null});
 const gate=createBusinessGate({governance,readiness:createReadinessRepository(db),environment,bindings});
 return Object.freeze({async execute(token,request){
  validateCommand(request);
  const account=await auth.resolve(token),ctx={};principals.set(ctx,{subject_ref:account.subject_ref});
  const input=request.input;
  switch(request.command){
   case 'create_rule':return governance.createRule(ctx,input);
   case 'transition_rule':return governance.transitionRule(ctx,input);
   case 'read_rule':shape(input,['rule_id']);return governance.readRule(ctx,input.rule_id);
   case 'create_source':return governance.createSource(ctx,input);
   case 'read_source':shape(input,['source_ref']);return governance.readSource(ctx,input.source_ref);
   case 'transition_source':return governance.transitionSource(ctx,input);
   case 'seal':return governance.seal(ctx,input);
   case 'read_snapshot':return governance.readSnapshotForParty(ctx,input);
   case 'check_business':return gate.check(ctx,input);
  }
 }});
}
module.exports={createGovernanceService,validateCommand};
