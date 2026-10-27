'use strict';
// Synthetic loopback fixture only. Production repositories remain unchanged.
const path = require('node:path');
const fs = require('node:fs/promises');
const { randomUUID: key, randomBytes, createHash } = require('node:crypto');
const { deflateSync } = require('node:zlib');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../../..');
const backend = path.join(root, '晶晶日上工程交接包/01_源码/backend_server');
const load = file => require(path.join(backend, file));
const city = '郑州';

function portrait(index) {
  // A visibly artificial pictogram, never a photo or a claimed real likeness.
  const colors = [[172,181,164],[170,186,194],[199,176,162],[168,181,190],[196,183,155],[182,166,181],[163,186,178],[191,178,166]];
  const width = 240, height = 320, pixels = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const head = (x-120)**2 + (y-105)**2 < 42**2;
    const body = ((x-120)/87)**2 + ((y-265)/105)**2 < 1 && y > 171;
    const c = head || body ? [57,60,58] : colors[index % colors.length];
    c.forEach((v, k) => { pixels[y * (width * 3 + 1) + 1 + x * 3 + k] = v; });
  }
  function crc(bytes) { let n = 0xffffffff; for (const byte of bytes) { n ^= byte; for (let i=0;i<8;i++) n = (n>>>1) ^ ((n&1) ? 0xedb88320 : 0); } return (n ^ 0xffffffff) >>> 0; }
  function chunk(type, bytes) { const name=Buffer.from(type), len=Buffer.alloc(4), hash=Buffer.alloc(4); len.writeUInt32BE(bytes.length); hash.writeUInt32BE(crc(Buffer.concat([name,bytes]))); return Buffer.concat([len,name,bytes,hash]); }
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}

