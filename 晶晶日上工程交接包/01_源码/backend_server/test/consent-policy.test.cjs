'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID:id}=require('node:crypto');
const {normalizeConsent,coversConsent}=require('../src/modules/works/consent-policy');
const terms=()=>({avatar_id:id(),subject_party_id:id(),features:['FACE'],purposes:['PRIVATE_CUSTOMIZATION'],territories:['CN'],valid_from:'2026-01-01T00:00:00.000Z',valid_until:'2027-01-01T00:00:00.000Z',terms:'合成同意，未核验身份',evidence_asset_ids:[id()]});
const scope={feature:'FACE',purpose:'PRIVATE_CUSTOMIZATION',territory:'CN'};
test('consent requires explicit period, scope and evidence without defaulting to broad rights',()=>{
 const c=terms();assert.deepEqual(normalizeConsent(c),c);
 for(const field of ['features','purposes','territories','evidence_asset_ids'])assert.throws(()=>normalizeConsent({...c,[field]:[]}),{code:'INVALID_CONSENT_SCOPE'});
 assert.throws(()=>normalizeConsent({...c,valid_until:c.valid_from}),{code:'INVALID_CONSENT_PERIOD'});
 assert.throws(()=>normalizeConsent({...c,features:['FACE','FACE']}),{code:'INVALID_CONSENT_SCOPE'});
});
test('future, expired, pending and withdrawn consents never satisfy the scope check',()=>{
 const c=terms(),r={current_status:'APPROVED',data:{consent:c}};
 assert.equal(coversConsent(r,scope,c.valid_from),true);assert.equal(coversConsent(r,scope,c.valid_until),false);
 assert.equal(coversConsent(r,scope,'2025-01-01T00:00:00.000Z'),false);
 for(const current_status of ['PENDING_REVIEW','WITHDRAWN','REJECTED'])assert.equal(coversConsent({...r,current_status},scope,c.valid_from),false);
});
test('face, voice, distribution purpose and territory remain distinct',()=>{
 const r={current_status:'APPROVED',data:{consent:terms()}},at=r.data.consent.valid_from;
 for(const patch of [{feature:'VOICE'},{purpose:'DISTRIBUTION'},{territory:'US'}])assert.equal(coversConsent(r,{...scope,...patch},at),false);
 assert.throws(()=>normalizeConsent({...terms(),identity_verified:true}),{code:'INVALID_INPUT'});
});
