#!/usr/bin/env node
// Read-only captures of the existing PC workbench; no PC Figma frames are supplied.
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {join,resolve} from 'node:path'
import {ensureWorkspaceNavigation,checkWorkspaceNavigation} from './workspace-navigation-check.mjs'

const root=process.cwd(),access=process.env.V5_FRONTEND_ACCESS_FILE
assert(access,'V5_FRONTEND_ACCESS_FILE required')
const fixture=JSON.parse(await readFile(access,'utf8')),base=new URL(fixture.base_url)
assert(fixture.synthetic_only&&base.hostname==='127.0.0.1'&&base.protocol==='http:'&&base.pathname==='/api/v1')
const web='http://127.0.0.1:5173',out=resolve(process.env.FIGMA_WEB_OUTPUT||'output/playwright/figma-frontend-web-supplement')
await mkdir(out,{recursive:true})
const secrets=Object.values(fixture.accounts).map(a=>a.bearer_token)
const redact=value=>secrets.reduce((s,t)=>s.replaceAll(t,'[redacted]'),String(value))
const {chromium}=createRequire(join(root,'晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))('playwright-core')
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
const rows=[],errors=[],writes=[],limits=[]
const cases=[
 ['workspace','buyer','/workspace'],['contracts','buyer','/contracts'],
 ['supply-profiles','producer','/supply/profiles'],['supply-works','producer','/supply/works'],
 ['licensing-catalog','producer','/licensing/catalog'],['licensing-products','producer','/licensing/products'],['licensing-readings','buyer','/licensing/readings'],
 ['gigs-catalogue','buyer','/gigs/catalogue'],['gigs-relations','mcn_owner','/gigs/relations'],['gigs-rankings','reviewer','/gigs/rankings'],
 ['operations-notifications','buyer','/operations/notifications'],['operations-reports','buyer','/operations/reports'],['operations-audit','reviewer','/operations/audit'],
 ['trade-legacy','buyer','/trade/legacy'],['trade-legacy-review','reviewer','/trade/reviews/legacy'],
 ['login',null,'/login'],['not-found',null,'/visual-review-page-does-not-exist'],
]
let failure=null
try{
 for(const [key,role,path] of cases){
  const context=await browser.newContext({locale:'zh-CN'})
  try{
   if(role){const account=fixture.accounts[role];assert(account,role);await context.addInitScript(({token,party})=>{sessionStorage.setItem('ops.session.token',token);sessionStorage.setItem('ops.session.selected',party)},{token:account.bearer_token,party:account.party_id})}
   const page=await context.newPage();page.setDefaultTimeout(15000)
   page.on('pageerror',e=>errors.push({key,message:redact(e.message)}))
   await page.route('**/api/v1/**',route=>{const r=route.request();if(!['GET','OPTIONS','HEAD'].includes(r.method())){writes.push({key,method:r.method(),path:new URL(r.url()).pathname});return route.abort('blockedbyclient')}return route.continue()})
   for(const width of [1440,390]){
    await page.setViewportSize({width,height:width===390?844:1000})
    await page.goto(web+path);await page.locator('h1').waitFor();await page.waitForLoadState('networkidle')
    await page.evaluate(async()=>{await document.fonts.load('700 30px EditorialSerif');const bodyFaces=await document.fonts.load('400 14px NotoSansSC');await document.fonts.ready;if(!bodyFaces.length||bodyFaces.some(f=>f.status!=='loaded')||!document.fonts.check('400 14px NotoSansSC'))throw new Error('NotoSansSC body font not loaded')})
    assert.equal(new URL(page.url()).pathname,path,key+' retained route')
    const paint=await page.evaluate(()=>{const root=document.querySelector('.editorial-workspace')||document.body,h=document.querySelector('h1');return{width:innerWidth,scroll:document.documentElement.scrollWidth,paper:getComputedStyle(root).getPropertyValue('--ops-bg').trim().toUpperCase(),ink:getComputedStyle(root).getPropertyValue('--ops-ink').trim().toUpperCase(),accent:getComputedStyle(root).getPropertyValue('--editorial-accent').trim().toUpperCase(),titleFont:getComputedStyle(h).fontFamily,titleWeight:getComputedStyle(h).fontWeight,bodyFont:getComputedStyle(document.body).fontFamily,bodyFontLoaded:document.fonts.check('400 14px NotoSansSC'),contentGap:document.querySelector('.supply-sidebar')?Math.round(document.querySelector('.supply-main').getBoundingClientRect().top-document.querySelector('.supply-sidebar').getBoundingClientRect().bottom):null}})
    assert(paint.scroll<=width,key+' viewport overflow '+paint.scroll)
    if(role&&width===390)assert(paint.contentGap<=1,key+' no stretched blank row before main content')
    assert.equal(paint.paper,'#F3F1E8');assert.equal(paint.ink,'#151515');assert.equal(paint.accent,'#EF4938')
    assert(paint.titleFont.includes('EditorialSerif'),key+' serif heading');assert(paint.bodyFont.includes('NotoSansSC')&&paint.bodyFontLoaded,key+' NotoSansSC body font loaded')
    const text=await page.locator('body').innerText();for(const token of secrets)assert(!text.includes(token),key+' no visible token')
    const alerts=(await page.locator('[role="alert"]').allTextContents()).map(redact)
    if(alerts.length)limits.push({key,width,role,path,kind:'FIXTURE_SCOPE_OR_API_LIMIT',alerts})
    let count=null,current=null
    if(role){assert.equal(await page.locator('.editorial-workspace').count(),1);count=await page.locator('.workspace-nav a').count();current=await page.locator('.supply-sidebar [aria-current="page"]').count();assert.equal(count,70);assert.equal(await page.locator('.workspace-nav-parent').count(),7);assert.equal(current,1)}
    const file=`${key}-${width}.png`;await page.screenshot({path:join(out,file),style:'#__vue-devtools-container__{display:none!important}'})
    const row={key,role,path,width,result:'RENDERED_PENDING_VISUAL_REVIEW',file,paint,base_menu_entries:count,active_menu_entries:current,alerts}
    if(role&&width===390){const navigation=await ensureWorkspaceNavigation(page);assert.equal(await navigation.locator('.workspace-nav-parent[aria-expanded="true"]').count(),7);assert(await navigation.isVisible());row.menu_file=`${key}-${width}-menu.png`;await page.screenshot({path:join(out,row.menu_file),style:'#__vue-devtools-container__{display:none!important}'});if(key==='workspace'){const end=navigation.locator('a').last();await end.scrollIntoViewIfNeeded();assert(await end.isVisible(),'last navigation entry remains reachable');row.menu_end_file=`${key}-${width}-menu-end.png`;await page.screenshot({path:join(out,row.menu_end_file),style:'#__vue-devtools-container__{display:none!important}'})}await checkWorkspaceNavigation(page);assert.equal(await navigation.locator('.workspace-nav-parent[aria-expanded="false"]').count(),7);assert(await navigation.isVisible());assert.equal(await navigation.locator('.workspace-nav-children:visible').count(),0)}
    rows.push(row);console.log('CAPTURE '+key+' '+width+(alerts.length?' LIMIT_DISPLAYED':''))
   }
  }finally{await context.close()}
 }
 assert.equal(writes.length,0,'read-only capture attempted no business writes');assert.equal(errors.length,0,'no uncaught browser JS errors')
}catch(e){failure=redact(e.stack||e);process.exitCode=1;console.error(failure)}finally{
 await browser.close()
 const sourceHashes={};for(const file of ['styles/tokens.css','styles/editorial.css','views/LoginView.vue','views/NotFoundView.vue','views/WorkspaceView.vue','views/ContractsView.vue','views/SupplyView.vue','views/LicensingView.vue','views/GigsView.vue','views/OperationsView.vue','views/TradeView.vue'])sourceHashes[file]=createHash('sha256').update(await readFile(join(root,'晶晶日上工程交接包/01_源码/frontend_ops_workspace/src',file))).digest('hex')
 sourceHashes['../frontend_jingjingshangri_app/assets/fonts/NotoSansSC.ttf']=createHash('sha256').update(await readFile(join(root,'晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/assets/fonts/NotoSansSC.ttf'))).digest('hex')
 const report={result:failure?'FAIL':'RENDERED_PENDING_VISUAL_REVIEW',synthetic_only:true,read_only:true,pc_figma_frames_available:false,api_base:fixture.base_url,source_hashes:sourceHashes,rows,limits,errors,writes,failure}
 const json=JSON.stringify(report,null,2)+'\n';for(const token of secrets)assert(!json.includes(token));await writeFile(join(out,'RESULTS.json'),json)
 console.log(JSON.stringify({result:report.result,captures:rows.length,limits:limits.length,errors:errors.length,writes:writes.length}))
}
