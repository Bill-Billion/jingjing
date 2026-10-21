#!/usr/bin/env node
// Hold an already-loaded App catalog while the existing synthetic web flow
// withdraws consent; verify that a rejected preview also removes cached details.
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {createRequire} from 'node:module'
import {spawn} from 'node:child_process'
const root=process.cwd(),f=JSON.parse(await readFile(process.env.ARTISTS_ACCESS_FILE,'utf8'))
assert.equal(f.synthetic_only,true);assert.equal(new URL(f.base_url).hostname,'127.0.0.1')
const out=resolve(process.env.ARTISTS_EVIDENCE_DIR||'output/playwright/v5-r03');await mkdir(out,{recursive:true})
const {chromium}=createRequire(join(root,'晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))('playwright-core')
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true})
const page=await browser.newPage({viewport:{width:390,height:844},locale:'zh-CN'}),checks=[],errors=[]
page.on('pageerror',e=>errors.push(e.message));let failure,denial
async function press(target){for(let n=0;n<55;n++){const b=await target.count()?await target.first().boundingBox():null;if(b&&b.y+b.height/2>56&&b.y+b.height/2<838){await page.mouse.click(b.x+b.width/2,b.y+b.height/2);return}await page.mouse.move(190,420);await page.mouse.wheel(0,b?.y<56?-230:230);await page.waitForTimeout(100)}throw Error('CONTROL_NOT_VISIBLE')}
try{
 const response=page.waitForResponse(r=>r.url().includes('/artists/catalog?')&&r.request().method()==='GET')
 await page.goto('http://127.0.0.1:5500/#/artists/catalog');await page.locator('flt-semantics-placeholder').waitFor({state:'attached'});await page.locator('flt-semantics-placeholder').evaluate(e=>e.click())
 const list=(await (await response).json()).data.items;assert.equal(list.length,1);const item=list[0]
 const button=page.getByRole('button',{name:'读取这份获准预览',exact:true})
 await button.waitFor();await page.screenshot({path:join(out,'app-catalog-before-withdrawal.png')});checks.push('App loaded the currently approved catalog before consent withdrawal')
 const child=spawn(process.execPath,['scripts/v5-r03-artists-browser-check.mjs'],{cwd:root,env:process.env,windowsHide:true,stdio:['ignore','pipe','pipe']})
 let log='';child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b)
 const code=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(Error('WEB_FLOW_TIMEOUT'))},180000);child.on('error',reject);child.on('close',n=>{clearTimeout(timer);resolve(n)})})
 for(const account of Object.values(f.accounts))log=log.replaceAll(account.bearer_token,'[redacted]')
 await writeFile(join(out,'WEB_FLOW.log'),log);assert.equal(code,0,'Existing real web acceptance must pass')
 const web=JSON.parse(await readFile(join(out,'ARTISTS_WEB_RESULTS.json'),'utf8'));assert.equal(web.result,'PASS');checks.push('Existing owner/agency/reviewer web flow passed and withdrew public consent')
 const denied=page.waitForResponse(r=>r.url().includes('/artists/catalog/')&&r.url().endsWith('/content'))
 await press(button);const res=await denied;denial={status:res.status(),code:(await res.json()).error?.code};assert.equal(denial.status,409)
 await page.waitForTimeout(250);assert.equal(await button.count(),0)
 const text=await page.locator('body').ariaSnapshot();assert(!text.includes(item.display_name));assert(!text.includes(item.introduction));for(const account of Object.values(f.accounts))assert(!text.includes(account.bearer_token))
 await page.screenshot({path:join(out,'app-catalog-after-withdrawal.png')});checks.push('App removed old public name, introduction and preview actions after real 409 denial');assert.equal(errors.length,0)
}catch(e){failure=e.message;process.exitCode=1}
finally{await writeFile(join(out,'CATALOG_REVOCATION_RESULTS.json'),JSON.stringify({result:failure?'FAIL':'PASS',synthetic_only:true,checks,denial,page_errors:errors,failure},null,2)+'\n');await browser.close()}
console.log(JSON.stringify({result:failure?'FAIL':'PASS',checks:checks.length,failure}))
