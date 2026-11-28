'use strict';
const {randomUUID:key}=require('node:crypto');
const {load}=require('./qa18-s4-delta-clone.cjs');

async function seedInvitation(db){
  const S=await load('test/helpers/notices-seed.cjs').seedNotices(db);
  const {seller,buyer,reviewer,outsider}=S;
  const artist={person_id:seller.person.id,party_id:seller.personal_party_id};
  const until='2099-01-01T00:00:00.000Z';
  const reviewArtist=r=>S.artists.review(reviewer.ctx,{person_id:artist.person_id,record_id:r.id,
    expected_version:r.object_version,decision:'APPROVE',reason:'独立核对本合成档案',operation_key:key()});
  await load('src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:reviewer.account_id,
    action:'ARTIST_REVIEW_CONTENT',enabled:true,expected_version:0,expires_at:null,authority_ref:'synthetic:notice',
    reason:'isolated invitation prerequisite'});
  const publicConsent=await reviewArtist(await S.artists.declareConsent(seller.ctx,{...artist,avatar_id:S.avatar.id,
    consent:{features:['FACE'],purposes:['PRIVATE_ARCHIVE','PUBLIC_DISPLAY'],grantee_party_id:seller.personal_party_id,
      territories:['WORLDWIDE'],valid_from:'2020-01-01T00:00:00.000Z',valid_until:until,
      terms:'仅供自动验证的公开展示范围',evidence_asset_ids:[S.evidence.id]},operation_key:key()}));
  const files=load('src/modules/works/assets').createSupplyAssets({db,
    repository:load('src/modules/artists/assets').createArtistAssetsRepository(db,{resolvePrincipal:S.resolvePrincipal}),
    storageFactory:S.storageFactory});
  const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR9sAAAAASUVORK5CYII=','base64');
  const material=await files.upload(seller.ctx,{...artist,purpose:'AVATAR_MATERIAL',media_type:'image/png',body:image,operation_key:key()});
  const look=await S.artists.createVariant(seller.ctx,{...artist,avatar_id:S.avatar.id,kind:'LOOK',
    variant:{previous_version_id:null,display_name:'合成展示',material_asset_ids:[material.id],consent_id:publicConsent.id},
    operation_key:key()});
  await reviewArtist(await S.artists.requestHalo(seller.ctx,{...artist,level:1,
    ownership_promise:true,evidence_asset_ids:[S.evidence.id],operation_key:key()}));
  await load('test/helpers/trusted-identity.cjs').seedAdultIdentity(db,S.resolvePrincipal,outsider);
  const merchant=await S.parties.createOrganization(outsider.ctx,{display_name:'合成托管服务机构',operation_key:key()});
  const trade=load('src/modules/trade/repository').createTradeRepository(db,{resolvePrincipal:S.resolvePrincipal});
  const services=load('src/modules/artists/services').createArtistServices(db,{resolvePrincipal:S.resolvePrincipal,merchantPartyId:merchant.party_id});
  const rule=key();
  const content=load('src/modules/governance/content').createRuleContent({id:rule,rule_key:'notices.closeout.synthetic',version:'1',
    terms:{explicit:'isolated hosting prerequisite'}});
  await db.execute('INSERT INTO governance_rules(id,rule_key,version_label,content_json,effective_at,created_by,current_status) VALUES (?,?,?,?,?,?,?)',
    [rule,'notices.closeout.synthetic','1',JSON.stringify(content),'2020-01-01 00:00:00',outsider.account_id,'EFFECTIVE']);
  const reviewTrade=r=>trade.review(reviewer.ctx,{record_id:r.id,expected_version:r.object_version,decision:'APPROVED',
    reason:'独立核对合成托管规格',operation_key:key()});
  const spec=await reviewTrade(await trade.createSpec(outsider.ctx,{party_id:merchant.party_id,previous_spec_id:null,title:'合成托管',
    provider_party_id:merchant.party_id,line_kind:'OTHER',unit_minor:2900,currency:'CNY',
    product_profile:{version:'V5',type:'AVATAR_HOSTING'},specification:{version:'synthetic-v1',service_tier:'synthetic',
      service:{kind:'AVATAR_HOSTING',unit:'AVATAR_MONTH',rule_version:'V5-20261013',source_ref:'synthetic:closeout',
        retry_limit:0,hosting_months:1,halo_level:null,failure_policy:'REFUND_UNDELIVERED'},
      deliverables:['合成托管'],terms:'仅用于隔离验收'},operation_key:key()}));
  const hosting=await services.request(seller.ctx,{...artist,avatar_id:S.avatar.id,spec_id:spec.id,renewal_reminder:false,operation_key:key()});
  const quote=await reviewTrade(await trade.quote(outsider.ctx,{party_id:merchant.party_id,buyer_party_id:artist.party_id,
    lines:[{line_id:'hosting',spec_id:spec.id,quantity:1}],installments:[{key:'all',trigger:'ORDER_ACCEPTED',
      allocations:[{line_id:'hosting',amount_minor:2900}],apple_product_id:null}],channel:'ALIPAY',
    transaction_model:'PLATFORM_PRINCIPAL',rule_id:rule,expires_at:until,payment_window_minutes:30,
    license_reservation_id:null,artist_service_source:{service_id:hosting.id},operation_key:key()}));
  const order=await trade.accept(seller.ctx,{record_id:quote.id,party_id:artist.party_id,expected_version:quote.object_version,
    quote_sha256:quote.content_sha256,operation_key:key()});
  const config={provider:'ALIPAY',environment:'SANDBOX',app_id:'synthetic.app',merchant_id:'synthetic.merchant',
    merchant_party_id:merchant.party_id,config_revision:'synthetic-closeout'};
  const payment=await trade.preparePayment(seller.ctx,{party_id:artist.party_id,order_id:order.id,installment_key:'all',operation_key:key()},config);
  await trade.applyPayment({...config,payment_id:payment.id,currency:'CNY',amount_minor:2900,transaction_id:'synthetic.'+payment.id,
    status:'SUCCEEDED',product_id:null,app_account_token:null});
  await services.sync(seller.ctx,{...artist,record_id:hosting.id,operation_key:key()});
  const listing=await reviewArtist(await S.artists.submitListing(seller.ctx,{...artist,avatar_id:S.avatar.id,
    listing:{display_name:'合成公开艺人',city:'上海',introduction:'合成邀约来源，隔离使用',tags:['合成'],consent_id:publicConsent.id,
      look_version_id:look.id,voice_version_id:null,audition_public:false,preview_asset_ids:[material.id]},operation_key:key()}));
  const body={...S.submission,kind:'INVITATION',target_party_id:seller.personal_party_id,source_listing_id:listing.id,
    consent_id:publicConsent.id,purpose:'本次合成拍摄邀约',content:'原邀约仅供同记录跨端核对'};
  return {S,body,listing,publicConsent,buyer};
}
module.exports={seedInvitation};
