'use strict';
// Disposable synthetic data only. Seed helpers call the real repositories;
// follow-up setup uses the real loopback HTTP API, never real providers.
const path=require('node:path'),fs=require('node:fs/promises');
const {randomUUID:key,createHash}=require('node:crypto');
const backend=path.resolve(__dirname,'../晶晶日上工程交接包/01_源码/backend_server');
const load=rel=>require(path.join(backend,rel));

async function prepare(db,checkRunning,options={}){
 const stock=await load('test/helpers/stock-seed.cjs').seedStock(db);checkRunning();
 const notices=await load('test/helpers/notices-seed.cjs').seedNotices(db);checkRunning();
 const auditions=await load('test/helpers/auditions-seed.cjs').seedAuditions(db);checkRunning();
 const common=await load('test/support/customization-delivery.cjs').seed(db);checkRunning();
 if(options.samples){const make=common.newOrder;common.newOrder=(args={})=>make({title:'测试定制短片 · 家庭记忆',...args});}
 const people={...common.people},scenarios={},extraFiles=new Map();
 for(const [prefix,seed]of Object.entries({stock,notices,auditions})){
  for(const role of ['seller','buyer','reviewer','outsider','buyer2']){
   const u=seed[role];u.acting_party_id=u.personal_party_id;people[prefix+'_'+role]=u;
  }
 }
 const mediaDir=path.resolve(__dirname,'../.local/v5-r05-r12-media');
 await fs.mkdir(mediaDir,{recursive:true});
 const ffmpeg=process.env.FFMPEG_PATH||'/opt/homebrew/bin/ffmpeg';
 for(const [name,filter]of [['full','testsrc2=size=320x180:rate=15'],['preview','smptebars=size=320x180:rate=15']]){
  const dest=path.join(mediaDir,name+'.mp4');
  try{await fs.access(dest);}catch(e){if(e.code!=='ENOENT')throw e;require('node:child_process').execFileSync(ffmpeg,['-nostdin','-hide_banner','-loglevel','error','-f','lavfi','-i',filter,'-t','1','-an','-c:v','libx264','-pix_fmt','yuv420p',dest],{stdio:'pipe'});}
 }

 const full=await fs.readFile(options.samples?path.join(options.samples,'sample-1-full.mp4'):path.join(mediaDir,'full.mp4')),preview=await fs.readFile(options.samples?path.join(options.samples,'sample-1-preview.mp4'):path.join(mediaDir,'preview.mp4'));
 if([full,preview].some(b=>b.length>(options.samples?16:1)*1024*1024||b.length<16||b.toString('ascii',4,8)!=='ftyp')||full.equals(preview))throw Error('BOUNDED_SYNTHETIC_MP4_REQUIRED');
 for(const [field,body]of [['file_id',full],['preview_file_id',preview]]){
  stock.listingInput[field]=(await stock.supply.upload(stock.seller.ctx,{party_id:stock.seller.personal_party_id,purpose:'WORK_CONTENT',media_type:'video/mp4',body,operation_key:key()})).id;
 }
 if(options.samples){const d=stock.spec.data;let spec=await stock.trade.createSpec(stock.seller.ctx,{party_id:stock.seller.personal_party_id,previous_spec_id:stock.spec.id,title:'样片体验 · 私人观看许可',provider_party_id:stock.seller.personal_party_id,line_kind:d.line_kind,unit_minor:d.unit_minor,currency:d.currency,specification:{...d.specification,terms:'只用于测试购买、预览与售后，不产生真实销售或真人授权。'},product_profile:d.product_profile,operation_key:key()});spec=await stock.trade.review(stock.reviewer.ctx,{record_id:spec.id,expected_version:spec.object_version,decision:'APPROVED',reason:'独立检查模拟商品',operation_key:key()});stock.listingInput.spec_id=spec.id;}
 if(options.samples){stock.listingInput.description='甲方样片 1 · 测试展示，不代表销售或真人授权';stock.listingInput.city='郑州';}
 for(const state of ['unpaid','paid','unlisted','dispute']){
  const listing=await stock.listing(),order=await stock.checkout(listing);
  if(state!=='unpaid')await stock.payment(order);
  if(state==='unlisted')await stock.stock.status(stock.seller.ctx,{party_id:stock.seller.personal_party_id,record_id:listing.id,expected_version:listing.object_version,action:'UNLIST',reason:'synthetic only',operation_key:key()});
  if(state==='dispute'){
   const p=await stock.stock.purchased(stock.buyer.ctx,{order_id:order.id,party_id:stock.buyer.personal_party_id});
   await stock.stock.openCase(stock.buyer.ctx,{order_id:order.id,party_id:stock.buyer.personal_party_id,expected_version:p.object_version,kind:'RIGHTS_DISPUTE',reason:'synthetic rights dispute',operation_key:key()});
  }
  scenarios['stock_'+state]={listing_id:listing.id,order_id:order.id};
 }
 const pending=await stock.stock.create(stock.seller.ctx,{...stock.listingInput,operation_key:key()});scenarios.stock_pending={listing_id:pending.id};
 if(options.samples){Object.assign(notices.body,{title:'测试招募：城市记忆短片',description:'面向成年体验艺人的模拟报名，不是真实活动。',city:'郑州'});Object.assign(notices.submission,{purpose:'模拟短片合作',content:'虚构艺人报名资料，仅供测试'});}
 const reviewNotice=r=>notices.notices.review(notices.reviewer.ctx,{record_id:r.id,expected_version:r.object_version,decision:'APPROVE',reason:'synthetic independent review',checks:{content_reviewed:true,materials_reviewed:true,no_private_contact:true},operation_key:key()});
 const notice=await reviewNotice(await notices.notices.createNotice(notices.buyer.ctx,{party_id:notices.buyer.personal_party_id,rule_id:notices.rule.id,notice:notices.body,operation_key:key()}));scenarios.notice={notice_id:notice.id};
 for(const state of ['pending','sent','interested']){
  let r=await notices.notices.submit(notices.seller.ctx,{party_id:notices.seller.personal_party_id,rule_id:notices.rule.id,submission:{...notices.submission,notice_id:notice.id},operation_key:key()});
  if(state!=='pending')r=await reviewNotice(r);
  if(state==='interested')r=await notices.notices.decision(notices.buyer.ctx,{party_id:notices.buyer.personal_party_id,record_id:r.id,expected_version:r.object_version,decision:'INTERESTED',operation_key:key()});
  scenarios['notice_'+state]={submission_id:r.id,case_id:r.data.case_id};
 }
 if(options.samples){Object.assign(auditions.offer,{title:'测试试镜：线上资料交付',city:'郑州',service_area:'线上测试',terms:'只体验预约与交付，样片不代表真人试镜授权。'});const photos=[];for(let i=0;i<6;i++)photos.push((await auditions.upload('image/jpeg',await fs.readFile(path.join(options.samples,'test-portrait.jpg')))).id);auditions.delivery.photos=photos;auditions.delivery.videos=[(await auditions.upload('video/mp4',await fs.readFile(path.join(options.samples,'sample-3-full.mp4')))).id];}
 let offer=await auditions.auditions.createOffer(auditions.seller.ctx,{party_id:auditions.seller.personal_party_id,offer:{...auditions.offer,mode:'ONLINE_MATERIALS'},operation_key:key()});
 offer=await auditions.auditions.reviewOffer(auditions.reviewer.ctx,{record_id:offer.id,expected_version:offer.object_version,decision:'APPROVE',reason:'synthetic independent review',operation_key:key()});
 scenarios.audition_offer={offer_id:offer.id};
 let serial=0;
 for(const state of ['ready','awaiting','accepted','delivered','fulfilled']){
  const start=Date.now()+(24+serial++*2)*3600000;
  let r=await auditions.auditions.book(auditions.buyer.ctx,{party_id:auditions.buyer.personal_party_id,offer_id:offer.id,offer_sha256:offer.content_sha256,appointment:{...auditions.appointment,mode:'ONLINE_MATERIALS',starts_at:new Date(start).toISOString(),ends_at:new Date(start+3600000).toISOString()},operation_key:key()});
  const args=()=>({record_id:r.id,expected_version:r.object_version,operation_key:key()});
  r=await auditions.auditions.reviewBooking(auditions.reviewer.ctx,{...args(),decision:'APPROVE',checks:{purpose_verified:true,venue_verified:true,adult_parties_verified:true},reason:'synthetic independent'});
  let order;
  if(state!=='ready'){
   order=await auditions.trade.auditionCheckout(auditions.buyer.ctx,{party_id:auditions.buyer.personal_party_id,booking_id:r.id,booking_sha256:r.content_sha256,operation_key:key()});await auditions.payment(order);
   r=await auditions.auditions.read(auditions.buyer.ctx,{record_id:r.id,party_id:auditions.buyer.personal_party_id});
   if(state!=='awaiting')r=await auditions.auditions.decide(auditions.seller.ctx,{...args(),party_id:auditions.seller.personal_party_id,decision:'ACCEPT',reason:'synthetic accepted'});
   if(['delivered','fulfilled'].includes(state)){
    r=await auditions.auditions.deliver(auditions.seller.ctx,{...args(),party_id:auditions.seller.personal_party_id,delivery:auditions.delivery});
    r=await auditions.auditions.reviewDelivery(auditions.reviewer.ctx,{...args(),decision:'APPROVE',checks:{content_reviewed:true,files_viewable:true,consent_verified:true},reason:options.samples?'模拟授权与真实可播放测试副本；不授予真实业务权利':'synthetic placeholder materials only'});
    if(state==='fulfilled'){
     for(const asset_id of [...auditions.delivery.photos,...auditions.delivery.videos])await auditions.auditions.observed(auditions.buyer.ctx,{record_id:r.id,party_id:auditions.buyer.personal_party_id,asset_id});
     r=await auditions.auditions.read(auditions.buyer.ctx,{record_id:r.id,party_id:auditions.buyer.personal_party_id});
     r=await auditions.auditions.confirm(auditions.buyer.ctx,{...args(),party_id:auditions.buyer.personal_party_id});
    }
   }
  }
  scenarios['audition_'+state]={booking_id:r.id,order_id:order?.id||null};
 }
 await common.actorCast(common.people.buyer);
 const participant=await common.registerActor('共创隔离参与者'),cast=await common.actorCast(participant);people.participant=participant;
 const secret=common.secret,auth=load('src/modules/auth/repository').createAuthRepository(db,{secret});
 for(const u of Object.values(people))await db.execute('UPDATE auth_sessions SET token_hash=? WHERE account_id=?',[auth.secure.digest('token',u.token),u.account_id]);
 const maps=[extraFiles,stock.bytes,notices.bytes,auditions.bytes,common.files];
 const storageFactory=()=>({put:async({key:objectKey,body})=>{extraFiles.set(objectKey,Buffer.from(body));return {key:objectKey,sha256:createHash('sha256').update(body).digest('hex'),size:body.length};},getBuffer:async objectKey=>maps.map(m=>m.get(objectKey)).find(Boolean)});
 for(const u of [common.people.producer,common.people.reviewer,common.people.outsider]){
  for(const action of ['REDEMPTION_REVIEW','WALLET_RULE_REVIEW','FINANCE_REVIEW','COCREATION_REVIEW','ENGAGEMENT_REVIEW','PROJECT_REVIEW','PRIVACY_HANDLE','PRIVACY_REVIEW']){
   await common.grant(u,action);
  }
 }
 // Grant rule review to the separately seeded wallet/ranking reviewers too.
 for(const u of [stock.reviewer,stock.outsider])for(const action of ['WALLET_RULE_REVIEW','ENGAGEMENT_REVIEW'])await common.grant(u,action);
 return {people,scenarios,secret,storageFactory,common,stock,notices,auditions,allFiles:()=>new Map(maps.flatMap(m=>[...m])),merchantId:common.org.party_id,
  async setup(base){
   async function call(route,u,{body=null,version,party=true,operation=key()}={}){
    const res=await fetch(base+route,{method:body===null?'GET':'POST',headers:{Authorization:'Bearer '+u.token,...party?{'X-Acting-Party':u.acting_party_id}:{},...body===null?{}:{'Content-Type':'application/json','Idempotency-Key':operation},...version?{'If-Match':'"'+version+'"'}:{}},...body===null?{}:{body:JSON.stringify(body)}});
    const json=await res.json();if(res.status!==200)throw Object.assign(Error(route+': '+json.error?.code),{code:json.error?.code,route});return json.data;
   }
   const {producer,buyer,reviewer,outsider}=common.people;
   let wr=await call('/wallet/rules',producer,{party:false,body:{rule:{...load('test/helpers/wallet-rule.cjs'),version:'synthetic-wallet-r05r12',free_awards:{REGISTER:100000,DAILY_CHECKIN:null,REVIEW:null,SHARE:null}}}});
   wr=await call('/wallet/rules/'+wr.id+'/review',reviewer,{party:false,version:wr.object_version,body:{decision:'APPROVE',reason:'synthetic independent'}});
   for(const u of [buyer,stock.buyer,stock.seller,auditions.buyer,notices.seller,participant])await call('/wallet/accounts',u,{body:{rule_id:wr.id,rule_sha256:wr.content_sha256}});
   scenarios.wallet={rule_id:wr.id};
   let er=await call('/engagement/rules',stock.outsider,{party:false,body:{rule:load('test/helpers/engagement-rule.cjs')}});
   er=await call('/engagement/rules/'+er.id+'/review',stock.reviewer,{party:false,version:er.object_version,body:{decision:'APPROVE',reason:'synthetic independent'}});
   const profile=await call('/engagement/profiles',stock.seller,{body:{person_id:stock.seller.person.id,city:'隔离城市',district:'隔离分区',category:'演员',opt_in:true}});
   // Simulate elapsed aftercare and a trusted production-shaped receipt only in
   // this disposable database, as the Core engagement integration test does.
   // This is never a real charge or proof of provider readiness.
   const A=load('src/modules/artists/context'),digest=load('src/modules/governance/content').digest;
   let raw=(await db.execute('SELECT data_json FROM engagement_records WHERE id=?',[profile.id]))[0][0];
   let age={...A.parse(raw.data_json),registered_at:new Date(Date.now()-180*86400000).toISOString()};
   await db.execute('UPDATE engagement_records SET data_json=?,data_sha256=? WHERE id=?',[JSON.stringify(age),digest(age),profile.id]);
   const rankedOrder=await stock.checkout(await stock.listing()),config={...stock.config,environment:'PRODUCTION'};
   const rankedPayment=await stock.trade.preparePayment(stock.buyer.ctx,{party_id:stock.buyer.personal_party_id,order_id:rankedOrder.id,installment_key:'stock',operation_key:key()},config);
   await stock.trade.applyPayment({...config,payment_id:rankedPayment.id,currency:'CNY',amount_minor:100,transaction_id:'synthetic-local-proof:'+key(),status:'SUCCEEDED',product_id:null,app_account_token:null});
   raw=(await db.execute('SELECT data_json FROM stock_purchases WHERE order_id=?',[rankedOrder.id]))[0][0];
   age={...A.parse(raw.data_json),accepted_at:new Date(Date.now()-8*86400000).toISOString()};
   await db.execute('UPDATE stock_purchases SET data_json=?,data_sha256=? WHERE order_id=?',[JSON.stringify(age),digest(age),rankedOrder.id]);
   await call('/wallet/earnings/sync',stock.buyer,{body:{order_id:rankedOrder.id}});
   const ranking=await call('/engagement/rankings',stock.reviewer,{party:false,body:{rule_id:er.id,city:'隔离城市',district:'隔离分区',category:'演员'}});
   scenarios.ranking={snapshot_id:ranking.id,profile_id:profile.id};
   const rankEvidence=await common.upload(producer,'REVIEW_EVIDENCE');
   let prize=await call('/engagement/reward-stock',producer,{body:{title:'隔离评选奖项',kind:'CERTIFICATE',terms:'仅合成验收奖项，不代表真实奖励。',capacity:10,valid_until:'2099-01-01T00:00:00.000Z',evidence_asset_ids:[rankEvidence.id]}});
   prize=await call('/engagement/reward-stock/'+prize.id+'/review',reviewer,{party:false,version:prize.object_version,body:{decision:'APPROVE',reason:'synthetic independent'}});
   let event=await call('/engagement/competitions',producer,{party:false,body:{title:'隔离月度评选',snapshot_id:ranking.id,reward_stock_id:prize.id,starts_at:new Date(Date.now()-60000).toISOString(),ends_at:new Date(Date.now()+86400000).toISOString(),appeal_until:new Date(Date.now()+2*86400000).toISOString(),rules:{official_bps:6000,ranking_bps:2000,vote_bps:2000,vote_cost:2,daily_cap:2,tie_mode:'MANUAL_REVIEW',void_point_policy:'HOLD_FOR_APPEAL'}}});
   event=await call('/engagement/competitions/'+event.id+'/review',reviewer,{party:false,version:event.object_version,body:{decision:'APPROVE',reason:'synthetic independent'}});
   let candidate=await call('/engagement/candidates',stock.seller,{body:{event_id:event.id,profile_id:profile.id}});
   candidate=await call('/engagement/candidates/'+candidate.id+'/review',reviewer,{party:false,version:candidate.object_version,body:{decision:'APPROVE',reason:'synthetic independent'}});
   scenarios.competition={event_id:event.id,candidate_id:candidate.id};

   const source=await quoteOnly(common,50000),freeSource=await quoteOnly(common,50000);
   const production=(ids,face)=>({face_minor:face,minimum_minor:50000,spec_ids:ids});
   const template=(kind,title,face,ids,points=6000)=>({version:'synthetic-redemption-r05r12',source_ref:'synthetic-only',title,kind,valid_days:30,exchange_points:points,capacity:100,available_until:'2099-01-01T00:00:00.000Z',terms:'隔离验收：开工核销，退款不返现；不代表真实可售权益。',production:production(ids,face),interview:null,exposure:null});
   async function reward(t){let st=await call('/redemption/stock',producer,{body:{template:t,evidence_asset_ids:[common.proof.id]}});return call('/redemption/stock/'+st.id+'/review',reviewer,{party:false,version:st.object_version,body:{decision:'APPROVE',reason:'synthetic independent inventory'}});}
   const credit=await reward(template('PRODUCTION_CREDIT','隔离制作抵扣券',5000,[source.spec.id])),free=await reward(template('PRODUCTION_FREE','隔离全额制作权益',50000,[freeSource.spec.id],null));
   const grant=await call('/redemption/exchanges',buyer,{body:{stock_id:credit.id,template_sha256:load('src/modules/governance/content').digest(credit.data.template)}});
   const freeGrant=await db.withTransaction(tx=>load('src/modules/redemption/repository').issue(tx,{id:buyer.account_id},free,buyer.personal_party_id,['SYNTHETIC_FREE',key()]));
   scenarios.coupon={quote_id:source.quote.id,spec_id:source.spec.id,grant_id:grant.id,stock_id:credit.id};
   scenarios.full_coupon={quote_id:freeSource.quote.id,grant_id:freeGrant.id,stock_id:free.id};
   const evidence=await common.upload(producer,'REVIEW_EVIDENCE');
   let pool=await call('/redemption/pools',producer,{body:{config:{version:'synthetic-lottery-r05r12',algorithm:'NINE_THEN_CONDITIONAL_TENTH_V1',single_points:300,ten_points:2700,prizes:[{key:'free',kind:'PRODUCTION_FREE',weight:10000,estimated_cost_minor:50000}]},bindings:[{key:'free',stock_id:free.id,point_back:0}],starts_at:'2020-01-01T00:00:00.000Z',ends_at:'2099-01-01T00:00:00.000Z',terms:'仅隔离验收合成奖池；非正式活动。',cost_limit_single_minor:50000,cost_limit_ten_minor:500000,evidence_asset_ids:[evidence.id]}});
   for(const [u,channel]of [[reviewer,'RULES'],[outsider,'FINANCE']])pool=await call('/redemption/pools/'+pool.id+'/review',u,{party:false,version:pool.object_version,body:{channel,decision:'APPROVE',reason:'synthetic independent review',evidence_asset_id:evidence.id}});
   scenarios.lottery={pool_id:pool.id};
   let cr=await call('/cocreation/rules',producer,{party:false,body:{rule:{version:'synthetic-cocreation-r05r12',source_ref:'synthetic:Q11',max_people:40,extension_days:7,participation_terms:'每人单独确认，只获本人片段；非正式生产约定。',benefit:{service_code:'synthetic-personal-clip',description:'隔离个人片段权益',credit_minor:1000,valid_days:30}}}});
   cr=await call('/cocreation/rules/'+cr.id+'/review',reviewer,{party:false,version:cr.object_version,body:{decision:'APPROVE',reason:'synthetic independent'}});
   let room;
   const co=await common.newOrder({beforeQuote:async({story})=>{room=await call('/cocreation/rooms',buyer,{body:{request_id:story.id,rule_id:cr.id,producer_party_id:common.org.party_id,title:'隔离多人共创故事',deadline:new Date(Date.now()+3600000).toISOString(),purpose:'PRIVATE',territory:'CN'}});}});
   const current=await call('/cocreation/rooms/'+room.id,buyer);
   await call('/cocreation/rooms/'+room.id+'/invitations',buyer,{version:current.object_version,body:{person_id:cast.person.id}});
   const member=await call('/cocreation/rooms/'+room.id+'/members',participant,{body:{person_id:cast.person.id,cast:cast.roster.cast,private_story:'仅本人可读的隔离故事',material_asset_ids:cast.look.data.material_asset_ids,sharing_allowed:false,participation_sha256:current.participation_sha256,agreed:true}});
   scenarios.cocreation={room_id:room.id,member_id:member.id,order_id:co.order.id,person_id:cast.person.id};
   const privacy=await call('/privacy/requests',buyer,{party:false,body:{type:'COPY',scopes:['PROFILE'],details:'隔离资料副本申请，只读取本人信息。'}});
   scenarios.privacy={request_id:privacy.id};
   const actor=await common.actorCast(common.people.artist),artist=common.people.artist;
   const consentProof=await common.upload(artist,'CONSENT_EVIDENCE'),artistProof=await common.upload(artist,'RIGHTS_EVIDENCE'),buyerProof=await common.upload(buyer,'RIGHTS_EVIDENCE');
   let releaseConsent=await common.supply.createConsent(artist.ctx,{consent:{avatar_id:actor.avatar.id,subject_party_id:artist.personal_party_id,features:['FACE'],purposes:['RELEASE'],territories:['CN'],valid_from:'2020-01-01T00:00:00.000Z',valid_until:'2099-01-01T00:00:00.000Z',terms:'synthetic release grant',evidence_asset_ids:[consentProof.id]},operation_key:key()});
   releaseConsent=await common.supply.reviewConsent(reviewer.ctx,{record_id:releaseConsent.id,expected_version:releaseConsent.object_version,decision:'APPROVED',reason:'synthetic independent',operation_key:key()});
   let permission=await actor.repo.declareConsent(artist.ctx,{party_id:artist.personal_party_id,person_id:actor.person.id,avatar_id:actor.avatar.id,consent:{features:['FACE'],purposes:['PROJECT_PRODUCTION'],grantee_party_id:buyer.personal_party_id,territories:['CN'],valid_from:'2020-01-01T00:00:00.000Z',valid_until:'2099-01-01T00:00:00.000Z',terms:'synthetic project-specific production',evidence_asset_ids:[consentProof.id]},operation_key:key()});
   permission=await actor.repo.review(reviewer.ctx,{person_id:actor.person.id,record_id:permission.id,expected_version:permission.object_version,decision:'APPROVE',reason:'synthetic independent',operation_key:key()});
   const ruleId=key(),content=load('src/modules/governance/content').createRuleContent({id:ruleId,rule_key:'participation.r05r12.synthetic',version:'1',terms:{marketplace_finance:{model:'V5_TWO_LAYER',product_type:'COMMERCIAL',fee_base:'NET_PAID',platform_party_id:common.org.party_id,platform_bps:2200,referral_bps:0,rounding:'HALF_UP_PLATFORM_REMAINDER'}}});
   await db.execute('INSERT INTO governance_rules(id,rule_key,version_label,content_json,effective_at,created_by,current_status) VALUES (?,?,?,?,?,?,?)',[ruleId,'participation.r05r12.synthetic','1',JSON.stringify(content),'2020-01-01 00:00:00',producer.account_id,'EFFECTIVE']);
   let project=await call('/projects/projects',buyer,{body:{title:'隔离参演与发行项目',business_version:'V5',scope:{purpose:'RELEASE',territory:'CN',language:'zh',valid_until:'2098-01-01T00:00:00.000Z'}}});
   const role=await call('/projects/projects/'+project.id+'/roles',buyer,{version:project.object_version,body:{title:'隔离角色',capacity:1,pricing:'QUOTE',amount_minor:null,terms:'协商片酬，非竞拍。'}});
   let performer=await call('/projects/roles/'+role.id+'/applications',artist,{version:role.object_version,body:{avatar_id:actor.avatar.id,consent_id:releaseConsent.id,amount_minor:10000,note:'隔离本人申请'}});
   performer=await call('/projects/candidates/'+performer.id+'/decisions',buyer,{version:performer.object_version,body:{decision:'SELECT',content_sha256:performer.content_sha256,reason:'隔离选择'}});
   performer=await call('/projects/candidates/'+performer.id+'/decisions',artist,{version:performer.object_version,body:{decision:'CONFIRM',content_sha256:performer.content_sha256,reason:'隔离本人确认'}});
   const terms={mode:'MIXED',usage:'EXISTING_MATERIAL',exclusive:false,territory:'CN',language:'zh',valid_until:'2098-01-01T00:00:00.000Z',permitted_uses:'仅本项目发行',prohibited_uses:'不转移模型或单独声音权利',installments:[{key:'first',amount_minor:3000,milestone:'签约首款'},{key:'final',amount_minor:7000,milestone:'买方确认交付'}],start_payment_keys:['first'],revenue:{basis:'VERIFIED_CHANNEL_NET_RECEIPTS',shares:[{party_id:artist.personal_party_id,role:'RIGHTSHOLDER',bps:2000},{party_id:buyer.personal_party_id,role:'PRODUCER',bps:8000}],terms:'核实渠道净收入'},cancellation_terms:'按实际履约独立核定'};
   let agreement=await call('/projects/candidates/'+performer.id+'/participations',artist,{version:performer.object_version,body:{cast:{person_id:actor.person.id,look_version_id:actor.look.id,voice_version_id:null},terms,rule_id:ruleId,evidence_asset_id:artistProof.id}});
   agreement=await call('/projects/participations/'+agreement.id+'/review',reviewer,{party:false,version:agreement.object_version,body:{decision:'APPROVED',reason:'合成隔离独立核对',verification:{identity_verified:true,rights_verified:true,exclusivity_reviewed:true,terms_verified:true,evidence_verified:true}}});
   scenarios.participation={project_id:project.id,candidate_id:performer.id,agreement_id:agreement.id,agreement_sha256:agreement.content_sha256};
   project=await call('/projects/records/'+project.id,buyer);
   const revenue={basis:'VERIFIED_CHANNEL_NET_RECEIPTS',shares:[{party_id:buyer.personal_party_id,role:'PRODUCER',bps:9000},{party_id:common.org.party_id,role:'PLATFORM',bps:1000}],terms:'隔离项目独立发行收入约定，仍需每方确认。'};
   const income=await call('/projects/projects/'+project.id+'/income-agreements',buyer,{version:project.object_version,body:{revenue,evidence_asset_id:buyerProof.id}});
   scenarios.income={project_id:project.id,agreement_id:income.id};

   // One complete 20-person room covers actual eligible-count, private snippet
   // and non-cash service-credit screens. All identities/files remain synthetic.
   {
   const coActors=[{user:participant,...cast}];
   for(let n=1;n<20;n++){
    const user=await common.registerActor('共创隔离参与者'+n),actor=await common.actorCast(user);
    people['co_actor_'+n]=user;coActors.push({user,...actor});
   }
   let readyRoom;
   const ready=await common.newOrder({beforeQuote:async({story})=>{readyRoom=await call('/cocreation/rooms',buyer,{body:{request_id:story.id,rule_id:cr.id,producer_party_id:common.org.party_id,title:'隔离20人共创成片',deadline:new Date(Date.now()+15000).toISOString(),purpose:'PRIVATE',territory:'CN'}});}});
   const readyRead=()=>call('/cocreation/rooms/'+readyRoom.id,buyer);
   let readyMember;
   for(let n=0;n<20;n++){
    const a=coActors[n],current=await readyRead();
    await call('/cocreation/rooms/'+readyRoom.id+'/invitations',buyer,{version:current.object_version,body:{person_id:a.person.id}});
    const m=await call('/cocreation/rooms/'+readyRoom.id+'/members',a.user,{body:{person_id:a.person.id,cast:a.roster.cast,private_story:'仅本人可读的第'+n+'份隔离故事',material_asset_ids:a.look.data.material_asset_ids,sharing_allowed:false,participation_sha256:current.participation_sha256,agreed:true}});
    if(n===0)readyMember=m;
   }
   await common.pay(ready.order,'first');
   const remaining=Date.parse(readyRoom.deadline)-Date.now()+30;
   if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));
   let current=await readyRead();
   current=await call('/cocreation/rooms/'+readyRoom.id+'/close',buyer,{version:current.object_version,body:{}});
   if(current.current_status!=='READY'||current.cutoff.eligible_count!==20)throw Error('SYNTHETIC_COCREATION_CUTOFF_MISMATCH');
   const Prod=load('src/modules/production/repository').createProductionRepository(db,{resolvePrincipal:common.resolvePrincipal});
   let projectReady=await Prod.create(producer.ctx,{party_id:common.org.party_id,order_id:ready.order.id,line_id:'film',script_version_id:common.work.id,license_project_id:null,assignee_account_id:producer.account_id,purpose:'PRIVATE',territory:'CN',consent_ids:[],evidence_asset_id:common.proof.id,fulfillment:{uses_identifiable_people:true,cast:[]},operation_key:key()});
   const reviewP=r=>Prod.review(reviewer.ctx,{record_id:r.id,expected_version:r.object_version,decision:'APPROVED',reason:'synthetic independent content/rights only',verification:r.kind==='PROJECT'?{contract_sha256:r.data.contract_sha256,identity_verified:true,signatures_verified:true,rights_verified:true}:r.data.stage==='SCRIPT'?{script_reviewed:true}:{script_reviewed:true,specification_reviewed:true,audio_reviewed:true,branding_reviewed:true,commercial_watermark_verified:true,ai_label_verified:true},operation_key:key()});
   projectReady=await reviewP(projectReady);
   await Prod.startCustomization(producer.ctx,{party_id:common.org.party_id,record_id:projectReady.id,expected_version:projectReady.object_version,operation_key:key()});
   const getP=()=>Prod.read(producer.ctx,{party_id:common.org.party_id,record_id:projectReady.id});
   async function fileP(stage,variant){
    const body=stage==='SCRIPT'?Buffer.from('SYNTHETIC shared screenplay'):variant==='preview'?preview:full;
    const x=await Prod.reserveFile(producer.ctx,{party_id:common.org.party_id,project_id:projectReady.id,media_type:stage==='SCRIPT'?'text/plain':'video/mp4',body,operation_key:key()});
    await common.storageFactory().put({key:x.record.data.object_key,body});
    return Prod.finishFile(producer.ctx,{party_id:common.org.party_id,record_id:x.record.id,success:true});
   }
   let finalVersion;
   for(const stage of ['SCRIPT','SAMPLE','ROUGH_CUT','FINAL']){
    const a=await fileP(stage,'full'),b=stage==='SCRIPT'?a:await fileP(stage,'preview'),p=await getP();
    const version=await reviewP(await Prod.submitVersion(producer.ctx,{party_id:common.org.party_id,record_id:p.id,expected_version:p.object_version,stage,file_id:a.id,preview_file_id:b.id,note:'synthetic color bars, not real production quality',operation_key:key()}));
    await Prod.observeCustomizationContent(buyer.ctx,{party_id:buyer.acting_party_id,record_id:version.id,variant:'preview'});
    await Prod.feedback(buyer.ctx,{party_id:buyer.acting_party_id,record_id:version.id,expected_version:version.object_version,decision:'ACCEPT',note:'synthetic fixture acceptance',checklist:stage==='SCRIPT'?{script_reviewed:true}:{script_reviewed:true,specification_reviewed:true,audio_reviewed:true,branding_reviewed:true},change_kind:null,operation_key:key()});
    if(stage==='SAMPLE')await common.pay(ready.order,'interim');
    if(stage==='FINAL'){finalVersion=version;await common.pay(ready.order,'last');}
   }
   const personalFile=await fileP('FINAL','full');
   let snippet=await call('/cocreation/rooms/'+readyRoom.id+'/snippets',producer,{body:{member_id:readyMember.id,file_id:personalFile.id,final_version_id:finalVersion.id,note:'synthetic target-only color bars'}});
   snippet=await call('/cocreation/snippets/'+snippet.id+'/review',reviewer,{party:false,version:snippet.object_version,body:{decision:'APPROVE',reason:'synthetic independent',verification:{only_target_person:true,authorization_marked:true,ai_label_verified:true,content_reviewed:true}}});
   const benefit=(await call('/cocreation/benefits',buyer)).items.find(v=>v.parent_id===readyRoom.id);
   scenarios.cocreation_ready={room_id:readyRoom.id,member_id:readyMember.id,order_id:ready.order.id,project_id:projectReady.id,snippet_id:snippet.id,benefit_id:benefit?.id};
   }
   await seedMcn({db,people,scenarios,call,storageFactory});
   await seedCommercial({db,people,scenarios,call});
   return {call,common,stock,notices,auditions,cast};
  }
 };
}
async function quoteOnly(seed,unitMinor){let result;const stop=Error('SYNTHETIC_QUOTE_ONLY');try{await seed.newOrder({unitMinor,beforeAccept:async data=>{result=data;throw stop;}});}catch(e){if(e!==stop)throw e;}if(!result)throw Error('SYNTHETIC_QUOTE_MISSING');return result;}
module.exports={prepare};

