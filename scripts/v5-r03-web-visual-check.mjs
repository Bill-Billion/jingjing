#!/usr/bin/env node
// Read-only visual acceptance against an explicitly synthetic loopback fixture.
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir,readdir,unlink} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {resolve,join} from 'node:path'
import {ensureWorkspaceNavigation,checkWorkspaceNavigation} from './workspace-navigation-check.mjs'

const root=process.cwd(),accessPath=process.env.ARTISTS_ACCESS_FILE
assert(accessPath,'ARTISTS_ACCESS_FILE must identify the existing synthetic fixture')
const fixture=JSON.parse(await readFile(accessPath,'utf8'))
assert(fixture.synthetic_only&&new URL(fixture.base_url).hostname==='127.0.0.1')
const web=process.env.ARTISTS_WEB_URL||'http://127.0.0.1:5173'
assert.equal(web,'http://127.0.0.1:5173')
const out=resolve(process.env.ARTISTS_VISUAL_DIR||'output/playwright/v5-r03/web-pages')
await mkdir(out,{recursive:true})
const previousFiles=await readdir(out)
const prior=JSON.parse(await readFile(resolve('output/playwright/v5-r03/ARTISTS_WEB_RESULTS.json'),'utf8'))
assert.equal(prior.result,'PASS','Run the functional acceptance before the read-only visual matrix')
const consentId=prior.consent_id||fixture.consent_id
const person='/artists/people/'+fixture.person_id,record=id=>person+'/records/'+id
const original41=['/workspace','/contracts','/supply/profiles','/supply/works','/licensing/catalog','/licensing/products','/licensing/reservations','/licensing/projects','/licensing/readings','/trade/specifications','/trade/quotes','/gigs/catalogue','/gigs/relations','/gigs/commissions','/gigs/rankings','/trade/payments','/production/projects','/projects/projects','/projects/plans','/projects/releases','/projects/channels','/finance/agreements','/finance/payouts','/finance/income','/finance/disputes','/operations/notifications','/operations/reports','/operations/customization','/operations/moderation','/operations/audit','/finance/reviews/agreements','/gigs/reviews/requests','/gigs/reviews/rules','/supply/reviews/profile','/supply/reviews/rights','/licensing/reviews/products','/trade/reviews/specifications','/trade/reviews/quotes','/trade/reviews/refunds','/production/reviews/projects','/projects/reviews/plans']
const cases=[
 {key:'27-owner-people',label:'本人真人档案名单',role:'artist',path:'/artists/people',ready:'artists-person-'+fixture.person_id,ref:'27-avatar-top.png',frames:['34 我的艺人'],small:true},
 {key:'27-owner-person',label:'本人及名下数字人',role:'artist',path:person,ready:'artists-person-summary',ref:'27-avatar-top.png',frames:['34 我的艺人','36 数字人详情'],small:true,focus:{testid:'artists-avatar-'+fixture.avatar_id,label:'数字人及记录内容'}},
 {key:'28-agency-person',label:'获托机构的本人档案与允许代办范围',role:'agency',path:person,ready:'artists-person-summary',ref:'28-avatar-extra.png',frames:['42 我的MCN合作'],focus:{testid:'artists-record-kind',label:'按委托可读的事项'}},
 {key:'27-consent-form',label:'本人逐项用途同意表单（未提交）',role:'artist',path:person+'/consents/new',ready:'artists-form-CONSENT',ref:'27-avatar-top.png',frames:['35 艺人资料编辑','37 创建数字人：本人明确同意'],small:true,focus:{selector:'.artist-choices',label:'形象、声音、各用途及未勾选确认'}},
 {key:'28-delegation',label:'本人已接受机构委托的实际记录',role:'artist',path:record(fixture.delegation_id),ready:'artists-record',ref:'28-avatar-extra.png',frames:['42 我的MCN合作'],focus:{selector:'.artist-record .supply-card:nth-of-type(2)',label:'机构代办范围及所有权'}},
 {key:'27-variant',label:'已保存造型版本及原同意依据',role:'artist',path:record(fixture.look_id),ready:'artists-record',ref:'27-avatar-top.png',frames:['36 数字人详情'],focus:{selector:'.artist-record .supply-card:nth-of-type(2)',label:'造型版本、来源与原同意'}},
 {key:'30-halo-form',label:'免费L1认证申请表单（未提交）',role:'artist',path:person+'/halos/new',ready:'artists-form-HALO',ref:'30-cert-growth.png',frames:['43 主角光环申请'],prepare:async p=>p.getByTestId('artists-field-level').selectOption('1'),focus:{testid:'artists-form-HALO',label:'本人权属材料及明确确认'}},
 {key:'27-creation-service-form',label:'已审数字人创建服务选择（未提交）',role:'artist',path:person+'/services/new',ready:'artists-form-SERVICE',ref:'27-avatar-top.png',frames:['37 创建数字人'],prepare:async p=>{await p.getByTestId('artists-field-spec_id').selectOption(fixture.specs.AVATAR_CREATION);await p.getByTestId('artists-field-avatar_id').selectOption(fixture.avatar_id)},focus:{testid:'artists-form-SERVICE',label:'已审服务金额、原规格及未勾选确认'}},
 {key:'28-hosting-order',label:'实际托管权益、期限与关联原订单',role:'artist',path:record(fixture.hosting_id),ready:'artists-original-order',ref:'28-avatar-extra.png',frames:['38 数字人托管管理'],focus:{testid:'artists-original-order',label:'原订单实收及实际托管日期'}},
 {key:'27-identity-disabled',label:'实名服务尚未启用，表单不可提交',role:'artist',path:person+'/identity/new',ready:'artists-form-IDENTITY',ref:'27-avatar-top.png',frames:['35 艺人资料编辑：本人资料边界'],verify:async p=>assert(await p.getByTestId('artists-form-submit').isDisabled()),focus:{testid:'artists-form-IDENTITY',label:'实名会话与服务未启用状态'}},
 {key:'30-independent-review',label:'独立岗位读取已审申请及补件历史',role:'reviewer',path:'/artists/reviews/CONSENT/people/'+fixture.person_id+'/records/'+consentId,ready:'artists-record',ref:'30-cert-growth.png',frames:['44 认证申请详情：补件与继续审核的交互语言'],focus:{testid:'artists-record',label:'独立读取原记录；不提交任何审核'}},
 {key:'31-public-catalog-empty',label:'公开同意已撤回后的真实目录空状态',role:'outsider',path:'/artists/catalog',ready:'artists-catalog-empty',ref:'31-cert-extra.png',frames:['41 公开试镜与报价设置：本人选择公开范围'],note:'目录检索布局为网页适配；本参考提供公开范围边界，不宣称原稿已有PC目录页。',focus:{testid:'artists-catalog-empty',label:'撤回后真实目录空状态'},verify:async p=>{assert.equal(await p.locator('[data-testid^="artists-catalog-preview-"]').count(),0);assert.deepEqual(await p.getByTestId('artists-filter-audition').locator('option').evaluateAll(ns=>ns.map(n=>n.value)),['','true'])}},
]
const recaptureKeys=(process.env.ARTISTS_VISUAL_RECAPTURE||'').split(',').filter(Boolean)
for(const key of recaptureKeys)assert(cases.some(c=>c.key===key),'Unknown recapture page: '+key)
const baseline=recaptureKeys.length?JSON.parse(await readFile(join(out,'WEB_VISUAL_MATRIX.json'),'utf8')):null
if(baseline){assert.equal(baseline.result,'PASS');assert.equal(baseline.business_write_count,0);assert.equal(baseline.matrix_count,27);assert(baseline.matrix.every(m=>m.navigation_count===70&&m.navigation_groups===7),'Shared navigation changed: rerun without ARTISTS_VISUAL_RECAPTURE before reusing visual evidence')}
const {chromium}=createRequire(join(root,'晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))('playwright-core')
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
const contexts=[],pages=new Map(),screenshots=[],matrix=[],writes=[],requests=[],pageErrors=[],consoleErrors=[],failedRequests=[],fontResponses=[]
if(baseline){matrix.push(...baseline.matrix.filter(m=>!recaptureKeys.includes(m.key)).map(m=>({...m,reused_unaffected_page:true})));screenshots.push(...baseline.screenshots.filter(s=>!recaptureKeys.includes(s.page)));fontResponses.push(...baseline.font_responses)}
let failure=null,currentCase=null
const secrets=Object.values(fixture.accounts).map(a=>a.bearer_token).filter(Boolean)
const redact=value=>secrets.reduce((text,secret)=>text.replaceAll(secret,'[redacted]'),String(value))
async function actorPage(role){
 if(pages.has(role))return pages.get(role)
 const account=fixture.accounts[role],context=await browser.newContext({locale:'zh-CN',viewport:{width:1440,height:1000}});contexts.push(context)
 await context.addInitScript(({token,party})=>{sessionStorage.setItem('ops.session.token',token);sessionStorage.setItem('ops.session.selected',party)},{token:account.bearer_token,party:role==='agency'?fixture.agency_party_id:account.party_id})
 await context.route('**/api/v1/**',async route=>{const r=route.request(),url=new URL(r.url());if(!['GET','OPTIONS'].includes(r.method())){writes.push({role,method:r.method(),path:url.pathname});await route.abort('blockedbyclient')}else await route.continue()})
 const page=await context.newPage();page.setDefaultTimeout(15000)
 page.on('pageerror',e=>pageErrors.push({role,message:redact(e.message)}))
 page.on('console',m=>{if(m.type()==='error')consoleErrors.push({role,message:redact(m.text())})})
 page.on('requestfailed',r=>failedRequests.push({role,path:new URL(r.url()).pathname,error:r.failure()?.errorText||null}))
 page.on('request',r=>{const url=new URL(r.url());if(url.pathname.startsWith('/api/v1/'))requests.push({role,method:r.method(),path:url.pathname})})
 page.on('response',r=>{if(r.url().includes('EditorialSerif-Bold.ttf'))fontResponses.push({role,status:r.status(),file:'EditorialSerif-Bold.ttf'})})
 pages.set(role,page);return page
}
async function inspect(page,c,width){
 assert.equal(new URL(page.url()).pathname,c.path)
 assert.equal(await page.getByTestId('artists-workspace').count(),1)
 assert.equal(await page.locator('.workspace-nav a').count(),70);assert.equal(await page.locator('.workspace-nav-parent').count(),7)
 const links=await page.locator('.workspace-nav a').evaluateAll(as=>as.map(a=>({href:a.getAttribute('href'),label:a.textContent.trim(),current:a.getAttribute('aria-current')==='page'})))
 assert.equal(new Set(links.map(l=>l.href)).size,70);for(const href of original41)assert(links.some(l=>l.href===href),'Original entrance missing: '+href)
 assert.deepEqual(links.filter(l=>l.current).map(l=>l.href),[c.role==='reviewer'?'/artists/reviews/CONSENT':'/artists/people'])
 const text=await page.locator('body').ariaSnapshot(),values=await page.locator('input,textarea').evaluateAll(ns=>ns.map(n=>n.value).join('\n'))
 for(const secret of secrets){assert(!text.includes(secret),'Credential must not appear in accessible UI');assert(!values.includes(secret),'Credential must not appear in form controls')}
 const style=await page.evaluate(()=>{const r=document.querySelector('.artists-workspace'),h=document.querySelector('h1'),button=document.querySelector('button.primary'),s=getComputedStyle(r),hs=getComputedStyle(h),fonts=[...document.fonts].filter(f=>f.family.replaceAll('"','').replaceAll("'",'')==='EditorialSerif');return {viewport:innerWidth,scroll:document.documentElement.scrollWidth,paper:s.backgroundColor,ink:hs.color,font:hs.fontFamily,fontWeight:hs.fontWeight,fontLoaded:fonts.some(f=>f.status==='loaded'),requiredLabelsInline:[...document.querySelectorAll('.artist-fields label .required')].every(star=>star.parentElement.tagName==='SPAN'&&star.parentElement.parentElement.tagName==='LABEL'),primary:button?{background:getComputedStyle(button).backgroundColor,color:getComputedStyle(button).color,radius:getComputedStyle(button).borderRadius}:null}})
 assert(style.scroll<=width,`${c.key}: overflow ${style.scroll}/${width}`);assert.equal(style.paper,'rgb(243, 240, 231)');assert.equal(style.ink,'rgb(23, 23, 23)');assert(style.font.includes('EditorialSerif'));assert.equal(style.fontWeight,'700');assert(style.fontLoaded,'Shared editorial serif font must load')
 if(style.primary){assert.equal(style.primary.background,'rgb(23, 23, 23)');assert.equal(style.primary.color,'rgb(243, 240, 231)');assert.equal(style.primary.radius,'0px')}
 assert(style.requiredLabelsInline,'Required marker stays with the field label')
 assert.equal(writes.length,0,'Visual acceptance cannot send business writes')
 return {style,original_41_preserved:true,navigation_count:70,navigation_groups:7,navigation_active:links.filter(l=>l.current)[0].href,credentials_visible:false,...matrix.length===0?{navigation:links}:{}}
}
async function shot(page,c,width,suffix='overview'){
 const name=`${c.key}-${width}-${suffix}.png`;await page.mouse.move(0,0);await page.screenshot({path:join(out,name),fullPage:false})
 const size=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth,scrollY}));assert(size.scroll<=width,`${name}: horizontal overflow`)
 screenshots.push({file:name,page:c.key,viewport:{width,height:width<600?844:1000},section:suffix,scroll_y:size.scrollY,reference_file:c.ref,app_frames:c.frames,web_adaptation:true});return name
}
try{
 for(const c of cases.filter(c=>!recaptureKeys.length||recaptureKeys.includes(c.key))){currentCase=c.key;const page=await actorPage(c.role)
  for(const width of [1440,390,...c.small?[375]:[]]){
   await page.setViewportSize({width,height:width<600?844:1000});await page.goto(web+c.path);await page.getByTestId(c.ready).waitFor();await page.waitForLoadState('networkidle');await page.evaluate(async()=>{await document.fonts.load('700 30px EditorialSerif');await document.fonts.ready})
   if(c.prepare)await c.prepare(page);if(c.verify)await c.verify(page)
   let categoriesChecked=false;if(width<600){await ensureWorkspaceNavigation(page);assert(await page.locator('.workspace-nav a').first().isVisible());await checkWorkspaceNavigation(page);assert(await page.locator('.workspace-nav').isVisible());assert.equal(await page.locator('.workspace-nav-children:visible').count(),0);categoriesChecked=true}
   await page.evaluate(()=>window.scrollTo(0,0));const details=await inspect(page,c,width),files=[]
   const focus=async()=>{const target=c.focus.testid?page.getByTestId(c.focus.testid):page.locator(c.focus.selector).first();await target.evaluate(el=>el.scrollIntoView({block:'start'}))}
   // Record pages use one useful content viewport. Only the three long forms
   // need a second viewport; the 375 sample uses a single focused image.
   const extraForm=c.key.endsWith('form')&&width!==375
   if(c.focus&&!extraForm){await focus();files.push(await shot(page,c,width,'content'))}
   else{files.push(await shot(page,c,width));if(c.focus){await focus();files.push(await shot(page,c,width,'content'))}}
   matrix.push({key:c.key,label:c.label,role:c.role,path:c.path,viewport:width,result:'PASS',reference_file:c.ref,app_frames:c.frames,web_adaptation:true,reference_note:c.note||'采用App刊物风格与业务映射；没有PC原稿逐像素对应声明。',mobile_categories_expanded_and_collapsed:categoriesChecked,files,captured_at:new Date().toISOString(),...details})
   console.log(`PASS ${c.key} ${width}`)
  }
 }
 assert.equal(pageErrors.length,0,'No JavaScript runtime exceptions');assert.equal(consoleErrors.length,0,'No browser console errors');assert.equal(failedRequests.length,0,'No failed resource/API requests');assert(fontResponses.length>0&&fontResponses.every(f=>f.status===200),'Shared font requests succeed');assert.equal(writes.length,0)
}catch(e){failure=redact(e.stack||e.message);process.exitCode=1;console.error(failure)}finally{
 matrix.sort((a,b)=>cases.findIndex(c=>c.key===a.key)-cases.findIndex(c=>c.key===b.key)||[1440,390,375].indexOf(a.viewport)-[1440,390,375].indexOf(b.viewport))
 const result={result:failure?'FAIL':'PASS',synthetic_only:true,read_only:true,web_adaptation:true,prototype:'晶晶日上 V4｜先锋电影刊物 · APP全页面',prototype_evidence_date:'2026-10-15',source_notes:'Use saved App references 27/28/30/31. PC workbench is a matching visual-language adaptation. The fixture public consent was already withdrawn by functional acceptance; catalog empty is expected. Screenshots are from the local Vite development service; the small development-tools toggle is preserved and is not a product element. No business mutation is sent by this script.',targeted_recapture:baseline?{reason:'Required field marker moved inline without changing form data or business behavior; recapture all four rendered form types and improve the catalog empty-state viewport.',pages:recaptureKeys,reused_unaffected_matrix_count:matrix.filter(m=>m.reused_unaffected_page).length}:null,business_post_count:writes.filter(w=>w.method==='POST').length,business_write_count:writes.length,writes,page_count:cases.length,matrix_count:matrix.length,screenshot_count:screenshots.length,viewports:[1440,390,375],matrix,screenshots,font_responses:fontResponses,page_errors:pageErrors,console_errors:consoleErrors,failed_requests:failedRequests,api_request_count:(baseline?.api_request_count||0)+requests.length,current_case:failure?currentCase:null,failure}
 if(!failure){const kept=new Set(screenshots.map(s=>s.file));for(const name of previousFiles)if(/^\d{2}-[a-z0-9-]+-(1440|390|375)-(overview|content)\.png$/.test(name)&&!kept.has(name))await unlink(join(out,name))}
 await writeFile(join(out,'WEB_VISUAL_MATRIX.json'),JSON.stringify(result,null,2)+'\n');for(const c of contexts)await c.close();await browser.close();console.log(JSON.stringify({result:result.result,pages:result.page_count,matrix:result.matrix_count,screenshots:result.screenshot_count,business_posts:result.business_post_count,page_errors:result.page_errors.length,console_errors:result.console_errors.length}))
}
