import fs from 'node:fs/promises';import {createRequire} from 'node:module';
import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');process.chdir(root);
const envDirectory=path.resolve(process.argv[2]||'');
if(process.argv.length!==3||path.dirname(envDirectory)!==path.join(root,'.local/stock-sandbox')||!/^jx_test_stock_pm03_[a-f0-9]{24}$/.test(path.basename(envDirectory)))throw Error('OWN_BATCH_DIRECTORY_REQUIRED');
const environment=JSON.parse(await fs.readFile(path.join(envDirectory,'access.json'),'utf8'));
if(environment.synthetic_only!==true||environment.mode!=='BATCH'||Date.parse(environment.expires_at)<=Date.now())throw Error('LIVE_SYNTHETIC_BATCH_REQUIRED');
const outDir=path.join(envDirectory,'ui-observations');await fs.mkdir(outDir,{recursive:true});
const require=createRequire(import.meta.url),{chromium}=require('../晶晶日上工程交接包/01_源码/frontend_ops_workspace/node_modules/playwright-core');
const browser=await chromium.launch({executablePath:process.env.PM03_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const page=await browser.newPage({viewport:{width:420,height:900}}),events=[];
const fixture=JSON.parse(await fs.readFile(envDirectory+'/ui-access.json','utf8'));
let originalRefunded;
async function reveal(locator){for(let n=0;n<18;n++){if(await locator.count()){await locator.scrollIntoViewIfNeeded();return;}await page.mouse.move(200,450);await page.mouse.wheel(0,350);await page.waitForTimeout(120)}throw Error('UI action not reachable');}
page.on('response',async r=>{if(r.url().includes('/api/v1/')&&!r.url().includes('/auth/')){const j=await r.json().catch(()=>({}));if(new URL(r.url()).pathname.endsWith('/guardian-recharge-refund-options'))originalRefunded=j.data?.items?.find(x=>x.id===fixture.scenarios.guardian_refund.recharge_id)?.refunded_minor;events.push({path:new URL(r.url()).pathname,method:r.request().method(),status:r.status(),id:j.data?.id,error:j.error?.code})}});
try{
 await page.goto('http://127.0.0.1:5500/?fixtureRole=stock_seller#/wallet/guardian-refunds');
 await page.waitForSelector('flt-glass-pane',{state:'attached'});await page.locator('flt-semantics-placeholder').evaluate(e=>e.click()).catch(()=>{});
 await page.getByRole('button',{name:'读取本人的有效监护关系',exact:true}).click();
 await page.getByRole('radio').first().waitFor();await page.getByRole('radio').first().click();
 await page.getByRole('button',{name:'读取所选子女的原充值',exact:true}).click();
 const source=page.getByRole('radio',{name:new RegExp(fixture.scenarios.guardian_refund.recharge_id)});
 await reveal(source);await source.click();
 for(const [name,value] of [['申请金额（元）','1.00'],['退款原因','PM03 synthetic guardian refund UI']]){
  const input=page.getByRole('textbox',{name,exact:true});await input.click();await page.waitForTimeout(200);
  await page.keyboard.press('Control+A');await page.keyboard.type(value,{delay:20});await page.keyboard.press('Tab');await page.waitForTimeout(200);
  console.log('input',name,await input.inputValue());
 }
 const upload=page.getByRole('button',{name:'选择并上传文件',exact:true});await reveal(upload);
 const chooser=page.waitForEvent('filechooser');await upload.click();await (await chooser).setFiles({name:'pm03-evidence.txt',mimeType:'text/plain',buffer:Buffer.from('Synthetic guardian refund evidence only')});
 await page.waitForResponse(r=>r.url().includes('/supply/assets')&&r.request().method()==='POST');
 await page.waitForTimeout(400);
 const check=page.getByRole('checkbox');await reveal(check);await check.click();
 await page.waitForFunction(()=>document.querySelector('[role=checkbox]')?.getAttribute('aria-checked')==='true');
 const submit=page.getByRole('button',{name:'提交退款申请',exact:true});await reveal(submit);
 const receipt=page.waitForResponse(r=>r.url().endsWith('/wallet/guardian-recharge-refunds')&&r.request().method()==='POST');await submit.click();
 const sent=await receipt,j=await sent.json();if(sent.status()!==200)throw Error('REFUND_UI_'+j.error?.code);
 if(!Number.isSafeInteger(originalRefunded))throw Error('SOURCE_REFUND_BALANCE_NOT_OBSERVED');
 await fs.writeFile(outDir+'/w18-created.json',JSON.stringify({id:j.data.id,recharge_id:j.data.recharge_id,before_refunded_minor:originalRefunded,applicant_kind:j.data.applicant_kind,status:j.data.current_status}));
 console.log((await page.locator('body').innerText()).slice(-6000));console.log(JSON.stringify({radios:await page.getByRole('radio').count(),events}));
 await page.screenshot({path:outDir+'/app-guardian-options.png',fullPage:true});
}catch(e){await page.screenshot({path:outDir+'/w18-failure.png'});await fs.writeFile(outDir+'/w18-failure-body.txt',await page.locator('body').innerText());throw e}
finally{await fs.writeFile(outDir+'/w18-ui-events.json',JSON.stringify(events,null,2));await browser.close()}
