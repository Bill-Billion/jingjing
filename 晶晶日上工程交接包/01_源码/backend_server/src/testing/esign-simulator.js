'use strict';

const {randomUUID}=require('node:crypto');
const {digest}=require('../modules/governance/content');
const {error}=require('../modules/party/policy');

const scenarios=new Set(['SUCCESS','FAILURE','TIMEOUT_THEN_SUCCESS']);
const terminal=new Set(['SIMULATED_SUCCESS','SIMULATED_FAILURE']);
const one=async(tx,sql,values)=>(await tx.execute(sql,values))[0][0];

async function createESignSimulator(db,env) {
  if(env.NODE_ENV!=='test'||env.JX_ESIGN_SIMULATOR_ENABLED!=='true'||env.MYSQL_HOST!=='127.0.0.1'||
    String(env.MYSQL_PORT)!=='33316'||(env.HOST&&env.HOST!=='127.0.0.1')) {
    throw error('SIMULATOR_REQUIRES_ISOLATED_TEST',503);
  }
  const {name}=await one(db,'SELECT DATABASE() AS name');
  if(!/^jx_test_[a-zA-Z0-9_]+$/.test(name)||name!==env.MYSQL_DATABASE) {
    throw error('SIMULATOR_REQUIRES_ISOLATED_TEST',503);
  }
  // Like the payment fixture, keep simulator schema in the isolated database.
  await db.execute(`CREATE TABLE IF NOT EXISTS test_esign_receipts (
    id CHAR(36) CHARACTER SET ascii PRIMARY KEY,
    snapshot_id CHAR(36) CHARACTER SET ascii NOT NULL UNIQUE,
    snapshot_sha256 CHAR(64) CHARACTER SET ascii NOT NULL,
    signer_party_id CHAR(36) CHARACTER SET ascii NOT NULL,
    actor_account_id CHAR(36) CHARACTER SET ascii NOT NULL,
    operation_sha256 CHAR(64) CHARACTER SET ascii NOT NULL UNIQUE,
    current_status ENUM('PENDING','OUTCOME_UNKNOWN','SIMULATED_SUCCESS','SIMULATED_FAILURE') NOT NULL,
    object_version INT UNSIGNED NOT NULL,
    receipt_ref VARCHAR(64) CHARACTER SET ascii NULL
  ) ENGINE=InnoDB`);
  await db.execute(`CREATE TABLE IF NOT EXISTS test_esign_receipt_events (
    receipt_id CHAR(36) CHARACTER SET ascii NOT NULL,
    object_version INT UNSIGNED NOT NULL,
    current_status ENUM('PENDING','OUTCOME_UNKNOWN','SIMULATED_SUCCESS','SIMULATED_FAILURE') NOT NULL,
    receipt_ref VARCHAR(64) CHARACTER SET ascii NULL,
    recorded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY(receipt_id,object_version),
    FOREIGN KEY(receipt_id) REFERENCES test_esign_receipts(id)
  ) ENGINE=InnoDB`);

  async function scope(tx,governance,context,input) {
    const {value,a,membership}=await governance.readPartySnapshot(tx,context,input);
    const fixture=value.commitments.sandbox_signing;
    if(!fixture||!scenarios.has(fixture.scenario)||fixture.signer_party_id!==input.party_id||
      fixture.signer_account_id!==a.account_id||membership.kind!=='PERSON'||
      membership.personal_account_id!==a.account_id||membership.role_code!=='OWNER') throw error('SIMULATED_SIGNING_NOT_AVAILABLE',404);
    return {snapshot:value,account:a.account_id,scenario:fixture.scenario};
  }
  function dto(input,row) {
    return {snapshot_id:input.snapshot.id,snapshot_sha256:input.snapshot.content_sha256,simulation:true,
      receipt:row?{id:row.id,current_status:row.current_status,object_version:Number(row.object_version),
        receipt_ref:row.receipt_ref}:null};
  }
  async function select(tx,input,lock=false) {
    const row=await one(tx,'SELECT * FROM test_esign_receipts WHERE snapshot_id=?'+(lock?' FOR UPDATE':''),
      [input.snapshot.id]);
    if(row&&(row.snapshot_sha256!==input.snapshot.content_sha256||row.actor_account_id!==input.account)) {
      throw error('STORED_CONTENT_MISMATCH',503);
    }
    return row;
  }
  async function append(tx,row) {
    await tx.execute('INSERT INTO test_esign_receipt_events(receipt_id,object_version,current_status,receipt_ref) VALUES (?,?,?,?)',
      [row.id,row.object_version,row.current_status,row.receipt_ref]);
  }

  async function providerResult(row,scenario,reconciling) {
    if(scenario==='TIMEOUT_THEN_SUCCESS'&&!reconciling) {
      // The isolated adapter accepts the request but supplies no result to submit.
      return await new Promise(resolve=>setTimeout(()=>resolve({
        current_status:'OUTCOME_UNKNOWN',receipt_ref:null,
      }),80));
    }
    return {current_status:scenario==='FAILURE'?'SIMULATED_FAILURE':'SIMULATED_SUCCESS',receipt_ref:'sim-esign:'+row.id};
  }
  async function record(governance,context,input,row,outcome) {
    return db.withTransaction(async tx=>{
      const scoped=await scope(tx,governance,context,input);
      const old=await select(tx,scoped,true);
      if(!old||old.id!==row.id)throw error('SIMULATED_SIGNING_NOT_AVAILABLE',404);
      if(terminal.has(old.current_status)||old.current_status===outcome.current_status)return dto(scoped,old);
      const next={...old,...outcome,object_version:Number(old.object_version)+1};
      await tx.execute('UPDATE test_esign_receipts SET current_status=?,object_version=?,receipt_ref=? WHERE id=?',
        [next.current_status,next.object_version,next.receipt_ref,next.id]);
      await append(tx,next);
      return dto(scoped,next);
    });
  }

  return Object.freeze({
    belongsTo:database=>database===db,
    read(governance,context,input) {
      return db.withTransaction(async tx=>{
        const scoped=await scope(tx,governance,context,input);
        return dto(scoped,await select(tx,scoped));
      });
    },
    async start(governance,context,input,sha,operationKey) {
      const reserved=await db.withTransaction(async tx=>{
        const scoped=await scope(tx,governance,context,input);
        if(sha!==scoped.snapshot.content_sha256)throw error('SIMULATED_SIGNING_SNAPSHOT_CHANGED',409);
        const requestId=randomUUID();
        const operation=digest([scoped.account,operationKey]);
        await tx.execute(`INSERT INTO test_esign_receipts
          (id,snapshot_id,snapshot_sha256,signer_party_id,actor_account_id,operation_sha256,current_status,object_version)
          VALUES (?,?,?,?,?,?,'PENDING',1) ON DUPLICATE KEY UPDATE id=id`,
          [requestId,input.snapshot_id,sha,input.party_id,scoped.account,operation]);
        const row=await select(tx,scoped,true);
        if(!row)throw error('IDEMPOTENCY_CONFLICT',409);
        if(row.operation_sha256!==operation||row.signer_party_id!==input.party_id)throw error('SIMULATED_SIGNING_ALREADY_STARTED',409);
        const fresh=row.id===requestId;
        if(fresh)await append(tx,row);
        return {scoped,row,fresh};
      });
      const {scoped,row,fresh}=reserved;
      if(!fresh)return dto(scoped,row);
      const outcome=await providerResult(row,scoped.scenario,false);
      const result=await record(governance,context,input,row,outcome);
      if(result.receipt.current_status==='OUTCOME_UNKNOWN')throw error('PROVIDER_OUTCOME_UNKNOWN',503);
      return result;
    },
    async reconcile(governance,context,input) {
      const {scoped,row}=await db.withTransaction(async tx=>{
        const scoped=await scope(tx,governance,context,input);
        return {scoped,row:await select(tx,scoped)};
      });
      if(!row)throw error('SIMULATED_SIGNING_NOT_STARTED',404);
      if(terminal.has(row.current_status))return dto(scoped,row);
      return record(governance,context,input,row,await providerResult(row,scoped.scenario,true));
    },
  });
}
module.exports={createESignSimulator};
