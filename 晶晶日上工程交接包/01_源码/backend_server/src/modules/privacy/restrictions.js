'use strict';
const {id,error}=require('../party/policy');
const targets=Object.freeze({
 ASSET:{table:'supply_assets'},
 ARTIST_LISTING:{table:'artist_records',kind:'LISTING'},
 STOCK_LISTING:{table:'stock_listings'},
 NOTICE:{table:'notice_records',kind:'NOTICE'},
 PRODUCTION_VERSION:{table:'production_records',kind:'VERSION'},
});
async function target(tx,kind,key){
 const def=targets[kind];if(!def)throw error('PRIVACY_TARGET_KIND_INVALID',400);
 const [[r]]=await tx.execute(`SELECT * FROM ${def.table} WHERE id=? ${def.kind?'AND kind=? ':''}FOR SHARE`,[id(key),...(def.kind?[def.kind]:[])]);
 if(!r)throw error('PRIVACY_TARGET_NOT_FOUND',404);return r;
}
async function assertUnrestricted(tx,kind,key){
 if(!targets[kind])throw error('PRIVACY_TARGET_KIND_INVALID',400);
 const [[r]]=await tx.execute("SELECT id FROM content_restrictions WHERE target_kind=? AND target_id=? AND current_status='ACTIVE' LIMIT 1 FOR SHARE",[kind,id(key)]);
 if(r)throw error('CONTENT_RESTRICTED',409);
}
async function reviewConflict(tx,kind,r,account){
 if(r.created_by===account)return true;
 const parties=[r.owner_party_id,r.party_id,r.merchant_party_id,r.seller_party_id].filter(Boolean);
 if(kind==='ARTIST_LISTING'){const [[p]]=await tx.execute('SELECT owner_party_id FROM artist_people WHERE id=? FOR SHARE',[r.person_id]);if(p)parties.push(p.owner_party_id);}
 if(kind==='PRODUCTION_VERSION'){const [[p]]=await tx.execute("SELECT data_json,data_sha256 FROM production_records WHERE id=? AND kind='PROJECT' FOR SHARE",[r.project_id]);if(!p)throw error('PRIVACY_TARGET_NOT_FOUND',404);const d=typeof p.data_json==='string'?JSON.parse(p.data_json):p.data_json;if(require('../governance/content').digest(d)!==p.data_sha256)throw error('STORED_CONTENT_MISMATCH',503);parties.push(d.buyer_party_id,d.producer_party_id,d.merchant_party_id);}
 for(const party of new Set(parties.filter(Boolean))){const [[m]]=await tx.execute("SELECT id FROM party_memberships WHERE account_id=? AND party_id=? AND current_status='ACTIVE' LIMIT 1 FOR SHARE",[account,party]);if(m)return true;}
 return false;
}
module.exports={targets,target,assertUnrestricted,reviewConflict};
