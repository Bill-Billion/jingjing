// Read-only G02 employee entry regression against a prepared loopback environment.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const root=process.cwd(),f=JSON.parse(await readFile(process.env.V5_ACCESS_FILE,'utf8'));
assert(f.synthetic_only&&new URL(f.base_url).hostname==='127.0.0.1');assert(Date.parse(f.expires_at)>Date.now());
const out=resolve(process.env.QA18_OUTPUT_DIR);assert(out.startsWith(join(root,'.local')+sep));await mkdir(out);
const personId=f.scenarios.mcn.person_id,checks=[],pages=[],responses=[];
async function check(name,run){try{const detail=await run();checks.push({name,result:'PASS',detail});}catch(e){checks.push({name,result:'FAIL',error:e.message});}}
async function api(role,path){const u=f.accounts[role],r=await fetch(f.base_url+path,{headers:{Authorization:'Bearer '+u.bearer_token,'X-Acting-Party':u.party_id}}),j=await r.json();return {status:r.status,data:j.data,error:j.error?.code};}
const original=await api('auditions_seller','/artists/people/'+personId);assert.equal(original.status,200);
await check('api-authorized-employee-reads-assigned-person',async()=>{const r=await api('mcn_staff','/artists/people/'+personId);assert.equal(r.status,200,r.error);assert.equal(r.data.person.owner_party_id,original.data.person.owner_party_id);return {status:r.status,person_id:personId,owner_unchanged:true};});
await check('api-employee-list-contains-assigned-person',async()=>{const r=await api('mcn_staff','/artists/people');assert.equal(r.status,200,r.error);assert(r.data.items.some(p=>p.id===personId));return {status:r.status,person_ids:r.data.items.map(p=>p.id)};});
const {chromium}=createRequire(join(root,'晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))('playwright-core'),browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
function observe(p,surface){p.on('response',r=>{if(r.url().includes('/api/v1/artists/'))responses.push({surface,path:new URL(r.url()).pathname,status:r.status()});});}
try{
 await check('vue-authorized-employee-can-open-assigned-profile',async()=>{const c=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN'}),u=f.accounts.mcn_staff;await c.addInitScript(({token,party})=>{sessionStorage.setItem('ops.session.token',token);sessionStorage.setItem('ops.session.selected',party);},{token:u.bearer_token,party:u.party_id});const p=await c.newPage();pages.push({p,surface:'vue'});observe(p,'vue');await p.goto('http://127.0.0.1:5173/artists/people/'+personId);await p.waitForLoadState('networkidle');assert.equal(await p.getByTestId('artists-person-summary').count(),1,'Assigned employee must reach the private profile, not an owner-only gate');assert(responses.some(r=>r.surface==='vue'&&r.path==='/api/v1/artists/people/'+personId&&r.status===200));return {person_id:personId};});
 await check('flutter-web-authorized-employee-can-open-assigned-profile',async()=>{const c=await browser.newContext({viewport:{width:390,height:844},locale:'zh-CN'}),p=await c.newPage();pages.push({p,surface:'flutter-web'});observe(p,'flutter-web');await p.goto('http://127.0.0.1:5500/?fixtureRole=mcn_staff#/artists/person?personId='+personId);await p.locator('flt-semantics-placeholder').waitFor({state:'attached'});await p.locator('flt-semantics-placeholder').evaluate(e=>e.click());await p.getByRole('heading').first().waitFor();await p.waitForLoadState('networkidle');assert(responses.some(r=>r.surface==='flutter-web'&&r.path==='/api/v1/artists/people/'+personId&&r.status===200),'Assigned employee must issue the permitted person read');assert((await p.locator('body').innerText()).includes(original.data.person.display_name));return {person_id:personId};});
}finally{for(const {p,surface}of pages){await p.screenshot({path:join(out,surface+'.png'),fullPage:true});await writeFile(join(out,surface+'.txt'),await p.locator('body').innerText());}await browser.close();}
const result={source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),synthetic_only:true,person_id:personId,checks,responses,result:checks.every(c=>c.result==='PASS')?'PASS':'FAIL',limits:'Employee read entries only; write authority, withdrawal, other actors and original assets require separate checks'};
await writeFile(join(out,'RESULT.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(result.result==='FAIL')process.exitCode=1;
