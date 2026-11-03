// Read the same synthetic daily report after the label fix; no business writes.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const P=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const W=resolve(P,'晶晶日上工程交接包/01_源码/frontend_ops_workspace');
const out=resolve(P,'.local/pr39-four-pages'),req=createRequire(resolve(W,'package.json'));
const {chromium}=req('playwright-core'),{createServer}=await import(pathToFileURL(req.resolve('vite')));
const {default:vue}=await import(pathToFileURL(req.resolve('@vitejs/plugin-vue')));
const a=JSON.parse(await readFile(resolve(out,'access.json'))),b=JSON.parse(await readFile(resolve(out,'browser-results.json')));
assert(a.synthetic_only);assert(b.completed);let web,browser,page;const results=[];
try {
 web=await createServer({root:W,configFile:false,plugins:[vue()],resolve:{alias:{'@':resolve(W,'src')}},server:{fs:{allow:[P]},host:'127.0.0.1',port:5183,strictPort:true,proxy:{'/api':{target:a.host}}}});await web.listen();
 browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1280,height:1000}});
 await context.addInitScript(x=>{sessionStorage.setItem('ops.session.token',x.token);sessionStorage.setItem('ops.session.selected',x.party)},a.accounts.reviewer);
 page=await context.newPage();
 await page.goto('http://127.0.0.1:5183/daily-finance/reports/'+b.records.report_id);
 await page.getByText('仍有账目差异',{exact:true}).first().waitFor();
 await page.screenshot({path:resolve(out,'fp01-final-state-label.png'),fullPage:true});
 results.push({id:'FP01-final-status-label',result:'PASS',report_id:b.records.report_id});
 console.log('FOUR_READONLY_PASS');
} catch(e) {
 if(page){await writeFile(resolve(out,'readonly-failure.txt'),await page.locator('body').innerText().catch(()=>''));await page.screenshot({path:resolve(out,'readonly-failure.png'),fullPage:true}).catch(()=>{});}
 throw e;
} finally {
 await browser?.close();await web?.close();
 await writeFile(resolve(out,'readonly-results.json'),JSON.stringify({synthetic_only:true,checks:results,finished_at:new Date().toISOString()},null,2));
}
