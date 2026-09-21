'use strict';
const { createHash, randomUUID } = require('node:crypto');
const kinds = Object.freeze(['IdentityProvider','PaymentProvider','ObjectStorageProvider','ModerationProvider','DigitalHumanProvider','ESignProvider']);
const states = Object.freeze(['NOT_IMPLEMENTED','IMPLEMENTED','CONFIGURED','SANDBOX_VERIFIED','PRODUCTION_VERIFIED','WAITING_PROVIDER_APPROVAL','DISABLED_BY_PRODUCT']);
const environments = ['LOCAL','SANDBOX','PRODUCTION'];
const failure = (code) => Object.assign(new Error(code), { code, status: 503 });
function ref(value, name = 'REFERENCE') {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(value)) throw failure(`INVALID_${name}`);
  return value;
}
function descriptor(input) {
  if (!kinds.includes(input.provider_kind) || !environments.includes(input.environment)) throw failure('INVALID_PROVIDER_DESCRIPTOR');
  const provider_code = ref(input.provider_code), capability_code = ref(input.capability_code);
  if (provider_code.length > 100 || capability_code.length > 100) throw failure('INVALID_PROVIDER_DESCRIPTOR');
  return { provider_kind: input.provider_kind, provider_code, capability_code, environment: input.environment };
}
const key = (value) => createHash('sha256').update(JSON.stringify(descriptor(value))).digest('hex');
function createReadinessRepository(db, { authorizeChange = async () => false, verifyEvidence = async () => false } = {}) {
  async function read(input, connection = db) {
    const d = descriptor(input);
    const [[row]] = await connection.execute('SELECT * FROM platform_provider_readiness WHERE id=?', [key(d)]);
    if (!row) return null;
    const [history] = await connection.execute('SELECT * FROM platform_provider_readiness_history WHERE readiness_id=? ORDER BY object_version', [row.id]);
    return { ...row, verification_history: history.filter((h) => ['SANDBOX_VERIFIED','PRODUCTION_VERIFIED'].includes(h.current_status)).map((h) => ({
      verified_state: h.current_status, environment: d.environment, verified_at: h.recorded_at.replace(' ', 'T') + 'Z', evidence_ref: h.evidence_ref, config_revision: h.config_revision, object_version: h.object_version,
    })) };
  }
  return Object.freeze({
    read,
    async record(input, { actor_ref }) {
      const d = descriptor(input), actor = ref(actor_ref, 'ACTOR');
      if (await authorizeChange(actor, d) !== true) throw failure('PROVIDER_CHANGE_FORBIDDEN');
      if (!states.includes(input.current_status)) throw failure('INVALID_READINESS_STATE');
      const revision = ref(input.config_revision, 'CONFIG_REVISION');
      if (!Number.isInteger(input.expected_version) || input.expected_version < 0 || input.expected_version >= 4294967295) throw failure('INVALID_EXPECTED_VERSION');
      const reason = input.reason_code == null ? null : ref(input.reason_code, 'REASON');
      if (reason && (reason.length > 80 || !/^[A-Z][A-Z0-9_]*$/.test(reason))) throw failure('INVALID_REASON');
      const verified = ['SANDBOX_VERIFIED','PRODUCTION_VERIFIED'].includes(input.current_status);
      if (verified && input.current_status !== `${d.environment}_VERIFIED`) throw failure('VERIFICATION_ENVIRONMENT_MISMATCH');
      const evidence = verified ? ref(input.evidence_ref, 'EVIDENCE') : null;
      if (verified && await verifyEvidence({ ...d, config_revision: revision, evidence_ref: evidence, actor_ref: actor }) !== true) throw failure('VERIFICATION_EVIDENCE_REQUIRED');
      // These callbacks belong to trusted server composition; there is no public mutation endpoint.
      return db.withTransaction(async (tx) => {
        const id = key(d), version = input.expected_version + 1;
        if (input.expected_version === 0) {
          try {
            await tx.execute(`INSERT INTO platform_provider_readiness
              (id,provider_kind,provider_code,capability_code,environment,current_status,config_revision,object_version,reason_code)
              VALUES (?,?,?,?,?,?,?,?,?)`, [id,d.provider_kind,d.provider_code,d.capability_code,d.environment,input.current_status,revision,version,reason]);
          } catch (error) { if (error.code === 'ER_DUP_ENTRY') throw failure('PROVIDER_VERSION_CONFLICT'); throw error; }
        } else {
          const [result] = await tx.execute(`UPDATE platform_provider_readiness SET current_status=?,config_revision=?,object_version=?,reason_code=?,updated_at=CURRENT_TIMESTAMP(6)
            WHERE id=? AND object_version=?`, [input.current_status,revision,version,reason,id,input.expected_version]);
          if (result.affectedRows !== 1) throw failure('PROVIDER_VERSION_CONFLICT');
        }
        await tx.execute(`INSERT INTO platform_provider_readiness_history
          (id,readiness_id,object_version,current_status,config_revision,reason_code,evidence_ref,actor_ref) VALUES (?,?,?,?,?,?,?,?)`,
        [randomUUID(),id,version,input.current_status,revision,reason,evidence,actor]);
        return read(d, tx);
      });
    },
  });
}
async function assertUsable(repository, input, inspection) {
  const d = descriptor(input);
  if (!inspection || inspection.implemented !== true) throw failure('PROVIDER_NOT_IMPLEMENTED');
  if (inspection.configured !== true) throw failure('PROVIDER_NOT_CONFIGURED');
  // LOCAL fixtures cannot enable real provider transport, even with a manually entered state.
  if (d.environment === 'LOCAL') throw failure('PROVIDER_ENVIRONMENT_NOT_VERIFIED');
  const row = await repository.read(d);
  if (!row || row.current_status !== `${d.environment}_VERIFIED`) throw failure('PROVIDER_NOT_VERIFIED');
  if (row.config_revision !== inspection.config_revision) throw failure('PROVIDER_CONFIGURATION_CHANGED');
  if (!row.verification_history.some((h) => h.environment === d.environment && h.verified_state === row.current_status && h.config_revision === row.config_revision && h.object_version === row.object_version && h.evidence_ref)) throw failure('VERIFICATION_EVIDENCE_REQUIRED');
  return row;
}
module.exports = { kinds, states, descriptor, failure, ref, createReadinessRepository, assertUsable };
