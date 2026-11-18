'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{createRequire}=require('node:module'),{pathToFileURL}=require('node:url');
async function start({base,buyer,reviewer,fixtures,expectedRefunds=4,outputDir=null}){
 const root=path.resolve(__dirname,'../../../../..'),webRoot=path.join(root,'晶晶日上工程交接包/01_源码/frontend_ops_workspace'),wr=createRequire(path.join(webRoot,'package.json')),out=outputDir||path.join(root,'.local/pm01-w11-browser');
 await fs.mkdir(out,{recursive:true});const {preview}=await import(pathToFileURL(wr.resolve('vite'))),{chromium}=wr('playwright-core');
 let web,browser,finished=0;const checks=[];
 async function close(){await browser?.close();if(web)await new Promise(r=>web.httpServer.close(r));await fs.writeFile(path.join(out,'result.json'),JSON.stringify({completed:finished===expectedRefunds,checks,synthetic_only:true,limits:['Browser independent refund decision and buyer download permission; prerequisites and provider receipts remain HTTP/helpers','Synthetic file bytes do not prove playable movie quality; App execution requires separate native evidence']},null,2));}
 try{
  web=await preview({root:webRoot,configFile:false,preview:{host:'127.0.0.1',port:5331,strictPort:true,proxy:{'/api':{target:new URL(base).origin}}}});
  browser=await chromium.launch({headless:true,...process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}});
  async function page(user){const c=await browser.newContext({viewport:{width:1280,height:1000}});await c.addInitScript(({token,party})=>{sessionStorage.setItem('ops.session.token',token);sessionStorage.setItem('ops.session.selected',party)},{token:user.token,party:user.personal_party_id});const p=await c.newPage();p.setDefaultTimeout(15000);return p;}
  const operator=await page(reviewer),customer=await page(buyer);
  const goto=async(p,url)=>{await p.goto('http://127.0.0.1:5331'+url);await p.waitForLoadState('networkidle');};
  return {
   async resolve(order,decision){
    await goto(operator,'/stock/aftercare/'+order.id+'?action=resolve');
    await operator.getByRole('button',{name:'读取可选当前待处理售后',exact:true}).click();
    await operator.locator('#resolve-case_id').selectOption(decision.case_id);
    await operator.locator('#resolve-decision').selectOption('REFUND');await operator.locator('#resolve-refund_minor').fill((decision.refund_minor/100).toFixed(2));
    await operator.locator('#resolve-license_action').selectOption(decision.license_action);await operator.locator('#resolve-reason').fill(decision.reason);
    await operator.getByLabel('已阅读当前记录与本次约定，明确提交上述办理事项。',{exact:true}).check();
    const wait=operator.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/case-resolution'));await operator.getByTestId('business-resolve').click();const response=await wait,value=await response.json();
    assert.equal(response.status(),200,JSON.stringify(value));fixtures.push({method:'POST',path:new URL(response.url()).pathname,schema:'StockResponse',value});
    const h=response.request().headers();await operator.waitForLoadState('networkidle');checks.push({order_id:order.id,case_id:decision.case_id,amount_minor:decision.refund_minor,license_action:decision.license_action,result:'PASS'});
    return {data:value.data,headers:{'Idempotency-Key':h['idempotency-key'],'If-Match':h['if-match']}};
   },
   async afterRefund(order,action){
    await goto(customer,'/stock/purchases/'+order.id);
    const wait=customer.waitForResponse(r=>r.request().method()==='GET'&&r.url().endsWith('/content'));await customer.getByRole('button',{name:'明确取得正式影片',exact:true}).click();const response=await wait;
    assert.equal(response.status(),action==='KEEP'?200:409);
    await customer.waitForLoadState('networkidle');await customer.screenshot({path:path.join(out,order.id+'.png'),fullPage:true});
    finished++;checks.push({order_id:order.id,download_status:response.status(),license_action:action,result:'PASS'});
   },close
  };
 }catch(e){await close();throw e;}
}
module.exports={start};