async function seedMcn({db,people,scenarios,call,storageFactory}){
 const owner=people.auditions_outsider,employee=people.auditions_buyer2,artist=people.auditions_seller;
 const org=await call('/organizations',owner,{party:false,body:{display_name:'隔离MCN机构'}});
 const orgId=org.party_id;
 // Previously approved capability and relation, matching Core's disposable
 // engagement fixture. Membership/delegation/assignment use actual workflows.
 await db.execute("INSERT INTO party_capabilities(party_id,code,current_status) VALUES (?,'MCN','ACTIVE')",[orgId]);
 const mcnOwner={...owner,acting_party_id:orgId},mcnStaff={...employee,acting_party_id:orgId};
 const invitation=await call('/parties/'+orgId+'/invitations',mcnOwner,{body:{invitee_account_id:employee.account_id,expires_at:new Date(Date.now()+3600000).toISOString()}});
 await call('/parties/'+orgId+'/invitations/'+invitation.invitation_id+'/responses',mcnStaff,{version:1,body:{decision:'ACCEPT'}});
 const [[account]]=await db.execute('SELECT subject_ref FROM identity_accounts WHERE id=?',[owner.account_id]);
 const resolvePrincipal=async ctx=>ctx,repository=load('src/modules/works/repository').createSupplyRepository(db,{resolvePrincipal}),assets=load('src/modules/works/assets').createSupplyAssets({db,repository,storageFactory});
 const proof=await assets.upload({subject_ref:account.subject_ref},{party_id:orgId,purpose:'CONSENT_EVIDENCE',media_type:'text/plain',body:Buffer.from('Synthetic agency agreement, no real rights.'),operation_key:key()});
 let agreement=await call('/gigs/relations',mcnOwner,{body:{artist_party_id:artist.acting_party_id,scope:'COMMERCIAL',valid_from:'2020-01-01T00:00:00.000Z',valid_until:'2099-01-01T00:00:00.000Z',exclusive:false,terms:'模拟机构与艺人直接合作，艺人本人确认；不代表真实签约。',commission:{platform_bps:2000,mcn_bps:0},v5_terms:{version:'V5',supply_share_bps:2000},evidence_asset_ids:[proof.id]}});
 agreement=await call('/gigs/relations/'+agreement.id+'/decision',artist,{version:agreement.object_version,body:{decision:'ACCEPT',reason:'模拟艺人本人确认测试合作'}});
 const relation=agreement.id,data=agreement.data;
 const offer=await call('/auditions/records/'+scenarios.audition_offer.offer_id,artist),personId=offer.data.offer.person_id;
 const evidence=(await db.execute("SELECT id FROM supply_assets WHERE owner_party_id=? AND purpose='CONSENT_EVIDENCE' LIMIT 1",[artist.acting_party_id]))[0][0].id;
 await call('/artists/people/'+personId+'/delegations',artist,{body:{delegation:{organization_party_id:orgId,relation_id:relation,actions:['READ_PROFILE','MANAGE_AUDITIONS'],valid_from:data.valid_from,valid_until:data.valid_until,evidence_asset_ids:[evidence],terms:'仅隔离验收的逐人试镜委派，不改变本人权利。'}}});
 const staff=await call('/engagement/mcn/staff',mcnOwner,{body:{account_id:employee.account_id,person_ids:[personId],actions:['READ_PROFILE','MANAGE_AUDITIONS','READ_INCOME'],valid_until:data.valid_until}});
 const assignment=await call('/engagement/mcn/assignments',mcnOwner,{body:{booking_id:scenarios.audition_accepted.booking_id,order_id:null,account_id:employee.account_id}});
 people.mcn_owner=mcnOwner;people.mcn_staff=mcnStaff;
 scenarios.mcn={party_id:orgId,staff_id:staff.id,person_id:personId,assignment_id:assignment.id,booking_id:scenarios.audition_accepted.booking_id};
}
module.exports.seedMcn=seedMcn;

