"use strict";
const {randomUUID:key}=require('node:crypto');
async function seedDirectory(db){
 const S=await require('./notices-seed.cjs').seedNotices(db),{seller,buyer,reviewer,outsider}=S;
 const artistScope={person_id:seller.person.id,party_id:seller.personal_party_id},until='2099-01-01T00:00:00.000Z';
 const reviewArtist=r=>S.artists.review(reviewer.ctx,{person_id:seller.person.id,record_id:r.id,expected_version:r.object_version,decision:'APPROVE',reason:'synthetic public invitation fixture',operation_key:key()});
 await require('../../src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:reviewer.account_id,action:'ARTIST_REVIEW_CONTENT',enabled:true,expected_version:0,expires_at:null,authority_ref:'synthetic:notices',reason:'isolated only'});
 const publicConsent=await reviewArtist(await S.artists.declareConsent(seller.ctx,{...artistScope,avatar_id:S.avatar.id,consent:{features:['FACE'],purposes:['PRIVATE_ARCHIVE','PUBLIC_DISPLAY'],grantee_party_id:seller.personal_party_id,territories:['WORLDWIDE'],valid_from:'2020-01-01T00:00:00.000Z',valid_until:until,terms:'synthetic public invitation consent',evidence_asset_ids:[S.evidence.id]},operation_key:key()}));
 const artistAssets=require('../../src/modules/works/assets').createSupplyAssets({db,repository:require('../../src/modules/artists/assets').createArtistAssetsRepository(db,{resolvePrincipal:S.resolvePrincipal}),storageFactory:S.storageFactory});
 const material=await artistAssets.upload(seller.ctx,{...artistScope,purpose:'AVATAR_MATERIAL',media_type:'image/png',body:Buffer.from('synthetic public image'),operation_key:key()});
 const look=await S.artists.createVariant(seller.ctx,{...artistScope,avatar_id:S.avatar.id,kind:'LOOK',variant:{previous_version_id:null,display_name:'synthetic public look',material_asset_ids:[material.id],consent_id:publicConsent.id},operation_key:key()});
 const halo=await reviewArtist(await S.artists.requestHalo(seller.ctx,{...artistScope,level:1,ownership_promise:true,evidence_asset_ids:[S.evidence.id],operation_key:key()}));
 const merchant=await S.parties.createOrganization(outsider.ctx,{display_name:'synthetic hosting merchant',operation_key:key()});
 const trade=require('../../src/modules/trade/repository').createTradeRepository(db,{resolvePrincipal:S.resolvePrincipal}),services=require('../../src/modules/artists/services').createArtistServices(db,{resolvePrincipal:S.resolvePrincipal,merchantPartyId:merchant.party_id});
 const hostingRuleId=key(),hostingRule=require('../../src/modules/governance/content').createRuleContent({id:hostingRuleId,rule_key:'notices.hosting.synthetic',version:'1',terms:{explicit:'synthetic hosting only'}});
 await db.execute('INSERT INTO governance_rules(id,rule_key,version_label,content_json,effective_at,created_by,current_status) VALUES (?,?,?,?,?,?,?)',[hostingRuleId,'notices.hosting.synthetic','1',JSON.stringify(hostingRule),'2020-01-01 00:00:00',outsider.account_id,'EFFECTIVE']);
 const reviewTrade=r=>trade.review(reviewer.ctx,{record_id:r.id,expected_version:r.object_version,decision:'APPROVED',reason:'synthetic independent hosting review',operation_key:key()});
 const spec=await reviewTrade(await trade.createSpec(outsider.ctx,{party_id:merchant.party_id,previous_spec_id:null,title:'synthetic hosting',provider_party_id:merchant.party_id,line_kind:'OTHER',unit_minor:2900,currency:'CNY',product_profile:{version:'V5',type:'AVATAR_HOSTING'},specification:{version:'synthetic-v1',service_tier:'synthetic',service:{kind:'AVATAR_HOSTING',unit:'AVATAR_MONTH',rule_version:'V5-20261013',source_ref:'synthetic:test',retry_limit:0,hosting_months:1,halo_level:null,failure_policy:'REFUND_UNDELIVERED'},deliverables:['synthetic hosting'],terms:'synthetic only'},operation_key:key()}));
 const hostingRequest=await services.request(seller.ctx,{...artistScope,avatar_id:S.avatar.id,spec_id:spec.id,renewal_reminder:false,operation_key:key()});
 const hostingQuote=await reviewTrade(await trade.quote(outsider.ctx,{party_id:merchant.party_id,buyer_party_id:seller.personal_party_id,lines:[{line_id:'hosting',spec_id:spec.id,quantity:1}],installments:[{key:'all',trigger:'ORDER_ACCEPTED',allocations:[{line_id:'hosting',amount_minor:2900}],apple_product_id:null}],channel:'ALIPAY',transaction_model:'PLATFORM_PRINCIPAL',rule_id:hostingRuleId,expires_at:until,payment_window_minutes:30,license_reservation_id:null,artist_service_source:{service_id:hostingRequest.id},operation_key:key()}));
 const hostingOrder=await trade.accept(seller.ctx,{record_id:hostingQuote.id,party_id:seller.personal_party_id,expected_version:hostingQuote.object_version,quote_sha256:hostingQuote.content_sha256,operation_key:key()});
 const paymentConfig={provider:'ALIPAY',environment:'SANDBOX',app_id:'synthetic.app',merchant_id:'synthetic.merchant',merchant_party_id:merchant.party_id,config_revision:'test'};
 const payment=await trade.preparePayment(seller.ctx,{party_id:seller.personal_party_id,order_id:hostingOrder.id,installment_key:'all',operation_key:key()},paymentConfig);
 await trade.applyPayment({...paymentConfig,payment_id:payment.id,currency:'CNY',amount_minor:2900,transaction_id:'synthetic.'+payment.id,status:'SUCCEEDED',product_id:null,app_account_token:null});
 const hosting=await services.sync(seller.ctx,{...artistScope,record_id:hostingRequest.id,operation_key:key()});
 const listingBody={display_name:'synthetic public artist',city:'synthetic-city',introduction:'synthetic public invitation fixture',tags:['synthetic'],consent_id:publicConsent.id,look_version_id:look.id,voice_version_id:null,audition_public:false,preview_asset_ids:[material.id]};
 const listing=await reviewArtist(await S.artists.submitListing(seller.ctx,{...artistScope,avatar_id:S.avatar.id,listing:listingBody,operation_key:key()}));

 return {...S,publicListing:listing,publicConsent,hosting};
}
module.exports={seedDirectory};
