// G05/G06 discovery against an existing, bounded synthetic batch.
// Ordinary group failures are recorded; the other independent group still runs.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,dirname,sep} from 'node:path';
import {createRequire} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=process.cwd(),accessFile=resolve(process.env.V5_ACCESS_FILE),f=JSON.parse(await readFile(accessFile,'utf8'));
assert(f.synthetic_only&&new URL(f.base_url).hostname==='127.0.0.1'&&Date.parse(f.expires_at)>Date.now());
const out=resolve(process.env.QA18_OUTPUT_DIR);assert(out.startsWith(join(root,'.local')+sep));await mkdir(out,{recursive:true});
const checkpoint=join(out,'checkpoint.json'),sha=b=>createHash('sha256').update(b).digest('hex');
const typedMedia=process.env.QA18_TYPED_MEDIA==='1';
let s;try{s=JSON.parse(await readFile(checkpoint,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;s={environment:dirname(accessFile).split(/[\\/]/).at(-1),person_id:f.scenarios.first_audition.person_id,avatar_id:f.scenarios.first_audition.avatar_id,period:{valid_from:new Date(Date.now()-3600000).toISOString(),valid_until:new Date(Date.now()+86400000).toISOString()},ops:{},checks:[],requests:[],attempts:[],g05:{},g06:{}};}
assert.equal(s.person_id,f.scenarios.first_audition.person_id);assert(!s.complete,'Completed batch must not be repeated');
if(s.typed_media!==undefined)assert.equal(s.typed_media,typedMedia,'Keep original media coverage on resume');
else {assert(!s.g05.consent||!typedMedia,'Typed media requires a fresh consent');s.typed_media=typedMedia;}
const attempt=Date.now().toString(),source=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();s.attempts.push({attempt,source,started_at:new Date().toISOString()});
const save=()=>writeFile(checkpoint,JSON.stringify(s,null,2));
async function done(name,detail={}){s.checks.push({name,attempt,...detail});await save();}
const person='/artists/people/'+s.person_id,artist='first_auditions_seller',artReviewer='first_auditions_reviewer';
const photo=await readFile(join(dirname(accessFile),'samples/test-portrait.jpg'));
async function api(role,path,{body,version,account=false,allowed=[200],bytes,type,op}={}){
 const a=f.accounts[role],writing=body!==undefined||bytes;
 let key;
 if(writing){const k=role+':'+(op||path),digest=sha(bytes||JSON.stringify(body));s.ops[k]??={key:randomUUID(),body_sha256:digest};assert.equal(s.ops[k].body_sha256,digest,'Resume only the original API body');key=s.ops[k].key;await save();}
 const r=await fetch(f.base_url+path,{method:writing?'POST':'GET',headers:{Authorization:'Bearer '+a.bearer_token,...!account?{'X-Acting-Party':a.party_id}:{},...writing?{'Idempotency-Key':key,'Content-Type':type||'application/json'}:{},...version?{'If-Match':'"'+version+'"'}:{}},...writing?{body:bytes||JSON.stringify(body)}:{}}),raw=Buffer.from(await r.arrayBuffer());let j;try{j=JSON.parse(raw);}catch{}
 s.requests.push({attempt,role,path,method:writing?'POST':'GET',status:r.status,error:j?.error?.code,bytes:raw.length,sha256:sha(raw)});await save();assert(allowed.includes(r.status),`${path}: ${r.status} ${j?.error?.code}`);return {status:r.status,data:j?.data,error:j?.error,bytes:raw};
}
const {chromium}=createRequire(join(root,'晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))('playwright-core');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true}),pages=[];
async function snap(p,name){await p.screenshot({path:join(out,attempt+'-'+name+'.png'),fullPage:true});await writeFile(join(out,attempt+'-'+name+'.aria.txt'),await p.locator('body').ariaSnapshot());}
async function observe(p,role){p.on('response',async r=>{if(!r.url().includes('/api/v1/'))return;try{const bytes=await r.body();s.requests.push({attempt,surface:role,path:new URL(r.url()).pathname,method:r.request().method(),status:r.status(),bytes:bytes.length,sha256:sha(bytes)});}catch{}});p.on('pageerror',e=>s.requests.push({attempt,surface:role,page_error:e.message}));}
async function go(p,path){await p.goto('http://127.0.0.1:5173'+path);await p.waitForLoadState('networkidle');}
async function web(role,path){const c=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',timezoneId:'Asia/Shanghai'}),u=f.accounts[role];await c.addInitScript(({token,party})=>{sessionStorage.setItem('ops.session.token',token);sessionStorage.setItem('ops.session.selected',party);},{token:u.bearer_token,party:u.party_id});const p=await c.newPage();p.setDefaultTimeout(18000);pages.push(p);await observe(p,role+'-vue');await go(p,path);return p;}
async function app(role,path){const c=await browser.newContext({viewport:{width:390,height:844},locale:'zh-CN',timezoneId:'Asia/Shanghai'}),p=await c.newPage();p.setDefaultTimeout(18000);pages.push(p);await observe(p,role+'-flutter');await p.goto('http://127.0.0.1:5500/?fixtureRole='+role+'#'+path);await p.locator('flt-semantics-placeholder').waitFor({state:'attached'});await p.locator('flt-semantics-placeholder').evaluate(e=>e.click());await p.getByRole('heading').first().waitFor();await p.waitForLoadState('networkidle');return p;}
async function appClick(p,name){const loc=p.getByRole('button',{name,exact:true});for(let n=0;n<55;n++){const b=await loc.count()?await loc.boundingBox():null;if(b&&b.y>=58&&b.y+b.height<p.viewportSize().height-15){await p.waitForTimeout(250);await loc.click();return;}await p.mouse.move(175,420);await p.mouse.wheel(0,b?.y<58?-280:280);await p.waitForTimeout(250);}throw Error('App button not reached: '+name);}
async function post(p,path,click,allowed=[200]){const wait=p.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1'+path&&r.request().method()==='POST');await click();const r=await wait,j=await r.json();assert(allowed.includes(r.status()),path+': '+r.status()+' '+j.error?.code);return j.data;}
async function fields(p,values){for(const [k,v] of Object.entries(values)){const l=p.getByTestId('artists-field-'+k);if(await l.evaluate(e=>e.tagName)==='SELECT')await l.selectOption(v);else await l.fill(v);}}
async function artistSubmit(p,path){const confirm=p.getByTestId('artists-form-confirm');if(await confirm.count())await confirm.check();return post(p,path,()=>p.getByTestId('artists-form-submit').click());}
async function artistReview(id,kind,proof){const p=await web(artReviewer,'/artists/reviews/'+kind+'/people/'+s.person_id+'/records/'+id);const read=p.waitForResponse(r=>r.url().includes('/assets/'+proof+'/content'));await p.getByTestId('artists-evidence-'+proof).click();assert.equal((await read).status(),200);await p.getByTestId('artists-review-action').click();await fields(p,{decision:'APPROVE',reason:'核对合成资料、本次公开范围、本人同意和有效期限；非真实业务签收。'});const r=await artistSubmit(p,person+'/records/'+id+'/reviews');assert.equal(r.current_status,'APPROVED');await snap(p,'review-'+kind);await p.close();return r;}
async function prepareArtist(){
 const d=s.g05;
 if(!d.proof){d.proof=(await api(artist,person+'/assets?purpose=CONSENT_EVIDENCE&media_type=text%2Fplain',{bytes:Buffer.from('Synthetic G05 personal rights evidence; no real personal data.'),type:'application/octet-stream'})).data.id;await save();}
 if(!d.consent){d.consent=(await api(artist,person+'/consents',{body:{avatar_id:s.avatar_id,consent:{features:typedMedia?['FACE','VOICE']:['FACE'],purposes:['PRIVATE_ARCHIVE','PUBLIC_DISPLAY'],grantee_party_id:f.accounts[artist].party_id,territories:['CN'],...s.period,terms:typedMedia?'合成色块、视频与测试纯音仅用于私人档案和本次公开展示，不是真人声音，不授权销售或训练。':'合成脸部仅用于本人私人档案和本次公开色块展示，不授权声音、销售或训练。',evidence_asset_ids:[d.proof]}}})).data.id;await save();}
 if(!d.consentApproved){await artistReview(d.consent,'CONSENT',d.proof);d.consentApproved=true;await save();}
 if(!d.halo){d.halo=(await api(artist,person+'/halos',{body:{level:1,ownership_promise:true,evidence_asset_ids:[d.proof]}})).data.id;await save();}
 if(!d.haloApproved){await artistReview(d.halo,'HALO',d.proof);d.haloApproved=true;await save();}
 if(!d.hosting){const h=(await api(artist,person+'/free-services',{body:{avatar_id:s.avatar_id,kind:'AVATAR_HOSTING',rule_version:'CONTRACT_20261029'}})).data;assert.equal(h.current_status,'DELIVERED');assert.equal(h.data.price_minor,0);assert.equal(h.data.payment_requirement,'NONE');d.hosting=h.id;await done('normal-api-free-hosting-and-independent-vue-l1-review');}
}
async function g05(){
 const d=s.g05;if(d.complete)return;
 await prepareArtist();const owner=await web(artist,person);
 if(!d.material){await owner.getByTestId('artists-materials').locator('summary').click();await owner.getByTestId('artists-asset-file').setInputFiles({name:'synthetic-colour-bars.jpg',mimeType:'image/jpeg',buffer:photo});await owner.getByTestId('artists-asset-type').selectOption('image/jpeg');const a=await post(owner,person+'/assets',()=>owner.getByTestId('artists-asset-upload').click());assert.equal(a.content_sha256,sha(photo));d.material=a.id;await save();}
 if(typedMedia)await prepareTypedMedia(owner,d);
 if(!d.look){await go(owner,person+'/variants/new');await fields(owner,{avatar_id:s.avatar_id,kind:'LOOK',display_name:'QA18公开色块造型',consent_id:d.consent,material_asset_ids:d.material});d.look=(await artistSubmit(owner,person+'/variants')).id;await save();}
 if(!d.listing){await go(owner,person+'/listings/new');await fields(owner,{avatar_id:s.avatar_id,display_name:'QA18合成公开艺人',city:'北京市',introduction:'仅用于机器检查的合成色块与公开资料，不是真人肖像或资质。',tags:'合成测试',consent_id:d.consent,look_version_id:d.look,...typedMedia?{voice_version_id:d.voice}:{},preview_asset_ids:typedMedia?[d.material,d.audio.id,d.video.id].join('\n'):d.material});await owner.getByTestId('artists-read-portraits').click();await owner.getByTestId('artists-field-primary_portrait_asset_id').selectOption(d.material);await owner.getByTestId('artists-inspect-portrait').click();await owner.getByTestId('artists-preview').waitFor();d.listing=(await artistSubmit(owner,person+'/listings')).id;await save();await snap(owner,'listing-submitted-with-selected-portrait');}
 if(!d.approved){await api('buyer','/artists/catalog/'+d.listing,{account:true,allowed:[404]});const r=(await api(artist,person+'/records/'+d.listing)).data;await api(artist,person+'/records/'+d.listing+'/reviews',{account:true,version:r.object_version,body:{decision:'APPROVE',reason:'Synthetic self-review negative'},allowed:[403]});await artistReview(d.listing,'LISTING',d.material);d.approved=true;await done('vue-personal-selected-portrait-and-independent-listing-review');}
 const viewer=await web('buyer','/artists/catalog/'+d.listing),mobile=await app('buyer','/artists/public?listingId='+d.listing);
 if(!d.withdrawn){
  await viewer.getByTestId('artists-public-detail').waitFor();assert.equal(await viewer.locator('.artist-public-portrait img').count(),1);await snap(viewer,'vue-public-selected-portrait');await snap(mobile,'flutter-public-selected-portrait');
  const media=(await api('buyer','/artists/catalog/'+d.listing+'/media',{account:true})).data;assert.equal(media.primary_portrait_asset_id,d.material);assert(!JSON.stringify(media).includes(d.proof));
  if(typedMedia&&!d.typedPlayed)await verifyTypedMedia(viewer,mobile,d,media);
  const old=await api('buyer','/artists/catalog/'+d.listing+'/assets/'+d.material+'/content',{account:true});assert.equal(sha(old.bytes),sha(photo));await api('buyer','/artists/assets/'+d.proof+'/content',{allowed:[403,404]});await done('same-public-listing-and-selected-portrait-across-flutter-vue',{listing_id:d.listing});
  if(!d.feature){const curator=await web(artReviewer,'/directory/featured/new');await curator.getByRole('combobox',{name:'选择当前公开艺人',exact:true}).selectOption(d.listing);await curator.getByLabel('推荐说明',{exact:true}).fill('QA18合成推荐，独立于明星认证或排名');await curator.getByLabel('有效开始（本地时间）',{exact:true}).fill(s.period.valid_from.slice(0,16));await curator.getByLabel('有效结束（本地时间）',{exact:true}).fill(s.period.valid_until.slice(0,16));const r=await post(curator,'/directory/featured-artists',()=>curator.getByRole('button',{name:'提交并等待独立审核',exact:true}).click());d.feature=r.id;await save();await api(artReviewer,'/directory/records/'+r.id+'/reviews',{account:true,version:r.object_version,body:{decision:'APPROVE',reason:'Synthetic curator cannot self-review',checks:{public_source_verified:true,recommendation_reviewed:true,not_star_certification:true}},allowed:[403]});await curator.close();}
  if(!d.featureApproved){const reviewer=await web('reviewer','/directory/reviews/FEATURED_ARTIST/'+d.feature);await reviewer.getByLabel('本次处理说明',{exact:true}).fill('独立核对合成公开来源及推荐，非明星认证。');for(const cb of await reviewer.getByRole('checkbox').all())await cb.check();await post(reviewer,'/directory/records/'+d.feature+'/reviews',()=>reviewer.getByRole('button',{name:'通过独立审核',exact:true}).click());d.featureApproved=true;await save();await snap(reviewer,'feature-independent-review');await reviewer.close();}
  const webFeatures=await web('buyer','/directory/featured'),appFeatures=await app('buyer','/directory/featured');assert((await webFeatures.locator('body').innerText()).includes('QA18合成公开艺人'));await snap(webFeatures,'vue-same-feature');await snap(appFeatures,'flutter-same-feature');await done('vue-curation-independent-review-and-cross-surface-feature');
  await go(owner,person+'/records/'+d.consent);await owner.getByTestId('artists-withdraw-action').click();await fields(owner,{reason:'本人撤回本次公开展示同意，旧目录和精选不可继续展示。'});const revoked=await artistSubmit(owner,person+'/records/'+d.consent+'/withdrawals');assert.equal(revoked.current_status,'WITHDRAWN');d.withdrawn=true;await save();
  const denied=viewer.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/artists/catalog/'+d.listing);await viewer.getByRole('button',{name:'重新读取主肖像与公开资料',exact:true}).click();assert([403,404,409].includes((await denied).status()));await viewer.waitForLoadState('networkidle');assert.equal(await viewer.getByTestId('artists-public-detail').count(),0);assert.equal(await viewer.locator('img[src^="blob:"]').count(),0);await snap(viewer,'vue-public-revoked');
  const appDenied=mobile.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/artists/catalog/'+d.listing);await appClick(mobile,'重新核对公开资料');assert([403,404,409].includes((await appDenied).status()));await mobile.waitForLoadState('networkidle');await snap(mobile,'flutter-public-revoked');assert(!(await mobile.locator('body').ariaSnapshot()).includes('QA18合成公开艺人'));
  await webFeatures.getByRole('button',{name:'刷新当前资料',exact:true}).click();await webFeatures.waitForLoadState('networkidle');assert(!(await webFeatures.locator('body').innerText()).includes('QA18合成公开艺人'));await appClick(appFeatures,'刷新当前公开资料');await appFeatures.waitForLoadState('networkidle');assert(!(await appFeatures.locator('body').ariaSnapshot()).includes('QA18合成公开艺人'));await snap(appFeatures,'flutter-feature-hidden');await snap(webFeatures,'vue-feature-hidden');d.cachedRevocation=true;await done('withdrawn-consent-clears-loaded-public-pages-and-feature-lists');
 }
 await api('buyer','/artists/catalog/'+d.listing+'/assets/'+d.material+'/content',{account:true,allowed:[403,404,409]});assert(!(await api('buyer','/directory/featured-artists',{account:true})).data.items.some(x=>x.record_id===d.feature));assert.equal(sha((await api(artist,'/artists/assets/'+d.material+'/content')).bytes),sha(photo));
 if(typedMedia){assert(d.typedPlayed);for(const item of [d.audio,d.video])await api('buyer','/artists/catalog/'+d.listing+'/assets/'+item.id+'/content',{account:true,allowed:[403,404,409]});await done('withdrawal-denies-original-audio-video-bytes');}
 assert(d.cachedRevocation,'Loaded page revocation remains unproven after interrupted attempt');d.complete=true;await done('g05-scoped-public-display-chain-complete-not-full-criterion');
}
async function prepareTypedMedia(owner,d){
 for(const [kind,type,name]of [['audio','audio/wav','synthetic-tone.wav'],['video','video/mp4','sample-1-full.mp4']]){
  if(d[kind])continue;
  let bytes;
  if(kind==='audio'){
   const file=join(out,name);execFileSync(process.env.JX_TEST_FFMPEG||'ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-y','-f','lavfi','-i','sine=frequency=440:sample_rate=16000','-t','2','-c:a','pcm_s16le',file],{windowsHide:true,timeout:30000,stdio:'pipe'});bytes=await readFile(file);
  }else bytes=await readFile(join(dirname(accessFile),'samples',name));
  await go(owner,person);await owner.getByTestId('artists-materials').locator('summary').click();
  await owner.getByTestId('artists-asset-file').setInputFiles({name,mimeType:type,buffer:bytes});await owner.getByTestId('artists-asset-type').selectOption(type);
  const a=await post(owner,person+'/assets',()=>owner.getByTestId('artists-asset-upload').click());assert.equal(a.content_sha256,sha(bytes));d[kind]={id:a.id,type,bytes:bytes.length,sha256:sha(bytes)};await save();
 }
 if(!d.voice){await go(owner,person+'/variants/new');await fields(owner,{avatar_id:s.avatar_id,kind:'VOICE',display_name:'QA18非真人测试纯音',consent_id:d.consent,material_asset_ids:d.audio.id});d.voice=(await artistSubmit(owner,person+'/variants')).id;await save();}
}
async function verifyTypedMedia(viewer,mobile,d,media){
 assert.equal(media.items.length,3);
 for(const [kind,label]of [['audio','声音'],['video','视频']]){
  const item=d[kind],metadata=media.items.find(x=>x.asset_id===item.id);assert(metadata);assert.equal(metadata.media_type,item.type);assert.equal(metadata.media_kind,kind==='audio'?'AUDIO':'VIDEO');assert.equal(metadata.content_sha256,item.sha256);
  const path='/api/v1/artists/catalog/'+d.listing+'/assets/'+item.id+'/content';
  for(const [surface,page]of [['vue',viewer],['flutter',mobile]]){
   const [res]=await Promise.all([
    page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()==='GET'),
    surface==='vue'?page.getByTestId('artists-catalog-preview-'+item.id).click():appClick(page,'读取'+label+'预览 '+(media.items.findIndex(x=>x.asset_id===item.id)+1)),
   ]);assert.equal(res.status(),200);assert.equal(sha(await res.body()),item.sha256);
   const player=surface==='vue'?page.locator('[data-testid="artists-preview"] '+kind):page.locator('video').last();await player.waitFor({state:'attached'});
   await page.waitForFunction(el=>el.readyState>=2&&el.duration>0,await player.elementHandle());
   await player.evaluate(el=>{el.muted=true;return el.play();});await page.waitForFunction(el=>el.currentTime>0,await player.elementHandle());
   const played=await player.evaluate(el=>({duration:el.duration,current_time:el.currentTime,paused:el.paused,error:el.error?.code??null}));assert.equal(played.error,null);assert(played.duration>1&&played.duration<3);
   await snap(page,surface+'-actual-'+kind+'-playback');await player.evaluate(el=>el.pause());await done(surface+'-actual-'+kind+'-typed-playback',{listing_id:d.listing,asset_id:item.id,sha256:item.sha256,...played});
   if(surface==='vue')await page.getByRole('button',{name:'关闭并清除预览',exact:true}).click();
  }
 }
 d.typedPlayed=true;await save();
}
async function g06(){
 const d=s.g06;if(d.complete)return;const owner=await web('mcn_owner','/directory/manage/new');
 if(!d.record){await owner.getByLabel('公开名称',{exact:true}).fill('QA18合成机构公开资料');await owner.getByLabel('城市',{exact:true}).fill('北京市');await owner.getByLabel('机构公开介绍',{exact:true}).fill('合成机构公开资料，用于独审、主图和撤回核权检查，无私人联系方式。');await owner.getByRole('checkbox',{name:'艺人经营',exact:true}).check();await owner.getByLabel('有效开始（本地时间）',{exact:true}).fill(s.period.valid_from.slice(0,16));await owner.getByLabel('有效结束（本地时间）',{exact:true}).fill(s.period.valid_until.slice(0,16));
  for(const [index,file]of [[0,{name:'synthetic-cover.jpg',mimeType:'image/jpeg',buffer:photo}],[1,{name:'synthetic-organization-proof.txt',mimeType:'text/plain',buffer:Buffer.from('Synthetic private organization proof; never public.')}]] ){
   const box=owner.locator('.service-assets').nth(index);await box.locator('input[type=file]').setInputFiles(file);const a=await post(owner,'/supply/assets',()=>box.getByRole('button',{name:'上传所选文件',exact:true}).click());if(index===0)d.cover=a.id;else d.proof=a.id;await save();
  }
  const r=await post(owner,'/directory/organization-profiles',()=>owner.getByRole('button',{name:'提交并等待独立审核',exact:true}).click());d.record=r.id;d.party_id=f.accounts.mcn_owner.party_id;await save();await snap(owner,'organization-submitted');
 }
 if(!d.approved){await api('buyer','/directory/organizations/'+d.party_id,{account:true,allowed:[404]});await api('buyer','/directory/records/'+d.record,{allowed:[404]});const r=(await api('mcn_owner','/directory/records/'+d.record)).data;await api('mcn_owner','/directory/records/'+d.record+'/reviews',{account:true,version:r.object_version,body:{decision:'APPROVE',reason:'Synthetic self-review negative',checks:{}},allowed:[403]});const reviewer=await web('reviewer','/directory/reviews/ORGANIZATION/'+d.record);
  for(const [id,prefix]of [[d.cover,'读取主图'],[d.proof,'读取证明']]){const wait=reviewer.waitForResponse(r=>r.url().includes('/materials/'+id));await reviewer.getByRole('button',{name:prefix+' '+id.slice(0,8),exact:true}).click();assert.equal((await wait).status(),200);}
  await reviewer.getByLabel('本次处理说明',{exact:true}).fill('独立读取主图及私证，核对现有机构身份、能力、公开范围和无私人联系方式。');for(const cb of await reviewer.getByRole('checkbox').all())await cb.check();const r2=await post(reviewer,'/directory/records/'+d.record+'/reviews',()=>reviewer.getByRole('button',{name:'通过独立审核',exact:true}).click());assert.equal(r2.current_status,'APPROVED');d.approved=true;await save();await snap(reviewer,'organization-approved');await reviewer.close();await done('vue-organization-profile-cover-proof-and-independent-review');
 }
 const viewer=await web('buyer','/directory/organizations/'+d.party_id),mobile=await app('buyer','/directory/organization?partyId='+d.party_id);
 if(!d.withdrawn){assert((await viewer.locator('body').innerText()).includes('QA18合成机构公开资料'));await snap(viewer,'vue-public-organization');await snap(mobile,'flutter-public-organization');const pub=(await api('buyer','/directory/organizations/'+d.party_id,{account:true})).data;assert.equal(pub.record_id,d.record);assert.deepEqual(pub.verified_capabilities,['MCN']);assert(!JSON.stringify(pub).includes(d.proof));assert.equal(sha((await api('buyer','/directory/organizations/'+d.party_id+'/cover',{account:true})).bytes),sha(photo));await api('buyer','/directory/records/'+d.record+'/materials/'+d.proof,{allowed:[404]});await done('same-public-organization-and-cover-private-proof-denied');
  await go(owner,'/directory/manage/'+d.record);await owner.getByLabel('本次处理说明',{exact:true}).fill('合成机构撤回当前公开版本，旧页面及主图需重新核权。');await post(owner,'/directory/records/'+d.record+'/withdrawals',()=>owner.getByRole('button',{name:'撤回本机构资料',exact:true}).click());d.withdrawn=true;await save();
  const webDenied=viewer.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/directory/organizations/'+d.party_id);await viewer.getByRole('button',{name:'刷新当前资料',exact:true}).click();assert.equal((await webDenied).status(),404);await viewer.waitForLoadState('networkidle');assert(!(await viewer.locator('body').innerText()).includes('QA18合成机构公开资料'));assert.equal(await viewer.locator('img[src^="blob:"]').count(),0);await snap(viewer,'vue-organization-withdrawn');
  const appDenied=mobile.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/directory/organizations/'+d.party_id);await appClick(mobile,'刷新当前公开资料');assert.equal((await appDenied).status(),404);await mobile.waitForLoadState('networkidle');assert(!(await mobile.locator('body').ariaSnapshot()).includes('QA18合成机构公开资料'));await snap(mobile,'flutter-organization-withdrawn');d.cachedRevocation=true;await save();
 }
 await api('buyer','/directory/organizations/'+d.party_id+'/cover',{account:true,allowed:[404]});await api('mcn_owner','/directory/records/'+d.record+'/materials/'+d.proof);assert(d.cachedRevocation,'Original loaded organization page refresh remains unverified');d.complete=true;await done('organization-withdrawal-clears-both-pages-and-old-cover');
}
const outcomes=[];
try{for(const [group,run]of [['G05',g05],['G06',g06]]){
 try{await run();outcomes.push({group,result:'PASS_SCOPED_CHAIN'});}catch(e){outcomes.push({group,result:'FAIL',error:e.message});await save();for(let i=0;i<pages.length;i++)if(!pages[i].isClosed())await snap(pages[i],group+'-failure-'+i);console.error(JSON.stringify(outcomes.at(-1)));}
 for(const p of pages)if(!p.isClosed())await p.close();
}
s.complete=s.g05.complete&&s.g06.complete;await save();await writeFile(join(out,attempt+'-RESULT.json'),JSON.stringify({source,outcomes,checks:s.checks,limits:['Synthetic API setup of personal consent and L1; independent reviews are real Vue actions','Organization example uses existing MCN capability; no new artist onboarding','No physical Android or full G05/G06 criterion acceptance','Resumed discovery evidence is not final clean full regression']},null,2));console.log(JSON.stringify({outcomes,complete:s.complete}));if(!s.complete)process.exitCode=1;
}finally{await browser.close();}