async function prepare(db) {
  const stock = await load('test/helpers/stock-seed.cjs').seedStock(db);
  const notices = await load('test/helpers/notices-seed.cjs').seedNotices(db);
  const auditions = await load('test/helpers/auditions-seed.cjs').seedAuditions(db);
  const secret = randomBytes(32).toString('base64'), files = new Map(), principals = new Map(), accounts = {}, scenarios = {city, artists: [], stock: [], notices: [], submissions: []};
  const resolvePrincipal = async ctx => principals.get(ctx);
  const parties = load('src/modules/party/repository').createPartyRepository(db, { resolvePrincipal });
  const auth = load('src/modules/auth/repository').createAuthRepository(db, { secret });
  const maps = [files, stock.bytes, notices.bytes, auditions.bytes];
  const storageFactory = () => ({ async put({key:objectKey,body}) { files.set(objectKey,Buffer.from(body)); return {key:objectKey,size:body.length,sha256:createHash('sha256').update(body).digest('hex')}; }, async getBuffer(objectKey) { return maps.map(m=>m.get(objectKey)).find(Boolean); } });
  for (const [prefix, seed] of Object.entries({stock, notices, auditions})) for (const role of ['seller','buyer','reviewer','outsider','buyer2']) accounts[prefix+'_'+role] = seed[role];
  async function actor(role, label) {
    const ctx={};principals.set(ctx,{subject_ref:'synthetic:plaza:'+key()});
    const person={ctx,...await parties.registerAccount(ctx,{display_name:label}),token:randomBytes(32).toString('base64url')};
    await db.execute('INSERT INTO auth_sessions(token_hash,account_id,expires_ms) VALUES (?,?,ROUND(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000)+14400000)',[auth.secure.digest('token',person.token),person.account_id]);
    accounts[role]=person;return person;
  }
  const reviewer=await actor('artist_reviewer','广场合成审核人'),merchantOwner=await actor('artist_merchant','广场合成托管方');
  const merchant=await parties.createOrganization(merchantOwner.ctx,{display_name:'广场合成托管机构',operation_key:key()});
  for (const action of ['ARTIST_REVIEW_RIGHTS','ARTIST_REVIEW_HALO','ARTIST_REVIEW_CONTENT','ARTIST_SERVICE_REVIEW','TRADE_REVIEW']) await load('src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:reviewer.account_id,action,enabled:true,expected_version:0,expires_at:null,authority_ref:'synthetic:plaza',reason:'本轮本机合成截图与接口检查'});
  const artists=load('src/modules/artists/repository').createArtistRepository(db,{resolvePrincipal});
  const assets=load('src/modules/works/assets').createSupplyAssets({db,repository:load('src/modules/artists/assets').createArtistAssetsRepository(db,{resolvePrincipal}),storageFactory});
  const services=load('src/modules/artists/services').createArtistServices(db,{resolvePrincipal,merchantPartyId:merchant.party_id});
  const trade=load('src/modules/trade/repository').createTradeRepository(db,{resolvePrincipal,requireV5Products:true});
  const {createRuleContent}=load('src/modules/governance/content');
  const ruleId=key(),rule=createRuleContent({id:ruleId,rule_key:'synthetic.plaza.hosting',version:'1',terms:{notice:'本机合成托管，不发生真实支付'}});
  await db.execute('INSERT INTO governance_rules(id,rule_key,version_label,content_json,effective_at,created_by,current_status) VALUES (?,?,?,?,?,?,?)',[ruleId,'synthetic.plaza.hosting','1',JSON.stringify(rule),'2020-01-01 00:00:00',merchantOwner.account_id,'EFFECTIVE']);
  let spec=await trade.createSpec(merchantOwner.ctx,{party_id:merchant.party_id,previous_spec_id:null,title:'合成托管服务',provider_party_id:merchant.party_id,line_kind:'OTHER',unit_minor:2900,currency:'CNY',product_profile:{version:'V5',type:'AVATAR_HOSTING'},specification:{version:'synthetic-v1',service_tier:'本机合成',service:{kind:'AVATAR_HOSTING',unit:'AVATAR_MONTH',rule_version:'V5-20261013',source_ref:'synthetic:only',retry_limit:0,hosting_months:1,halo_level:null,failure_policy:'REFUND_UNDELIVERED'},deliverables:['合成托管状态'],terms:'不发生真实支付'},operation_key:key()});
  spec=await trade.review(reviewer.ctx,{record_id:spec.id,expected_version:spec.object_version,decision:'APPROVED',reason:'合成商品审核',operation_key:key()});
  const from=new Date(Date.now()-60000).toISOString(),until=new Date(Date.now()+30*86400000).toISOString();
  const names=['林序','陈知夏','周予安','沈青禾','许知远','苏时雨','江澄','陆言'];
  for (let index=0;index<8;index++) {
    const u=await actor('artist_'+(index+1),'合成艺人 '+names[index]);
    const p=await artists.createPerson(u.ctx,{party_id:u.personal_party_id,display_name:'合成·'+names[index],operation_key:key()});
    const base={party_id:u.personal_party_id,person_id:p.id};
    const identity=await artists.prepareIdentity(u.ctx,{...base,session_ref:'synthetic:local-only',operation_key:key()});
    await artists.applyIdentity(identity.id,{request_key:identity.data.request_key,person_id:p.id,status:'VERIFIED',issuer:'synthetic-only',subject_fingerprint:randomBytes(32).toString('hex'),age_band:'ADULT',valid_until:until,evidence_ref:'synthetic:no-real-person',liveness_verified:true,phone_verified:true});
    const avatar=await artists.createAvatar(u.ctx,{...base,display_name:'合成形象 '+(index+1),operation_key:key()});
    const proof=await assets.upload(u.ctx,{...base,purpose:'CONSENT_EVIDENCE',media_type:'text/plain',body:Buffer.from('Synthetic only; no real identity, likeness, voice or commercial rights.'),operation_key:key()});
    const image=await assets.upload(u.ctx,{...base,purpose:'AVATAR_MATERIAL',media_type:'image/png',body:portrait(index),operation_key:key()});
    const review=r=>artists.review(reviewer.ctx,{person_id:p.id,record_id:r.id,expected_version:r.object_version,decision:'APPROVE',reason:'本机合成资料独立审核',operation_key:key()});
    const consent=await review(await artists.declareConsent(u.ctx,{...base,avatar_id:avatar.id,consent:{features:['FACE'],purposes:['PRIVATE_ARCHIVE','PUBLIC_DISPLAY'],grantee_party_id:u.personal_party_id,territories:['CN'],valid_from:from,valid_until:until,terms:'合成人形占位图；不代表真人肖像授权。',evidence_asset_ids:[proof.id]},operation_key:key()}));
    const look=await artists.createVariant(u.ctx,{...base,avatar_id:avatar.id,kind:'LOOK',variant:{previous_version_id:null,display_name:'合成造型',material_asset_ids:[image.id],consent_id:consent.id},operation_key:key()});
    await review(await artists.requestHalo(u.ctx,{...base,level:1,ownership_promise:true,evidence_asset_ids:[proof.id],operation_key:key()}));
    const service=await services.request(u.ctx,{...base,avatar_id:avatar.id,spec_id:spec.id,renewal_reminder:false,operation_key:key()});
    let quote=await trade.quote(merchantOwner.ctx,{party_id:merchant.party_id,buyer_party_id:u.personal_party_id,lines:[{line_id:'service',spec_id:spec.id,quantity:1}],installments:[{key:'all',trigger:'ORDER_ACCEPTED',allocations:[{line_id:'service',amount_minor:2900}],apple_product_id:null}],channel:'ALIPAY',transaction_model:'PLATFORM_PRINCIPAL',rule_id:ruleId,expires_at:until,payment_window_minutes:30,license_reservation_id:null,artist_service_source:{service_id:service.id},operation_key:key()});
    quote=await trade.review(reviewer.ctx,{record_id:quote.id,expected_version:quote.object_version,decision:'APPROVED',reason:'合成报价',operation_key:key()});
    const order=await trade.accept(u.ctx,{record_id:quote.id,party_id:u.personal_party_id,expected_version:quote.object_version,quote_sha256:quote.content_sha256,operation_key:key()});
    const paymentConfig={provider:'ALIPAY',environment:'SANDBOX',app_id:'synthetic.app',merchant_id:'synthetic.merchant',merchant_party_id:merchant.party_id,config_revision:'synthetic'};
    const payment=await trade.preparePayment(u.ctx,{party_id:u.personal_party_id,order_id:order.id,installment_key:'all',operation_key:key()},paymentConfig);
    await trade.applyPayment({...paymentConfig,payment_id:payment.id,currency:'CNY',amount_minor:2900,transaction_id:'synthetic.'+payment.id,status:'SUCCEEDED',product_id:null,app_account_token:null});
    await services.sync(u.ctx,{...base,record_id:service.id,operation_key:key()});
    const listing=await review(await artists.submitListing(u.ctx,{...base,avatar_id:avatar.id,listing:{display_name:'合成·'+names[index],city,introduction:'同城页面验收用合成资料，头像是程序绘制的人形占位图，不是真人。',tags:[['演员','导演','配音','舞蹈'][index%4],'合成测试'],consent_id:consent.id,look_version_id:look.id,voice_version_id:null,audition_public:index<3,preview_asset_ids:[image.id]},operation_key:key()}));
    scenarios.artists.push({role:'artist_'+(index+1),person_id:p.id,avatar_id:avatar.id,listing_id:listing.id,consent_id:consent.id,preview_asset_id:image.id});
  }

  const mediaDir=path.join(root,'.local/plaza-dense-media');await fs.mkdir(mediaDir,{recursive:true});
  const ffmpeg=process.env.FFMPEG_PATH||'/opt/homebrew/bin/ffmpeg';
  for (const [name,filter] of [['full','testsrc2=size=320x180:rate=15'],['preview','smptebars=size=320x180:rate=15']]) {
    const dest=path.join(mediaDir,name+'.mp4');
    try { await fs.access(dest); } catch(e) { if(e.code!=='ENOENT')throw e;execFileSync(ffmpeg,['-nostdin','-hide_banner','-loglevel','error','-f','lavfi','-i',filter,'-t','1','-an','-c:v','libx264','-pix_fmt','yuv420p',dest],{stdio:'pipe'}); }
  }
  for (const [field,name] of [['file_id','full'],['preview_file_id','preview']]) {
    const bytes=await fs.readFile(path.join(mediaDir,name+'.mp4'));
    if(bytes.length>1024*1024||bytes.toString('ascii',4,8)!=='ftyp')throw Error('BOUNDED_SYNTHETIC_MP4_REQUIRED');
    stock.listingInput[field]=(await stock.supply.upload(stock.seller.ctx,{party_id:stock.seller.personal_party_id,purpose:'WORK_CONTENT',media_type:'video/mp4',body:bytes,operation_key:key()})).id;
  }
  stock.listingInput.city=city;
  const titles=['夜色留白','雨巷来信','一日之间','城市微光','风过街角','夏末回声'];
  for (let index=0;index<6;index++) {
    const d=stock.spec.data;
    let s=await stock.trade.createSpec(stock.seller.ctx,{party_id:stock.seller.personal_party_id,previous_spec_id:stock.spec.id,title:'合成作品·'+titles[index],provider_party_id:stock.seller.personal_party_id,line_kind:d.line_kind,unit_minor:100,currency:'CNY',specification:d.specification,product_profile:d.product_profile,operation_key:key()});
    s=await stock.trade.review(stock.reviewer.ctx,{record_id:s.id,expected_version:s.object_version,decision:'APPROVED',reason:'合成作品，不代表真实在售商品',operation_key:key()});
    stock.listingInput.spec_id=s.id;stock.listingInput.description='合成色条短片，仅用于页面、许可与播放检查；不代表真实商品。';
    const listing=await stock.listing();let order=null;
    if(index<2){order=await stock.checkout(listing);if(index===0)await stock.payment(order);}
    scenarios.stock.push({listing_id:listing.id,order_id:order?.id||null,status:index===0?'PAID':index===1?'UNPAID':'PUBLIC'});
  }
  await notices.fact(notices.buyer,'GROWTH',50000);
  const descriptions={DRAMA:{title:'合成短剧·城市来信',details:{synopsis:'以城市生活为背景的虚构短剧，仅测试投稿。',roles:'成年角色两名'}},PERFORMANCE:{title:'合成演出·剧场片段',details:{venue:'合成公共剧场',schedule:'预约后核对',requirements:'仅供界面测试'}},COMMERCIAL:{title:'合成合作·品牌短片',details:{deliverables:'合成短片展示',requirements:'单独核对商业授权，非现成视频个人许可'}},EVENT:{title:'合成活动·城市光影',details:{venue:'合成活动场地',schedule:'仅测试展示'}},RECRUITMENT:{title:'合成招募·成年演员',details:{roles:'成年演员',requirements:'本人资料与对应接收方授权'}},OFFICIAL:{title:'测试说明·广场验收',details:{summary:'所有记录、身份、价格和媒体均是隔离测试资料，不是真实服务。'}}};
  const reviewNotice=r=>notices.notices.review(notices.reviewer.ctx,{record_id:r.id,expected_version:r.object_version,decision:'APPROVE',reason:'合成通告审核',checks:{content_reviewed:true,materials_reviewed:true,no_private_contact:true},operation_key:key()});
  for (const [type,body] of Object.entries(descriptions)) {
    const official=type==='OFFICIAL';
    const notice=await reviewNotice(await notices.notices.createNotice(official?notices.outsider.ctx:notices.buyer.ctx,{party_id:official?null:notices.buyer.personal_party_id,rule_id:notices.rule.id,notice:{...notices.body,...body,type,city,description:'仅供本轮页面与接口检查的合成通告，不是真实招募或活动。',accept_submissions:['DRAMA','RECRUITMENT'].includes(type)},operation_key:key()}));
    scenarios.notices.push({type,notice_id:notice.id});
  }
  const recruitment=scenarios.notices.find(x=>x.type==='RECRUITMENT').notice_id;
  for (const stage of ['PENDING','SENT','INTERESTED']) {
    let submission=await notices.notices.submit(notices.seller.ctx,{party_id:notices.seller.personal_party_id,rule_id:notices.rule.id,submission:{...notices.submission,notice_id:recruitment,purpose:'合成角色合作',content:'本人提交的合成材料，仅用于投稿页面验收。'},operation_key:key()});
    if(stage!=='PENDING')submission=await reviewNotice(submission);
    if(stage==='INTERESTED')submission=await notices.notices.decision(notices.buyer.ctx,{party_id:notices.buyer.personal_party_id,record_id:submission.id,expected_version:submission.object_version,decision:'INTERESTED',operation_key:key()});
    scenarios.submissions.push({stage,submission_id:submission.id,case_id:submission.data.case_id});
  }
  scenarios.submission_form={role:'notices_seller',notice_id:recruitment,rule_id:notices.rule.id,person_id:notices.seller.person.id,avatar_id:notices.avatar.id,consent_id:notices.consent.id,target_party_id:notices.buyer.personal_party_id};
  auditions.offer.city=city;auditions.appointment.city=city;
  let offer=await auditions.auditions.createOffer(auditions.seller.ctx,{party_id:auditions.seller.personal_party_id,offer:{...auditions.offer,title:'合成试镜·线上资料',mode:'ONLINE_MATERIALS'},operation_key:key()});
  offer=await auditions.auditions.reviewOffer(auditions.reviewer.ctx,{record_id:offer.id,expected_version:offer.object_version,decision:'APPROVE',reason:'合成公开服务，非实时真人档期',operation_key:key()});
  scenarios.audition_offer={offer_id:offer.id};
  const booking=await auditions.auditions.book(auditions.buyer.ctx,{party_id:auditions.buyer.personal_party_id,offer_id:offer.id,offer_sha256:offer.content_sha256,appointment:{...auditions.appointment,mode:'ONLINE_MATERIALS'},operation_key:key()});
  scenarios.audition_booking={booking_id:booking.id,role:'auditions_buyer',status:booking.current_status};
  for (const u of Object.values(accounts)) await db.execute('UPDATE auth_sessions SET token_hash=?,expires_ms=ROUND(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000)+14400000 WHERE account_id=?',[auth.secure.digest('token',u.token),u.account_id]);
  return {secret,storageFactory,merchantId:merchant.party_id,scenarios,accounts:Object.fromEntries(Object.entries(accounts).map(([role,u])=>[role,{account_id:u.account_id,party_id:role==='artist_merchant'?merchant.party_id:u.personal_party_id,bearer_token:u.token}]))};
}
module.exports={prepare};
