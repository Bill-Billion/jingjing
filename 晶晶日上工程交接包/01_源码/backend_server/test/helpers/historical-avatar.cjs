'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {digest}=require('../../src/modules/governance/content');
// Historical order/consent fixtures must not create an unverified new avatar through
// today's API. This import is test-only and cannot target the shared development DB.
async function seedHistoricalAvatar(db,actor,input){
 return db.withTransaction(async tx=>{
  const [[schema]]=await tx.execute('SELECT DATABASE() name');assert.match(schema.name,/^jx_test_[0-9]+_[0-9a-f]{12}$/);
  const [[member]]=await tx.execute("SELECT id FROM party_memberships WHERE party_id=? AND account_id=? AND role_code='OWNER' AND current_status='ACTIVE'",[input.party_id,actor.account_id]);assert.ok(member);
  assert.ok(input.material_asset_ids.length);
  for(const asset of input.material_asset_ids){const [[row]]=await tx.execute('SELECT owner_party_id,purpose,current_status FROM supply_assets WHERE id=?',[asset]);assert.equal(row?.owner_party_id,input.party_id);assert.equal(row.purpose,'AVATAR_MATERIAL');assert.equal(row.current_status,'READY');}
  const id=randomUUID(),row={id,kind:'AVATAR',stream_ref:id,revision:1,owner_party_id:input.party_id,created_by:actor.account_id,current_status:'RECORDED',object_version:1,data:{display_name:input.display_name,material_asset_ids:input.material_asset_ids,provider_asset_ref:null}};
  await tx.execute("INSERT INTO supply_records(id,kind,stream_ref,revision,owner_party_id,created_by,current_status,object_version,data_json,data_sha256) VALUES (?,'AVATAR',?,1,?,?,'RECORDED',1,?,?)",[id,id,row.owner_party_id,row.created_by,JSON.stringify(row.data),digest(row.data)]);
  for(const asset of input.material_asset_ids)await tx.execute('INSERT INTO supply_asset_refs(record_id,asset_id) VALUES (?,?)',[id,asset]);
  await tx.execute('INSERT INTO supply_audit(id,record_id,actor_account_id,event_code,from_version,to_version,data_sha256,request_id) VALUES (?,?,?,?,0,1,?,?)',[randomUUID(),id,actor.account_id,'SYNTHETIC_HISTORY_IMPORTED',digest(row.data),randomUUID()]);
  return row;
 });
}
module.exports={seedHistoricalAvatar};