async function seedCommercial({db,people,scenarios,call}){
 const seller=people.notices_seller,buyer=people.notices_buyer,reviewer=people.notices_reviewer,author=people.notices_outsider;
 for(const u of [author,reviewer])for(const action of ['GIG_REVIEW','SUPPLY_REVIEW_CONSENT']){
  const raw=(await db.execute('SELECT object_version,enabled FROM governance_operator_grants WHERE account_id=? AND action_code=?',[u.account_id,action]))[0][0];
  if(!raw||!raw.enabled)await load('src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:u.account_id,action,enabled:true,expected_version:raw?.object_version||0,expires_at:null,authority_ref:'synthetic:r05r12',reason:'isolated conversation fixture'});
 }
 const source=await call('/notices/records/'+scenarios.notice_sent.submission_id,seller),avatar=source.data.submission.avatar_id;
 const proof=(await db.execute("SELECT id FROM supply_assets WHERE owner_party_id=? AND purpose='CONSENT_EVIDENCE' LIMIT 1",[seller.acting_party_id]))[0][0].id;
 const principals=new Map();
 for(const u of [seller,buyer,reviewer,author]){
  const row=(await db.execute('SELECT subject_ref FROM identity_accounts WHERE id=?',[u.account_id]))[0][0];
  u.fixtureContext={};principals.set(u.fixtureContext,{subject_ref:row.subject_ref});
 }
 const resolvePrincipal=async ctx=>principals.get(ctx),works=load('src/modules/works/repository').createSupplyRepository(db,{resolvePrincipal});
 let consent=await works.createConsent(seller.fixtureContext,{consent:{avatar_id:avatar,subject_party_id:seller.acting_party_id,features:['FACE'],purposes:['COMMERCIAL'],territories:['CN'],valid_from:'2020-01-01T00:00:00.000Z',valid_until:'2099-01-01T00:00:00.000Z',terms:'synthetic separately approved commercial rights',evidence_asset_ids:[proof]},operation_key:key()});
 consent=await works.reviewConsent(reviewer.fixtureContext,{record_id:consent.id,expected_version:consent.object_version,decision:'APPROVED',reason:'synthetic independent',operation_key:key()});
 const ruleId=key(),content=load('src/modules/governance/content').createRuleContent({id:ruleId,rule_key:'conversation.r05r12.synthetic',version:'1',terms:{synthetic:'isolated legacy-compatible commercial record, not production approval'}});
 await db.execute('INSERT INTO governance_rules(id,rule_key,version_label,content_json,effective_at,created_by,current_status) VALUES (?,?,?,?,?,?,?)',[ruleId,'conversation.r05r12.synthetic','1',JSON.stringify(content),'2020-01-01 00:00:00',author.account_id,'EFFECTIVE']);
 const trade=load('src/modules/trade/repository').createTradeRepository(db,{resolvePrincipal});
 const reviewTrade=r=>trade.review(reviewer.fixtureContext,{record_id:r.id,expected_version:r.object_version,decision:'APPROVED',reason:'synthetic independent',operation_key:key()});
 const spec=await reviewTrade(await trade.createSpec(seller.fixtureContext,{party_id:seller.acting_party_id,previous_spec_id:null,title:'隔离商单交付服务',provider_party_id:seller.acting_party_id,line_kind:'OTHER',unit_minor:10001,currency:'CNY',specification:{version:'synthetic1',service_tier:'原服务约定',sample_seconds:0,final_seconds:0,revision_limit:1,deliverables:['隔离商业素材'],terms:'仅本单约定用途'},operation_key:key()}));
 let rule=await call('/gigs/rules',author,{party:false,body:{rule:{version:'synthetic1',categories:[{code:'TEST',allowed:true,required_proofs:[]}],ranking:{window_days:7,newcomer_days:30,minimum_orders:1,order_weight:10,net_minor_weight:0,newcomer_bonus:2},terms:'synthetic only'}}});
 const reviewGig=r=>call('/gigs/records/'+r.id+'/reviews',reviewer,{party:false,version:r.object_version,body:{decision:'APPROVED',reason:'synthetic independent',checks:r.kind==='RULE'?null:{identity_verified:true,authority_verified:true,materials_reviewed:true,content_reviewed:true,marking_reviewed:true}}});
 rule=await reviewGig(rule);
 const gig=await reviewGig(await call('/gigs/requests',buyer,{body:{title:'隔离商业合作',brief:'仅合成订单沟通验收',category:'TEST',scope:{purpose:'COMMERCIAL',territory:'CN',valid_until:'2098-01-01T00:00:00.000Z'},rule_id:rule.id,proofs:[]}}));
 let offer=await reviewGig(await call('/gigs/offers',seller,{body:{gig_id:gig.id,spec_id:spec.id,avatar_id:avatar,consent_id:consent.id,relation_id:null,commission:{platform_bps:2000,mcn_bps:0},terms:'隔离既有商业约定',ranking_opt_in:false,evidence_asset_ids:[proof]}}));
 offer=await call('/gigs/offers/'+offer.id+'/acceptance',buyer,{version:offer.object_version,body:{offer_sha256:offer.content_sha256}});
 const quote=await reviewTrade(await trade.quote(seller.fixtureContext,{party_id:seller.acting_party_id,buyer_party_id:buyer.acting_party_id,lines:[{line_id:'commercial',spec_id:spec.id,quantity:1}],installments:[{key:'full',trigger:'ORDER_ACCEPTED',allocations:[{line_id:'commercial',amount_minor:10001}],apple_product_id:null}],channel:'ALIPAY',transaction_model:'DIRECT_SUPPLIER',rule_id:ruleId,expires_at:'2098-01-01T00:00:00.000Z',payment_window_minutes:30,license_reservation_id:null,commercial_offer_id:offer.id,operation_key:key()}));
 const order=await trade.accept(buyer.fixtureContext,{record_id:quote.id,party_id:buyer.acting_party_id,expected_version:quote.object_version,quote_sha256:quote.content_sha256,operation_key:key()});
 const config={provider:'ALIPAY',environment:'SANDBOX',app_id:'synthetic.app',merchant_id:'synthetic.merchant',merchant_party_id:seller.acting_party_id,config_revision:'synthetic'};
 const payment=await trade.preparePayment(buyer.fixtureContext,{party_id:buyer.acting_party_id,order_id:order.id,installment_key:'full',operation_key:key()},config);
 await trade.applyPayment({...config,payment_id:payment.id,currency:'CNY',amount_minor:10001,transaction_id:'synthetic:'+key(),status:'SUCCEEDED',product_id:null,app_account_token:null});
 scenarios.commercial={order_id:order.id,offer_id:offer.id,legacy_compatible:true};
}
module.exports.seedCommercial=seedCommercial;
