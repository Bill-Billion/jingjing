// Actual current Vue UI in an isolated browser; API calls never leave interception.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {fileURLToPath} from 'node:url'
import {createServer} from 'vite'
import vue from '@vitejs/plugin-vue'
import {chromium} from 'playwright-core'
const root=fileURLToPath(new URL('../repo/晶晶日上工程交接包/01_源码/frontend_ops_workspace',import.meta.url))
const out=fileURLToPath(new URL('../evidence/',import.meta.url))
const server=await createServer({root,configFile:false,plugins:[vue()],resolve:{alias:{'@':root+'/src'}},server:{host:'127.0.0.1',port:0,hmr:false}})
await server.listen();const origin=server.resolvedUrls.local[0].replace(/\/$/,'')
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--disable-background-networking']})
const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage()
const id=n=>String(n).padStart(8,'0')+'-0000-4000-8000-000000000001'
const account={id:id(1),display_name:'本机合成测试账号',current_status:'ACTIVE',allowed_actions:[]}
const party={party:{id:id(2),display_name:'本机合成个人',kind:'PERSON',current_status:'ACTIVE',object_version:1,allowed_actions:['READ_PARTY'],capabilities:[]},membership:{roles:['OWNER'],current_status:'ACTIVE'}}
const firstPageParties=[party,...Array.from({length:19},(_,n)=>({party:{...party.party,id:id(n+3),display_name:'首页合成身份'+(n+2)},membership:{...party.membership}}))]
const secondParty={party:{id:id(90),display_name:'第二页合成机构',kind:'ORGANIZATION',current_status:'ACTIVE',object_version:1,allowed_actions:['READ_PARTY'],capabilities:[]},membership:{roles:['OWNER'],current_status:'ACTIVE'}}
const calls=[],errors=[];let unauthorized=false
page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept())
await context.addInitScript(({token,partyId})=>{if(!sessionStorage.getItem('diagnostic.initialized')){sessionStorage.setItem('ops.session.token',token);sessionStorage.setItem('ops.session.expires_at','2099-01-01T00:00:00Z');sessionStorage.setItem('ops.session.selected',partyId);sessionStorage.setItem('diagnostic.initialized','1')}},{token:'synthetic-only-not-valid',partyId:id(2)})
await context.route('**/*',async route=>{
 const req=route.request(),url=new URL(req.url())
 if(url.origin!==origin)return route.abort()
 if(!url.pathname.startsWith('/api/'))return route.continue()
 const p=url.pathname,method=req.method(),headers=req.headers();calls.push({path:p,method,key:headers['idempotency-key']??null})
 const reply=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(status<300?{meta:{request_id:'local-diagnostic',actor:{account_id:id(1)},acting_party:headers['x-acting-party']||null},data}:{error:{code:'AUTHENTICATION_REQUIRED',message:'模拟登录过期',retryable:false}})})
 if(unauthorized&&p.includes('/eligibility'))return reply(null,401)
 if(p==='/api/v1/me')return reply(account)
 if(p==='/api/v1/me/parties')return reply(url.searchParams.has('cursor')?{items:[secondParty],next_cursor:null}:{items:firstPageParties,next_cursor:id(21)})
 if(p.includes('/eligibility'))return reply({order_id:id(11),currency:'CNY',environment:'SANDBOX',received_minor:10000,refunded_minor:0,pending_refund_minor:0,occupied_minor:0,available_minor:10000})
 if(p==='/api/v1/invoices/requests'&&method==='POST')return route.abort('failed')
 return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({error:{code:'SYNTHETIC_UNHANDLED',message:p,retryable:false}})})
})
const target='/invoices/orders/'+id(11)+'/new'
try{
 await page.goto(origin+target)
 await page.getByLabel('抬头名称',{exact:true}).fill('本机合成抬头')
 await page.getByLabel('申请金额（元）',{exact:true}).fill('10')
 await page.getByLabel('申请说明',{exact:true}).fill('仅诊断响应丢失，不是真实开票')
 await page.getByRole('checkbox',{name:'我已核对原订单、金额和抬头，确认提交申请。'}).check()
 await page.getByTestId('invoice-submit').click()
 await page.getByRole('button',{name:'恢复原开票请求',exact:true}).waitFor()
 const first=calls.filter(x=>x.method==='POST').at(-1).key
 await page.getByRole('button',{name:'恢复原开票请求',exact:true}).click()
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(x=>x.textContent==='恢复原开票请求'&&!x.disabled))
 const retry=calls.filter(x=>x.method==='POST').at(-1).key;assert.equal(first,retry)
 await page.screenshot({path:out+'invoice-unknown-before-reload.png',fullPage:true})
 await page.reload()
 await page.getByLabel('抬头名称',{exact:true}).waitFor()
 assert.equal(await page.getByRole('button',{name:'恢复原开票请求',exact:true}).count(),0)
 await page.screenshot({path:out+'invoice-after-reload.png',fullPage:true})
 await page.getByLabel('抬头名称',{exact:true}).fill('本机合成抬头')
 await page.getByLabel('申请金额（元）',{exact:true}).fill('10')
 await page.getByLabel('申请说明',{exact:true}).fill('仅诊断响应丢失，不是真实开票')
 await page.getByRole('checkbox',{name:'我已核对原订单、金额和抬头，确认提交申请。'}).check()
 await page.getByTestId('invoice-submit').click()
 await page.getByRole('button',{name:'恢复原开票请求',exact:true}).waitFor()
 const second=calls.filter(x=>x.method==='POST').at(-1).key;assert.notEqual(first,second)
 await page.reload();await page.getByLabel('抬头名称',{exact:true}).waitFor()
 unauthorized=true
 await page.getByRole('button',{name:'重新核对额度',exact:true}).click()
 await page.waitForURL('**/login')
 assert.equal(new URL(page.url()).search,'')
 await page.screenshot({path:out+'ordinary-401-login.png',fullPage:true})
 unauthorized=false
 const identityPage=await context.newPage()
 identityPage.on('dialog',d=>d.accept())
 await identityPage.goto(origin+target)
 await identityPage.getByRole('button',{name:'读取更多身份',exact:true}).click()
 await identityPage.getByTestId('ops-party').selectOption(id(90))
 assert.equal(await identityPage.getByTestId('ops-party').inputValue(),id(90))
 await identityPage.screenshot({path:out+'identity-second-page-selected.png',fullPage:true})
 await identityPage.reload()
 await identityPage.getByLabel('抬头名称',{exact:true}).waitFor()
 const afterReload=await identityPage.getByTestId('ops-party').inputValue()
 assert.equal(afterReload,id(2))
 await identityPage.screenshot({path:out+'identity-reset-after-reload.png',fullPage:true})
 const result={head:'8df249b59d3c83cdd8ca9aee0db08068b546d296',tested_at:new Date().toISOString(),source:'actual Vue UI, isolated Google Chrome, all API routes synthetic',results:[{id:'R3',samePageRetrySameKey:first===retry,pendingLostAfterReload:true,freshSubmitUsesDifferentKey:first!==second,first,retry,second},{id:'R2',actualPath:new URL(page.url()).pathname,actualQuery:new URL(page.url()).search,expectedReturn:target},{id:'R4',firstPageCount:firstPageParties.length,selectedBeforeReload:id(90),selectedAfterReload:afterReload,partyDetailRequested:calls.some(x=>x.path==='/api/v1/parties/'+id(90))}],calls,errors}
 fs.writeFileSync(out+'browser-reproductions.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))
}catch(e){await page.screenshot({path:out+'browser-diagnostic-failure.png',fullPage:true}).catch(()=>{});console.error(e);throw e}
finally{await browser.close();await server.close()}
