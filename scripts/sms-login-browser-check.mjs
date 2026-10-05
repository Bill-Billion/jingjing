// Existing Vue pages + actual SMS adapter + isolated HTTP/MySQL; synthetic HTTPS only.
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
const root=process.cwd(), require=createRequire(resolve(root,'晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))
const {chromium}=require('playwright-core')
const state=JSON.parse(await readFile(process.env.PR11_UI_STATE_FILE,'utf8'))
assert.equal(state.testOnly,true)
const base=process.env.BASE_URL || 'http://127.0.0.1:5199'
for(const u of [base,state.apiUrl,state.controlUrl])assert.equal(new URL(u).hostname,'127.0.0.1')
const control=async (route,method='GET')=>{const r=await fetch(state.controlUrl+route,{method,headers:{Authorization:`Bearer ${state.controlToken}`}});assert(r.ok);return r.json()}
const dir=resolve(root,'.local/sms-login/browser');await mkdir(dir,{recursive:true})
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true})
const page=await browser.newPage({viewport:{width:375,height:860}}),results=[],errors=[]
page.on('pageerror',e=>errors.push(e.message))
const check=(name,value)=>{assert(value,name);results.push({name,result:'PASS'});console.log(name)}
try {
 await control('/sms?enabled=false','POST')
 const before=await control('/metrics')
 await page.goto(base+'/login');await page.getByTestId('phone-input').fill('13900009951');await page.getByTestId('send-code').click()
 await page.getByText('短信服务暂不可用',{exact:false}).first().waitFor()
 check('后端关闭短信时页面不显示已发送，发送次数不增加',await page.getByTestId('code-input').count()===0&&(await control('/metrics')).dispatches===before.dispatches)
 await control('/sms?enabled=true','POST')
 // Resolve the original failed challenge before changing the phone: no duplicate dispatch.
 await page.getByTestId('send-code').click()
 await page.getByText('这条验证码已失效',{exact:false}).first().waitFor()
 check('核对原失败申请不补发短信，随后允许重新申请',(await control('/metrics')).dispatches===before.dispatches)
 await page.getByTestId('phone-input').fill('13900009952')
 const sends=[];page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/v1/auth/sms-challenges'))sends.push(r.headers()['idempotency-key'])})
 await page.getByTestId('send-code').evaluate(el=>{el.click();el.click()})
 await page.getByTestId('code-input').waitFor()
 check('连续点击只发起一次短信请求',sends.length===1&&(await control('/metrics')).dispatches===before.dispatches+1)
 const {code}=await control('/code?phone=13900009952')
 await page.getByTestId('code-input').fill(code==='000000'?'111111':'000000');await page.getByTestId('submit-login').click()
 await page.getByText('手机号或验证码不正确',{exact:false}).first().waitFor()
 check('错误验证码不能进入已登录页面',new URL(page.url()).pathname==='/login')
 await page.getByTestId('code-input').fill(code);await page.getByTestId('submit-login').click();await page.waitForURL('**/workspace');await page.locator('.identity').first().waitFor()
 check('正确验证码经过实际后端校验并读取本人身份',await page.locator('.identity').count()>0)
 await page.screenshot({path:resolve(dir,'login-success-mobile.png'),fullPage:true})
 check('手机宽度不横向溢出',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
 await page.getByRole('button',{name:'退出登录',exact:true}).click();await page.locator('.el-message-box').getByRole('button',{name:'退出',exact:true}).click();await page.waitForURL('**/login')
 check('退出后清理登录信息',await page.evaluate(()=>!sessionStorage.getItem('ops.session.token')))
 check('页面没有未捕获异常',errors.length===0)
 await writeFile(resolve(dir,'summary.json'),JSON.stringify({result:'PASS',checks:results,real_sms_requests:0,transport:'actual adapter with synthetic HTTPS',native_device_tested:false},null,2)+'\n')
} finally {await control('/sms?enabled=true','POST').catch(()=>{});await browser.close()}
