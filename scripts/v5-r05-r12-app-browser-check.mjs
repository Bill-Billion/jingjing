#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const f=JSON.parse(await readFile(process.env.V5_ACCESS_FILE,'utf8'));
assert(f.synthetic_only&&new URL(f.base_url).hostname==='127.0.0.1');
const out=resolve('output/playwright/v5-r05-r12/app');await mkdir(out,{recursive:true});
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
];
const selected=(process.env.V5_APP_CASES||'').split(',').filter(Boolean),cases=selected.length?matrix.filter(v=>selected.includes(v[0])):matrix;
const width=Number(process.env.V5_APP_WIDTH||390);assert([320,390,768].includes(width));const height=width>=700?1024:844;
const shots=[],results=[],errors=[],network=[];
const secrets=Object.values(f.accounts).map(v=>v.bearer_token),redact=v=>secrets.reduce((a,t)=>a.replaceAll(t,'[redacted]'),String(v));
let failure;
for(const [name,role,route,source]of cases){
 const context=await browser.newContext({locale:'zh-CN',viewport:{width,height},acceptDownloads:true}),page=await context.newPage();page.setDefaultTimeout(20000);
 page.on('pageerror',e=>errors.push({name,error:redact(e.message)}));
 page.on('console',m=>{if(/RenderFlex.*overflow|overflowed by|EXCEPTION CAUGHT/.test(m.text()))errors.push({name,error:redact(m.text())});});
 page.on('response',r=>{if(r.url().startsWith(f.base_url))network.push({name,method:r.request().method(),path:new URL(r.url()).pathname,status:r.status()});});
 try {
  await page.goto(`http://127.0.0.1:5500/?fixtureRole=${role}#${route}`);
  await page.locator('flt-semantics-placeholder').waitFor({state:'attached'});
  await page.locator('flt-semantics-placeholder').evaluate(e=>e.click());
  await page.getByRole('heading').first().waitFor();await page.waitForLoadState('networkidle');await page.waitForTimeout(180);
  const text=await page.locator('flt-semantics-host').innerText();
  assert(!/本机合成联调服务暂不可用|页面暂时无法显示|找不到这个页面/.test(text),name+' failed to render');
  for(const [position,scroll]of [['top',0],['content',500]]){
   if(scroll){await page.mouse.move(180,410);await page.mouse.wheel(0,scroll);await page.waitForTimeout(130);}
   const file=name+'-'+width+'-'+position+'.png';await page.screenshot({path:join(out,file)});shots.push({file,route,role,source,width,height,position,sha256:createHash('sha256').update(await readFile(join(out,file))).digest('hex')});
  }
  results.push({name,role,route,status:'RENDERED',text:text.slice(0,14000)});console.log(name+' RENDERED');
 } catch(e){failure=redact(e.message);results.push({name,role,route,status:'FAIL',failure});console.error(name+': '+failure);process.exitCode=1;}
 await context.close();
}
await browser.close();
const report={result:results.some(v=>v.status==='FAIL')||errors.length?'FAIL':'CAPTURED_PENDING_REVIEW',synthetic_only:true,source:'先锋电影刊物存档原图；无专门PC稿部分另标适配',matrix_count:results.length,screenshot_count:shots.length,results,screenshots:shots,network,errors};
const output=JSON.stringify(report,null,2);for(const secret of secrets)assert(!output.includes(secret));
const reportName=process.env.V5_APP_REPORT_NAME||(selected.length?`APP_PARTIAL_${width}_RESULTS.json`:`APP_${width}_RESULTS.json`);assert(/^[A-Z0-9_-]+\.json$/.test(reportName));await writeFile(join(out,reportName),output+'\n');
console.log(JSON.stringify({result:report.result,matrix:results.length,shots:shots.length,errors:errors.length}));
