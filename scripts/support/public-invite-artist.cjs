"use strict";
// Isolated fixture prerequisite only. Normal repository commands enforce owner and independent review;
// only the adult identity provider result is synthetic. No approval status is patched with SQL.
const {randomUUID:key,createHash}=require('node:crypto');
const path=require('node:path');
const root=path.resolve(__dirname,'../../晶晶日上工程交接包/01_源码/backend_server');
module.exports=async function publicInviteArtist({db,ownerAccountId,ownerPartyId,reviewerAccountId,materialAssetId,evidenceAssetId,grant}){
 const [[owner]]=await db.execute('SELECT subject_ref FROM identity_accounts WHERE id=?',[ownerAccountId]),[[reviewer]]=await db.execute('SELECT subject_ref FROM identity_accounts WHERE id=?',[reviewerAccountId]);
 if(!owner||!reviewer||ownerAccountId===reviewerAccountId)throw Error('ISOLATED_DISTINCT_ARTIST_REVIEWER_REQUIRED');
 const resolvePrincipal=async ctx=>ctx,repo=require(path.join(root,'src/modules/artists/repository')).createArtistRepository(db,{resolvePrincipal});
 for(const action of ['ARTIST_REVIEW_RIGHTS','ARTIST_REVIEW_CONTENT','ARTIST_REVIEW_HALO'])await grant(action);
 const person=await repo.createPerson(owner,{party_id:ownerPartyId,display_name:'合成公开邀请艺人',operation_key:key()}),pi={party_id:ownerPartyId,person_id:person.id};
 const request=await repo.prepareIdentity(owner,{...pi,session_ref:'synthetic:public-invite:'+key(),operation_key:key()});
 await repo.applyIdentity(request.id,{request_key:request.data.request_key,person_id:person.id,status:'VERIFIED',issuer:'synthetic-local-provider',subject_fingerprint:createHash('sha256').update(ownerAccountId).digest('hex'),age_band:'ADULT',valid_until:'2099-01-01T00:00:00.000Z',evidence_ref:'synthetic:public-invite',liveness_verified:true,phone_verified:true});
 const avatar=await repo.createAvatar(owner,{...pi,display_name:'合成邀请展示形象',operation_key:key()});
 const review=r=>repo.review(reviewer,{person_id:person.id,record_id:r.id,expected_version:r.object_version,decision:'APPROVE',reason:'独立核对合成测试授权及材料，不代表真实审核',operation_key:key()});
 const consent=await review(await repo.declareConsent(owner,{...pi,avatar_id:avatar.id,consent:{features:['FACE'],purposes:['PRIVATE_ARCHIVE','PUBLIC_DISPLAY'],grantee_party_id:ownerPartyId,territories:['WORLDWIDE'],valid_from:'2020-01-01T00:00:00.000Z',valid_until:'2099-01-01T00:00:00.000Z',terms:'仅隔离测试的独立公开展示授权',evidence_asset_ids:[evidenceAssetId]},operation_key:key()}));
 const look=await repo.createVariant(owner,{...pi,avatar_id:avatar.id,kind:'LOOK',variant:{previous_version_id:null,display_name:'合成公开造型',material_asset_ids:[materialAssetId],consent_id:consent.id},operation_key:key()});
 await review(await repo.requestHalo(owner,{...pi,level:1,ownership_promise:true,evidence_asset_ids:[evidenceAssetId],service_id:null,operation_key:key()}));
 const platform=await require(path.join(root,'src/modules/party/repository')).createPartyRepository(db,{resolvePrincipal}).createOrganization(reviewer,{display_name:'合成公开资料托管机构',operation_key:key()});
 await require(path.join(root,'src/modules/artists/services')).createArtistServices(db,{resolvePrincipal,contractPolicy:'CONTRACT_20261029',merchantPartyId:platform.party_id}).requestFree(owner,{...pi,avatar_id:avatar.id,kind:'AVATAR_HOSTING',rule_version:'CONTRACT_20261029',operation_key:key()});
 const listing=await review(await repo.submitListing(owner,{...pi,avatar_id:avatar.id,listing:{display_name:'合成公开邀请艺人',city:'合成城市',introduction:'仅本地测试，公开素材为合成文本',tags:['合成'],consent_id:consent.id,look_version_id:look.id,voice_version_id:null,audition_public:false,preview_asset_ids:[materialAssetId]},operation_key:key()}));
 await repo.publicDetail(owner,{listing_id:listing.id});return {person,avatar,listing};
};
