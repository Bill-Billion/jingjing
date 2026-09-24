'use strict';
const {randomUUID} = require('node:crypto');
const content = require('./content');
const {error, ref, id, shape, version} = require('../party/policy');
const one = async (tx, sql, values = []) => (await tx.execute(sql, values))[0][0];
const parsed = value => typeof value === 'string' ? JSON.parse(value) : value;
const transitions = Object.freeze({DRAFT:'IN_REVIEW', IN_REVIEW:'APPROVED', APPROVED:'EFFECTIVE', EFFECTIVE:'RETIRED'});
function utc(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw error('INVALID_INSTANT',400);
  return value.replace('T',' ').slice(0,-1);
}
// mysql2 omits the fractional part when milliseconds are zero.
const iso = value => new Date(value.replace(' ','T') + 'Z').toISOString();

// All callbacks are server composition dependencies, never request-supplied roles or flags.
function createGovernanceRepository(db, {resolvePrincipal=async()=>null, authorize=async()=>false, loadCommitment=async()=>null} = {}) {
  async function actor(tx, context) {
    const p = await resolvePrincipal(context);
    if (!p) throw error('AUTHENTICATION_REQUIRED',401);
    const a = await one(tx,'SELECT id,current_status FROM identity_accounts WHERE subject_ref=? FOR SHARE',[ref(p.subject_ref)]);
    if (!a || a.current_status !== 'ACTIVE') throw error('ACCOUNT_NOT_ACTIVE');
    return {account_id:a.id, request_id:ref(p.request_id || randomUUID())};
  }
  async function permitted(tx, a, action, resource) {
    if (await authorize(tx,{account_id:a.account_id, action, resource}) !== true) throw error('GOVERNANCE_FORBIDDEN');
  }
  async function audit(tx,a,event,objectId,objectVersion) {
    await tx.execute('INSERT INTO governance_audit(id,actor_account_id,object_id,event_code,object_version,request_id) VALUES (?,?,?,?,?,?)',
      [randomUUID(),a.account_id,objectId,event,objectVersion,a.request_id]);
  }
  async function command(tx,a,operation,input,work,replayCheck=async()=>{}) {
    const commandId=content.digest([a.account_id,operation,ref(input.operation_key)]), fingerprint=content.digest(input);
    try {
      await tx.execute('INSERT INTO governance_commands(id,actor_account_id,operation_code,fingerprint) VALUES (?,?,?,?)',[commandId,a.account_id,operation,fingerprint]);
    } catch(e) {
      if(e.code!=='ER_DUP_ENTRY')throw e;
      const row=await one(tx,'SELECT fingerprint,result_json FROM governance_commands WHERE id=?',[commandId]);
      if(!row || row.fingerprint!==fingerprint)throw error('IDEMPOTENCY_CONFLICT',409);
      if(row.result_json===null)throw error('IDEMPOTENCY_IN_PROGRESS',409);
      const result=parsed(row.result_json);await replayCheck(result);return result;
    }
    const result=await work();
    await tx.execute('UPDATE governance_commands SET result_json=? WHERE id=?',[JSON.stringify(result),commandId]);
    return result;
  }
  function ruleData(row) {
    const value=content.verifyRuleContent(parsed(row.content_json));
    if(value.id!==row.id || value.rule_key!==row.rule_key || value.version!==row.version_label)throw error('STORED_CONTENT_MISMATCH',503);
    return {content:value,current_status:row.current_status,effective_at:iso(row.effective_at),object_version:row.object_version};
  }
  async function snapshot(tx,a,snapshotId) {
    const row=await one(tx,'SELECT s.* FROM governance_snapshots s JOIN governance_snapshot_readers r ON r.snapshot_id=s.id WHERE s.id=? AND r.account_id=?',[id(snapshotId),a.account_id]);
    if(!row)throw error('SNAPSHOT_NOT_FOUND',404);
    const value=content.verifyUnsignedContent(parsed(row.content_json));
    if(value.id!==row.id)throw error('STORED_CONTENT_MISMATCH',503);
    return value;
  }
  return Object.freeze({
    async createRule(context,input) {
      input=JSON.parse(content.canonical(input));
      shape(input,['rule_key','version','terms','effective_at','operation_key']);
      const effective=utc(input.effective_at),ruleContent=content.createRuleContent({id:randomUUID(),rule_key:input.rule_key,version:input.version,terms:input.terms});
      return db.withTransaction(async tx=>{
        const a=await actor(tx,context);await permitted(tx,a,'CREATE_RULE',input.rule_key);
        return command(tx,a,'CREATE_RULE',input,async()=>{
          try { await tx.execute('INSERT INTO governance_rules(id,rule_key,version_label,content_json,effective_at,created_by) VALUES (?,?,?,?,?,?)',
            [ruleContent.id,input.rule_key,input.version,JSON.stringify(ruleContent),effective,a.account_id]); }
          catch(e){if(e.code==='ER_DUP_ENTRY')throw error('RULE_VERSION_EXISTS',409);throw e;}
          await audit(tx,a,'RULE_CREATED',ruleContent.id,1);
          return {content:ruleContent,current_status:'DRAFT',effective_at:input.effective_at,object_version:1};
        });
      });
    },
    async transitionRule(context,input) {
      input=JSON.parse(content.canonical(input));
      shape(input,['rule_id','target_status','expected_version','operation_key']);id(input.rule_id);version(input.expected_version);
      if(!Object.values(transitions).includes(input.target_status))throw error('INVALID_RULE_STATUS',400);
      return db.withTransaction(async tx=>{
        const a=await actor(tx,context);await permitted(tx,a,'RULE_'+input.target_status,input.rule_id);
        return command(tx,a,'TRANSITION_RULE',input,async()=>{
          const row=await one(tx,'SELECT *,effective_at<=CURRENT_TIMESTAMP(3) AS due FROM governance_rules WHERE id=? FOR UPDATE',[input.rule_id]);
          if(!row)throw error('RULE_NOT_FOUND',404);
          ruleData(row);
          if(row.object_version!==input.expected_version)throw error('VERSION_CONFLICT',412);
          if(transitions[row.current_status]!==input.target_status)throw error('RULE_TRANSITION_FORBIDDEN',409);
          if(input.target_status==='EFFECTIVE'&&!Number(row.due))throw error('RULE_NOT_YET_EFFECTIVE',409);
          await tx.execute('UPDATE governance_rules SET current_status=?,object_version=object_version+1 WHERE id=?',[input.target_status,row.id]);
          await audit(tx,a,'RULE_'+input.target_status,row.id,row.object_version+1);
          return {...ruleData(row),current_status:input.target_status,object_version:row.object_version+1};
        });
      });
    },
    async readRule(context,ruleId) {
      id(ruleId);return db.withTransaction(async tx=>{
        const a=await actor(tx,context);await permitted(tx,a,'READ_RULE',ruleId);
        const row=await one(tx,'SELECT * FROM governance_rules WHERE id=?',[ruleId]);
        if(!row)throw error('RULE_NOT_FOUND',404);return ruleData(row);
      });
    },
    async seal(context,input) {
      input=JSON.parse(content.canonical(input));
      shape(input,['source_ref','operation_key']);ref(input.source_ref);
      return db.withTransaction(async tx=>{
        const a=await actor(tx,context);await permitted(tx,a,'SEAL',input.source_ref);
        return command(tx,a,'SEAL',input,async()=>{
          const old=await one(tx,'SELECT id FROM governance_snapshots WHERE source_ref=?',[input.source_ref]);
          if(old)return snapshot(tx,a,old.id);
          // The owning order/contract service must lock and verify an immutable source revision here.
          const loaded=await loadCommitment(tx,{account_id:a.account_id,source_ref:input.source_ref});
          if(!loaded)throw error('COMMITMENT_NOT_READY',409);
          const source=JSON.parse(content.canonical(loaded));
          shape(source,['contract_version_id','party_ids','rule_ids','commitments','reader_account_ids']);
          id(source.contract_version_id);
          for(const field of ['party_ids','rule_ids','reader_account_ids']) {
            if(!Array.isArray(source[field])||!source[field].length||source[field].length>100||new Set(source[field]).size!==source[field].length)throw error('INVALID_COMMITMENT',400);
            source[field].forEach(id);
          }
          if(!source.reader_account_ids.includes(a.account_id))throw error('SEAL_READER_REQUIRED');
          for(const partyId of [...source.party_ids].sort()) {
            const p=await one(tx,'SELECT current_status FROM parties WHERE id=? FOR SHARE',[partyId]);
            if(!p||['SUSPENDED','CLOSED'].includes(p.current_status))throw error('PARTY_NOT_ACTIVE');
          }
          for(const accountId of [...source.reader_account_ids].sort()) {
            const r=await one(tx,'SELECT current_status FROM identity_accounts WHERE id=? FOR SHARE',[accountId]);
            if(!r||r.current_status!=='ACTIVE')throw error('READER_NOT_ACTIVE');
          }
          const byId=new Map();
          for(const ruleId of [...source.rule_ids].sort()) {
            const row=await one(tx,'SELECT * FROM governance_rules WHERE id=? FOR SHARE',[ruleId]);
            if(!row)throw error('RULE_NOT_FOUND',404);
            const {content:body,current_status,effective_at}=ruleData(row);byId.set(ruleId,{content:body,current_status,effective_at});
          }
          const now=await one(tx,"SELECT DATE_FORMAT(CURRENT_TIMESTAMP(3),'%Y-%m-%dT%H:%i:%s.%fZ') AS utc");
          const value=content.sealUnsignedContent({id:randomUUID(),contract_version_id:source.contract_version_id,party_ids:source.party_ids,
            rules:source.rule_ids.map(ruleId=>byId.get(ruleId)),created_at:now.utc.replace(/(\.\d{3})\d{3}Z$/,'$1Z'),commitments:source.commitments});
          try { await tx.execute('INSERT INTO governance_snapshots(id,source_ref,content_json,created_by) VALUES (?,?,?,?)',[value.id,input.source_ref,JSON.stringify(value),a.account_id]); }
          catch(e) {
            if(e.code!=='ER_DUP_ENTRY')throw e;
            const prior=await one(tx,'SELECT id FROM governance_snapshots WHERE source_ref=?',[input.source_ref]);
            if(!prior)throw e;return snapshot(tx,a,prior.id);
          }
          for(const accountId of source.reader_account_ids)await tx.execute('INSERT INTO governance_snapshot_readers(snapshot_id,account_id) VALUES (?,?)',[value.id,accountId]);
          await audit(tx,a,'UNSIGNED_CONTENT_SEALED',value.id,1);
          return value;
        },result=>snapshot(tx,a,result.id));
      });
    },
    async readSnapshot(context,snapshotId) {
      return db.withTransaction(async tx=>snapshot(tx,await actor(tx,context),snapshotId));
    },
    async readSnapshotForParty(context,input) {
      shape(input,['snapshot_id','party_id']);id(input.snapshot_id);id(input.party_id);
      return db.withTransaction(async tx=>{
        const a=await actor(tx,context);
        const membership=await one(tx,`SELECT p.current_status AS party_status,m.current_status AS membership_status
          FROM parties p JOIN party_memberships m ON m.party_id=p.id
          WHERE p.id=? AND m.account_id=? FOR SHARE`,[input.party_id,a.account_id]);
        if(!membership||membership.membership_status!=='ACTIVE'||['SUSPENDED','CLOSED'].includes(membership.party_status))throw error('SNAPSHOT_NOT_FOUND',404);
        const value=await snapshot(tx,a,input.snapshot_id);
        if(!value.party_ids.includes(input.party_id))throw error('SNAPSHOT_NOT_FOUND',404);
        return value;
      });
    },
  });
}
module.exports={createGovernanceRepository};
