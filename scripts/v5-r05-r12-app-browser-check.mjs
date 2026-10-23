#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const f=JSON.parse(await readFile(process.env.V5_ACCESS_FILE,'utf8'));
assert(f.synthetic_only&&new URL(f.base_url).hostname==='127.0.0.1');
const out=resolve(process.env.V5_APP_EVIDENCE_DIR||'output/playwright/v5-r05-r12/app');await mkdir(out,{recursive:true});
const {chromium}=createRequire(join(process.cwd(),'晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))('playwright-core');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const s=f.scenarios;
const matrix=[
 ['05-catalog','stock_buyer','/stock/catalog','12-artist-stock-producer.png'],
 ['05-video','stock_buyer',`/stock/video?listingId=${s.stock_paid.listing_id}`,'12-artist-stock-producer.png'],
 ['05-purchases','stock_buyer','/stock/purchases','39-story-top.png'],
 ...['paid','unpaid','unlisted','dispute'].map(k=>['05-purchase-'+k,'stock_buyer',`/stock/purchase?orderId=${s['stock_'+k].order_id}`,'39-story-top.png']),
 ['05-listings','stock_seller','/stock/listings','12-artist-stock-producer.png'],
 ['05-listing','stock_seller',`/stock/listing?listingId=${s.stock_paid.listing_id}`,'12-artist-stock-producer.png'],
 ['05-new','stock_seller','/stock/new','12-artist-stock-producer.png'],
 ['06-catalog','notices_seller','/notices/catalog','23-notice-top.png'],
 ['06-notice','notices_seller',`/notices/public?noticeId=${s.notice.notice_id}`,'23-notice-top.png'],
 ['06-publish','notices_buyer','/notices/new','23-notice-top.png'],
 ['06-records','notices_seller','/notices/records?kind=SUBMISSION','23-notice-top.png'],
 ['06-inbox','notices_buyer','/notices/records?kind=SUBMISSION','23-notice-top.png'],
 ...['pending','sent','interested'].map(k=>['06-submission-'+k,'notices_seller',`/notices/record?recordId=${s['notice_'+k].submission_id}`,'23-notice-top.png']),
 ['06-case','notices_seller',`/notices/record?recordId=${s.notice_interested.case_id}`,'23-notice-top.png'],
 ['06-submit','notices_seller',`/notices/submit?noticeId=${s.notice.notice_id}&kind=PROFILE`,'23-notice-top.png'],
 ['06-qualification','mcn_owner','/notices/qualification','23-notice-top.png'],
 ['07-catalog','auditions_buyer','/auditions/catalog','21-audition-top.png'],
 ['07-book','auditions_buyer',`/auditions/book?offerId=${s.audition_offer.offer_id}`,'21-audition-top.png'],
 ['07-offers','auditions_seller','/auditions/offers','21-audition-top.png'],
 ['07-offer','auditions_seller',`/auditions/offer?offerId=${s.audition_offer.offer_id}`,'21-audition-top.png'],
 ['07-new','auditions_seller','/auditions/new','21-audition-top.png'],
 ['07-bookings','auditions_buyer','/auditions/bookings','21-audition-top.png'],
 ...['ready','awaiting','accepted','delivered','fulfilled'].map(k=>['07-booking-'+k,'auditions_buyer',`/auditions/booking?bookingId=${s['audition_'+k].booking_id}`,'21-audition-top.png']),
 ['07-decision','auditions_seller',`/auditions/action?bookingId=${s.audition_awaiting.booking_id}&action=decision`,'21-audition-top.png'],
 ['07-travel','auditions_seller',`/auditions/action?bookingId=${s.audition_accepted.booking_id}&action=travel`,'21-audition-top.png'],
 ['07-delivery','auditions_seller',`/auditions/action?bookingId=${s.audition_accepted.booking_id}&action=delivery`,'21-audition-top.png'],
 ['07-messages','auditions_buyer',`/auditions/messages?bookingId=${s.audition_accepted.booking_id}`,'21-audition-top.png'],
 ...['summary','rules','recharge','records','sync','level-six'].map(k=>['08-'+k,'stock_buyer',k==='summary'?'/wallet':'/wallet/'+k,'32-wallet-top.png']),
 ['08-unopened','outsider','/wallet','32-wallet-top.png'],
 ['09-rankings','stock_buyer','/engagement','30-cert-growth.png'],
 ['09-ranking','stock_buyer',`/engagement?view=ranking&recordId=${s.ranking.snapshot_id}`,'30-cert-growth.png'],
 ['09-competition','stock_buyer',`/engagement?view=competition&recordId=${s.competition.event_id}`,'30-cert-growth.png'],
 ['09-growth','stock_seller','/engagement?view=growth','30-cert-growth.png'],
 ['09-referrals','stock_buyer','/engagement?view=referrals','30-cert-growth.png'],
 ['09-buyers','stock_buyer','/engagement?view=buyers','30-cert-growth.png'],
 ['09-reviews','stock_buyer','/engagement?view=reviews','30-cert-growth.png'],
 ['09-exposures','stock_buyer','/engagement?view=exposures','30-cert-growth.png'],
 ...(s.commercial ? [['07-commercial-conversation','notices_buyer',`/gigs/conversation?orderId=${s.commercial.order_id}`,'25-messages-top.png']] : []),
 ['09-mcn','mcn_owner','/engagement?view=mcn','12-artist-stock-producer.png'],
 ['09-mcn-staff','mcn_staff','/engagement?view=mcn','12-artist-stock-producer.png'],
 ['09-staff-growth','mcn_staff',`/engagement?view=growth&recordId=${s.mcn.person_id}`,'30-cert-growth.png'],
 ['07-staff-booking','mcn_staff',`/auditions/booking?bookingId=${s.mcn.booking_id}`,'21-audition-top.png'],
 ['05-trade-order','stock_buyer',`/trade/record?recordId=${s.stock_paid.order_id}`,'34-orders-top.png'],
 ['07-trade-order','auditions_buyer',`/trade/record?recordId=${s.audition_accepted.order_id}`,'34-orders-top.png'],
 ['10-ready-room','buyer',`/cocreation?view=room&recordId=${s.cocreation_ready.room_id}`,'38-custom-extra.png'],
 ['10-ready-member','participant',`/cocreation?view=member&recordId=${s.cocreation_ready.member_id}`,'38-custom-extra.png'],
 ['10-personal-snippet','participant','/cocreation?view=snippets','38-custom-extra.png'],
 ['10-ready-benefit','buyer','/cocreation?view=benefits','38-custom-extra.png'],
 ['10-rooms','buyer','/cocreation','38-custom-extra.png'],
 ['10-room','buyer',`/cocreation?view=room&recordId=${s.cocreation.room_id}`,'38-custom-extra.png'],
 ['10-member','participant',`/cocreation?view=member&recordId=${s.cocreation.member_id}`,'38-custom-extra.png'],
 ...['new','invitations','members','snippets','benefits'].map(k=>['10-'+k,k==='new'?'buyer':'participant','/cocreation?view='+k,'38-custom-extra.png']),
 ['11-catalog','buyer','/redemption','32-wallet-top.png'],
 ['11-grants','buyer','/redemption?view=grants','32-wallet-top.png'],
 ['11-grant','buyer',`/redemption?view=grant&recordId=${s.full_coupon.grant_id}`,'32-wallet-top.png'],
 ['11-checkout','buyer',`/redemption?view=checkout&recordId=${s.full_coupon.grant_id}&quoteId=${s.full_coupon.quote_id}`,'32-wallet-top.png'],
 ['11-pools','buyer','/redemption?view=pools','32-wallet-top.png'],
 ['11-pool','buyer',`/redemption?view=pool&recordId=${s.lottery.pool_id}`,'32-wallet-top.png'],
 ['11-draws','buyer','/redemption?view=draws','32-wallet-top.png'],
 ['12-participations','buyer','/projects/participation','38-custom-extra.png'],
 ['12-participation','buyer',`/projects/participation?view=agreement&recordId=${s.participation.agreement_id}`,'38-custom-extra.png'],
 ['12-performer','artist',`/projects/participation?view=agreement&recordId=${s.participation.agreement_id}`,'38-custom-extra.png'],
 ['12-amendment','artist',`/projects/participation?view=amend&recordId=${s.participation.agreement_id}`,'38-custom-extra.png'],
 ['12-income','buyer',`/projects/income?view=agreement&recordId=${s.income.agreement_id}`,'38-custom-extra.png'],
 ['12-income-new','buyer',`/projects/income?view=new&projectId=${s.income.project_id}`,'38-custom-extra.png'],
 ['12-privacy','buyer','/privacy/requests','40-states-a-top.png'],
 ['12-privacy-request','buyer',`/privacy?view=request&recordId=${s.privacy.request_id}`,'40-states-a-top.png'],
 ['12-privacy-new','buyer','/privacy?view=new','40-states-a-top.png'],
 ['12-preferences','buyer','/privacy?view=preferences','40-states-a-top.png'],
 ['08-points','stock_buyer','/wallet/points','32-wallet-top.png'],
 ['08-scout','stock_buyer','/wallet/scout','32-wallet-top.png'],
 ['11-role','buyer','/redemption?view=role','32-wallet-top.png'],
 ['11-pools-closed','buyer','/redemption?view=pools','32-wallet-top.png',{visual_state_stub:'empty-pools'}],
 ['12-preferences-on','buyer','/privacy?view=preferences','40-states-a-top.png',{interaction:'preferences-on-unsaved'}],
 ['05-new-selected','stock_seller','/stock/new','12-artist-stock-producer.png',{interaction:'stock-form-selected-unsaved'}],
 ['06-submit-selected','notices_seller',`/notices/submit?noticeId=${s.notice.notice_id}&kind=PROFILE`,'23-notice-top.png',{interaction:'notice-person-selected-unsaved'}],
 ['06-publish-selected','notices_buyer','/notices/new','23-notice-top.png',{interaction:'notice-rule-selected-unsaved'}],
 ['07-new-selected','auditions_seller','/auditions/new','21-audition-top.png',{interaction:'audition-person-selected-unsaved'}],
];
const selected=(process.env.V5_APP_CASES||'').split(',').filter(Boolean),cases=selected.length?matrix.filter(v=>selected.includes(v[0])):matrix;
const width=Number(process.env.V5_APP_WIDTH||390);assert([320,390,768].includes(width));const height=width>=700?1024:844;
const shots=[],results=[],errors=[],network=[],resources=[],requestFailures=[];
const secrets=Object.values(f.accounts).map(v=>v.bearer_token),redact=v=>secrets.reduce((a,t)=>a.replaceAll(t,'[redacted]'),String(v));
const designBase='docs/testing/evidence/figma-remaining-calibration-20261023';
const designReviews=JSON.parse(await readFile(join(designBase,'REVIEWS.json'),'utf8')).reviews;
const designIds={
 '05-catalog':['22:900'],'05-video':['22:900'],'05-purchases':['2004:4349'],
 '05-purchase-paid':['2004:4719'],'05-purchase-unpaid':['2004:4349'],'05-purchase-unlisted':['2004:4349'],'05-purchase-dispute':['2004:4349'],
 '05-listings':['2004:1636'],'05-listing':['2004:1726'],'05-new':['2004:1726'],'05-new-selected':['2004:1726'],
 '06-catalog':['2:75'],'06-notice':['23:880'],'06-publish':['23:954'],'06-records':['2004:868'],'06-inbox':['2004:868'],
 '06-submission-pending':['2004:1073'],'06-submission-sent':['2004:1073'],'06-submission-interested':['2004:1073'],
 '06-case':['2004:1148'],'06-submit':['2004:995'],'06-qualification':['23:954'],
 '06-submit-selected':['2004:995'],'06-publish-selected':['23:954'],
 '07-catalog':['2:72'],'07-book':['23:661'],'07-offers':['2004:1800'],'07-offer':['2004:1800'],'07-new':['2004:1800'],'07-new-selected':['2004:1800'],
 '07-bookings':['23:734'],'07-booking-ready':['23:734'],'07-booking-awaiting':['23:734'],'07-booking-accepted':['23:734'],
 '07-booking-delivered':['2004:4861'],'07-booking-fulfilled':['23:734'],'07-decision':['23:734'],'07-travel':['23:734'],
 '07-delivery':['23:734'],'07-messages':['2004:814'],'07-commercial-conversation':['2004:814'],
 '08-summary':['2004:2383'],'08-points':['2004:2203'],'08-scout':['2004:2291'],'08-rules':['2004:2291'],
 '08-recharge':['2004:2461'],'08-records':['2004:2539'],'08-sync':['2004:2203'],'08-level-six':['2004:2291'],'08-unopened':['2004:2383'],
 '09-rankings':['23:1478'],'09-ranking':['23:1478'],'09-competition':['23:1478'],'09-growth':['2004:2122'],
 '09-referrals':['2004:2640'],'09-buyers':['22:961'],'09-reviews':['23:799'],'09-exposures':['23:1191'],
 '09-mcn':['2004:1871'],'09-mcn-staff':['2004:1871'],'09-staff-growth':['2004:2122'],'07-staff-booking':['23:734'],
 '05-trade-order':['2004:3003'],'07-trade-order':['2004:3003'],
 '10-ready-room':['2004:4086'],'10-room':['2004:4086'],'10-rooms':['2004:4086'],'10-ready-member':['2004:4163'],
 '10-member':['2004:4163'],'10-members':['2004:4163'],'10-invitations':['2004:4163'],'10-new':['2004:3737'],
 '10-personal-snippet':['2004:5689'],'10-snippets':['2004:5689'],'10-ready-benefit':['2004:5369'],'10-benefits':['2004:5369'],
 '11-catalog':['23:1191'],'11-grants':['23:1401'],'11-grant':['23:1332'],'11-checkout':['23:1332'],
 '11-pools':['2064:2976'],'11-pool':['2064:2976'],'11-pools-closed':['2064:2976'],'11-role':['23:1261'],'11-draws':['23:1401'],
 '12-participations':['2004:4163'],'12-participation':['2004:4163'],'12-performer':['2004:4163'],'12-amendment':['2004:4163'],
 '12-income':['2004:3398'],'12-income-new':['2004:3398'],
 '12-privacy':['2004:4535'],'12-privacy-request':['2004:4535'],'12-privacy-new':['2004:4535'],
 '12-preferences':['2004:4535'],'12-preferences-on':['2004:4535'],
};
const adaptedCases=new Set(['05-catalog','06-qualification','07-bookings','07-booking-ready','07-booking-awaiting','07-booking-accepted',
 '07-decision','07-travel','07-offers','07-offer','07-new','08-rules','08-sync','08-level-six','08-unopened',
 '09-rankings','09-ranking','09-referrals','09-exposures','09-mcn-staff','09-staff-growth','07-staff-booking',
 '10-rooms','10-new','10-invitations','10-members','10-ready-benefit','10-benefits','11-pools','11-pool','11-checkout',
 '12-participations','12-amendment','12-income','12-income-new','12-privacy','12-privacy-request','12-privacy-new',
 '05-new-selected','06-submit-selected','06-publish-selected','07-new-selected']);
function references(name){
 return (designIds[name]||[]).map(id=>{
  const r=designReviews.find(v=>v.id===id);assert(r?.finalScreenshot, name+' missing design evidence '+id);
  return {figma_id:id,name:r.currentName||r.name,file:join(designBase,r.finalScreenshot),sha256:r.finalSha256,
   relationship:adaptedCases.has(name)?'VISUAL_LANGUAGE_ADAPTATION_OR_DYNAMIC_STATE':'DESIGN_SCREEN_WITH_LIVE_DATA'};
 });
}
const safeUrl=value=>{const u=new URL(value);return u.origin+u.pathname;};
async function semanticState(page){
 return page.locator('flt-semantics-host').evaluate(host=>{
  const height=innerHeight,width=innerWidth;
  const visible=[...host.querySelectorAll('flt-semantics')].flatMap(el=>{
   const r=el.getBoundingClientRect(),role=el.getAttribute('role'),text=(el.getAttribute('aria-label')||el.innerText||'').trim();
   if(!text||r.width<=0||r.height<=0||r.bottom<=56||r.top>=height-30||r.right<=0||r.left>=width||text.length>600)return [];
   return [{role,text,y:Math.round(r.top),height:Math.round(r.height)}];
  });
  return {text:host.innerText,visible,signature:JSON.stringify(visible)};
 });
}
async function seek(page,locator){
 for(let n=0;n<40;n++){
  const box=await locator.count()?await locator.boundingBox():null;
  if(box&&box.y>=58&&box.y+box.height<height-60)return;
  await page.mouse.move(Math.max(8,(width-560)/2+8),Math.min(410,height/2));
  await page.mouse.wheel(0,box?.y<58?-Math.round(height*.5):Math.round(height*.5));
  await page.waitForTimeout(130);
 }
 throw Error('Control not reachable in viewport');
}
let sourceBundleSha256=null;
for(const [name,role,route,source,options={}]of cases){
 const context=await browser.newContext({locale:'zh-CN',viewport:{width,height},acceptDownloads:true}),page=await context.newPage();page.setDefaultTimeout(20000);
 const inflight=new Map(),localResources=[],localFailures=[],scrollTrace=[],caseShots=[];
 const responseTasks=[];
 let requestSequence=0;
 page.on('pageerror',e=>errors.push({name,error:redact(e.message)}));
 page.on('console',m=>{if(/RenderFlex.*overflow|overflowed by|EXCEPTION CAUGHT/.test(m.text()))errors.push({name,error:redact(m.text())});});
 page.on('request',r=>inflight.set(r,{number:++requestSequence,url:safeUrl(r.url()),type:r.resourceType(),started_at:Date.now()}));
 page.on('requestfinished',r=>inflight.delete(r));
 page.on('requestfailed',r=>{const v={name,url:safeUrl(r.url()),type:r.resourceType(),failure:redact(r.failure()?.errorText)};localFailures.push(v);requestFailures.push(v);inflight.delete(r);});
 page.on('response',r=>{
  const request=r.request(),u=new URL(r.url());
  const resource={name,url:safeUrl(r.url()),type:request.resourceType(),status:r.status(),external:u.origin!=='http://127.0.0.1:5500'&&u.origin!==new URL(f.base_url).origin};
  localResources.push(resource);resources.push(resource);
  if(r.url().startsWith(f.base_url))network.push({name,method:request.method(),path:u.pathname,status:r.status(),visual_state_stub:options.visual_state_stub||null});
  if(!sourceBundleSha256&&u.origin==='http://127.0.0.1:5500'&&u.pathname.endsWith('/main.dart.js')){
   responseTasks.push(r.body().then(bytes=>{sourceBundleSha256=createHash('sha256').update(bytes).digest('hex');}).catch(()=>{}));
  }
 });
 if(options.visual_state_stub==='empty-pools'){
  await page.route(f.base_url+'/redemption/pools',route=>route.request().method()==='GET' ? route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'http://127.0.0.1:5500'},body:JSON.stringify({data:{items:[],next_cursor:null}})}) : route.continue());
 }
 try {
  await page.goto(`http://127.0.0.1:5500/?fixtureRole=${role}#${route}`);
  await page.locator('flt-semantics-placeholder').waitFor({state:'attached'});
  await page.locator('flt-semantics-placeholder').evaluate(e=>e.click());
  await page.getByRole('heading').first().waitFor();
  await page.waitForLoadState('networkidle',{timeout:20000});
  await page.waitForTimeout(180);
  const initial=await semanticState(page);
  assert(initial.visible.length>0,name+' accessibility viewport has visible content');
  assert(!/本机合成联调服务暂不可用|页面暂时无法显示|找不到这个页面/.test(initial.text),name+' failed to render');
  let interaction=null;
  if(options.interaction==='preferences-on-unsaved'){
   const switches=page.getByRole('switch');
   assert.equal(await switches.count(),2,'Preferences has two real switches');
   const values=[];
   for(let n=0;n<2;n++){
    const control=switches.nth(n);await seek(page,control);
    if(await control.getAttribute('aria-checked')!=='true')await control.click();
    await page.waitForTimeout(100);
    values.push(await control.getAttribute('aria-checked'));
   }
   assert(values.every(v=>v==='true'),'Both preference switches are visibly on');
   interaction={kind:options.interaction,aria_checked:values,server_write:false,note:'UI interaction only; values intentionally not saved to the service.'};
   await page.mouse.move(Math.max(8,(width-560)/2+8),Math.min(410,height/2));await page.mouse.wheel(0,-30000);await page.waitForTimeout(150);
  }
  if(['stock-form-selected-unsaved','notice-person-selected-unsaved','notice-rule-selected-unsaved','audition-person-selected-unsaved'].includes(options.interaction)){
   const selectedControls=[];
   const choose=async(label,itemName=null,itemIndex=0)=>{
    const control=page.getByRole('button',{name:label,exact:true});await seek(page,control);await control.click();
    const items=page.getByRole('menuitem'),item=itemName?items.filter({hasText:itemName}).first():items.nth(itemIndex);
    await item.waitFor({state:'visible'});const value=await item.innerText();await item.click();
    await page.waitForTimeout(160);if(inflight.size)await page.waitForLoadState('networkidle',{timeout:20000});
    selectedControls.push({label,value});
   };
   if(options.interaction==='stock-form-selected-unsaved'){
    await choose('卖方具体真人');await choose('本作品可识别出镜人数',null,1);
   }else if(options.interaction==='notice-person-selected-unsaved'){
    await choose('选择本次具体真人');
   }else if(options.interaction==='notice-rule-selected-unsaved'){
    await choose('选择已生效发布规则');
    const type=page.getByRole('button',{name:'本次可发布类型',exact:true});
    await seek(page,type);
    if(await type.getAttribute('aria-disabled')!=='true')await choose('本次可发布类型');
   }else{
    await choose('选择具体真人');
   }
   const writes=network.filter(v=>v.name===name&&!['GET','OPTIONS'].includes(v.method));
   assert.equal(writes.length,0,'Form selection must not submit or save server data');
   interaction={kind:options.interaction,selected_controls:selectedControls,server_write:false,note:'Real existing options selected to expose the form; no fields fabricated and no submit, upload, save, or consent action performed.'};
   await page.mouse.move(Math.max(8,(width-560)/2+8),Math.min(410,height/2));await page.mouse.wheel(0,-30000);await page.waitForTimeout(150);
  }
  let last=await semanticState(page),stable=0,scrollDistance=0,bottomReason='MAX_SCROLL_LIMIT',allText=[last.text];
  const capture=async(position,state)=>{
   const file=name+'-'+width+'-'+position+'.png';await page.mouse.move(0,0);await page.screenshot({path:join(out,file)});
   const v={file,route,role,source,width,height,position,estimated_scroll:scrollDistance,visible:state.visible,
    design_references:references(name),visual_state_stub:options.visual_state_stub||null,
    sha256:createHash('sha256').update(await readFile(join(out,file))).digest('hex')};
   shots.push(v);caseShots.push(v);
  };
  await capture('top',last);
  for(let step=1;step<=50;step++){
   const delta=Math.round(height*.6);
   await page.mouse.move(Math.max(8,(width-560)/2+8),Math.min(410,height/2));await page.mouse.wheel(0,delta);await page.waitForTimeout(160);
   if(inflight.size)await page.waitForLoadState('networkidle',{timeout:10000});
   const state=await semanticState(page);allText.push(state.text);
   const changed=state.signature!==last.signature;
   scrollTrace.push({step,requested_delta:delta,changed,visible_count:state.visible.length});
   if(!changed){stable++;if(stable>=2){bottomReason='TWO_STABLE_ACCESSIBILITY_VIEWPORTS';break;}}
   else{stable=0;scrollDistance+=delta;await capture('scroll-'+String(caseShots.length).padStart(2,'0'),state);last=state;}
  }
  caseShots.at(-1).final_viewport=true;
  assert(bottomReason!=='MAX_SCROLL_LIMIT',name+' long page capture stopped before a confirmed bottom');
  const text=[...new Set(allText)].join('\n--- SCROLL ---\n');
  if(options.interaction==='stock-form-selected-unsaved')assert(text.includes('提交内容与权利双审核'),'The expanded stock form was captured through its final action');
  if(options.interaction==='audition-person-selected-unsaved')assert(text.includes('提交本版试镜方案独立审核'),'The expanded audition form was captured through its final action');
  if(options.interaction==='notice-rule-selected-unsaved')assert(text.includes('提交正式通告审核'),'The expanded notice publishing form was captured through its final action');
  if(options.interaction==='notice-person-selected-unsaved')assert(text.includes('提交本次单向投稿审核'),'The expanded notice submission form was captured through its final action');
  for(const secret of secrets)assert(!text.includes(secret),'No session token in page text');
  const authFailures=network.filter(v=>v.name===name&&v.status===401);
  assert.equal(authFailures.length,0,name+' fixture authentication expired or was rejected');
  results.push({name,role,route,status:'RENDERED',evidence_kind:options.visual_state_stub?'VISUAL_STATE_STUB':'REAL_LOCAL_API_SYNTHETIC_DATA',
   text:text.slice(0,35000),design_references:references(name),interaction,scrollTrace,bottom_reason:bottomReason,screenshot_count:caseShots.length,
   external_resources:localResources.filter(v=>v.external),failed_requests:localFailures});
  console.log(name+' RENDERED '+caseShots.length+' viewports');
 } catch(e){
  const failure=redact(e.message),pending=[...inflight.values()].map(v=>({...v,elapsed_ms:Date.now()-v.started_at}));
  results.push({name,role,route,status:'FAIL',failure,pending_requests:pending,external_resources:localResources.filter(v=>v.external),failed_requests:localFailures});
  console.error(name+': '+failure+' pending='+JSON.stringify(pending));process.exitCode=1;
 }
 await Promise.allSettled(responseTasks);await context.close();
}
await browser.close();
const report={result:results.some(v=>v.status==='FAIL')||errors.length?'FAIL':'CAPTURED_PENDING_REVIEW',synthetic_only:true,
 source:'Calibrated Figma finalScreenshot evidence; dynamic states and extra business views are explicitly marked as adaptations.',
 source_bundle_sha256:sourceBundleSha256,fixture_base_url:f.base_url,matrix_count:results.length,screenshot_count:shots.length,
 limits:['Screenshots prove rendering only until separately reviewed.','All accounts and business records are local synthetic fixtures.',
  'UI state stubs do not prove a backend response or service readiness.','Preference-on interaction is unsaved and does not prove a persisted preference.','No colleague human review has occurred.'],
 results,screenshots:shots,network,resources,requestFailures,errors};
const output=JSON.stringify(report,null,2);for(const secret of secrets)assert(!output.includes(secret));
const reportName=process.env.V5_APP_REPORT_NAME||(selected.length?`APP_PARTIAL_${width}_RESULTS.json`:`APP_${width}_RESULTS.json`);assert(/^[A-Z0-9_-]+\.json$/.test(reportName));await writeFile(join(out,reportName),output+'\n');
console.log(JSON.stringify({result:report.result,matrix:results.length,shots:shots.length,errors:errors.length,failed:results.filter(v=>v.status==='FAIL').length}));
