// Loopback-only business checks using an explicitly created disposable fixture.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const root=process.cwd(),f=JSON.parse(await readFile(process.env.V5_ACCESS_FILE,'utf8'));
assert(f.synthetic_only&&new URL(f.base_url).hostname==='127.0.0.1');
const out=resolve('.local/client-complete-first-audition-browser');await mkdir(out,{recursive:true});
const {chromium}=createRequire(join(root,'晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))('playwright-core');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
const checks=[],contexts=[];let phase='setup';
async function api(role,path,method='GET',body,party=true,version){const a=f.accounts[role],r=await fetch(f.base_url+path,{method,headers:{Authorization:'Bearer '+a.bearer_token,...party?{'X-Acting-Party':a.party_id}:{},...(body?{'Content-Type':'application/json','Idempotency-Key':randomUUID()}:{}),...(version?{'If-Match':'"'+version+'"'}:{})},...(body?{body:JSON.stringify(body)}:{})});const v=await r.json();assert(r.ok,`${path}: ${r.status} ${v.error?.code}`);return v.data;}
async function web(role,path){const a=f.accounts[role],c=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN'});contexts.push(c);await c.addInitScript(({token,party})=>{sessionStorage.setItem('ops.session.token',token);sessionStorage.setItem('ops.session.selected',party);},{token:a.bearer_token,party:a.party_id});const p=await c.newPage();p.setDefaultTimeout(15000);await p.goto('http://127.0.0.1:5173'+path);await p.locator('h1').waitFor();await p.waitForLoadState('networkidle');return p;}
async function app(role,path){const c=await browser.newContext({viewport:{width:390,height:844},locale:'zh-CN'});contexts.push(c);const p=await c.newPage();p.setDefaultTimeout(20000);await p.goto('http://127.0.0.1:5500/?fixtureRole='+role+'#'+path);await p.locator('flt-semantics-placeholder').waitFor({state:'attached'});await p.locator('flt-semantics-placeholder').evaluate(e=>e.click());await p.getByRole('heading').first().waitFor();await p.waitForLoadState('networkidle');return p;}
async function seek(p,loc){for(let n=0;n<45;n++){const box=await loc.count()?await loc.boundingBox():null;if(box&&box.y>=55&&box.y+box.height<p.viewportSize().height-8)return;await p.mouse.move(180,400);await p.mouse.wheel(0,box?.y<55?-350:350);await p.waitForTimeout(100);}throw Error('不能到达控件 '+phase);}
try {
 const scene=f.scenarios.first_audition;
 const before=await api('first_auditions_seller','/auditions/records?kind=OFFER');assert.equal(before.items.length,0);
 phase='web-first-offer';const seller=await web('first_auditions_seller','/auditions/offers');
 await seller.locator('.business-actions').getByRole('button',{name:'填写试镜方案',exact:true}).click();
 const choose=async(field,label,value)=>{await seller.getByRole('button',{name:'读取可选'+label,exact:true}).click();const control=seller.locator('#offer-offer-'+field);await control.locator('option[value="'+value+'"]').waitFor({state:'attached'});await control.selectOption(value);};
 await choose('person_id','真人',scene.person_id);
 await choose('avatar_id','数字人',scene.avatar_id);
 await choose('public_consent_id','公开预约展示授权',scene.public_consent_id);
 await choose('rule_id','已审试镜商品规则',scene.rule_id);
 for(const [key,value]of Object.entries({title:'浏览器首次试镜方案',city:'郑州',service_area:'线上材料，仅隔离测试',unit_minor:'100',terms:'本机合成资料试镜，不授予商业出演权'}))await seller.locator('#offer-offer-'+key).fill(value);
 await seller.locator('#offer-offer-mode').selectOption('ONLINE_MATERIALS');
 await seller.locator('#offer-offer-public_booking').check();await seller.locator('#offer-offer-public_price').check();
 await seller.getByRole('button',{name:'添加可约时段',exact:true}).click();
 const dates=seller.locator('.business-form input[type="datetime-local"]');assert.equal(await dates.count(),2);
 const localDate=(ms)=>{const d=new Date(Date.now()+ms);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16);};
 await dates.nth(0).fill(localDate(86400000));await dates.nth(1).fill(localDate(90000000));
 await seller.getByLabel('已阅读当前记录与本次约定，明确提交上述办理事项。',{exact:true}).check();
 const sent=seller.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/auditions/offers'));await seller.getByTestId('business-offer').click();const response=await sent,json=await response.json();assert(response.ok(),json.error?.code);const offer=json.data;assert.equal(offer.current_status,'IN_REVIEW');checks.push('无历史试镜方案的艺人，从当前规则与本人授权创建首份方案');await seller.screenshot({path:join(out,'01-first-offer.png')});
 phase='web-independent-review';const reviewer=await web('first_auditions_reviewer','/auditions/reviews/'+offer.id);
 await reviewer.locator('.business-actions').getByRole('button',{name:'独立核验试镜方案',exact:true}).click();await reviewer.locator('#review-offer-decision').selectOption('APPROVE');await reviewer.locator('#review-offer-reason').fill('隔离测试：独立核对本次人物、授权与方案');await reviewer.getByLabel('已阅读当前记录与本次约定，明确提交上述办理事项。',{exact:true}).check();const reviewed=reviewer.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/reviews'));await reviewer.getByTestId('business-review-offer').click();const checked=await reviewed,j=await checked.json();assert(checked.ok(),j.error?.code);assert.equal(j.data.current_status,'PUBLISHED');checks.push('另一位运营在网页独立审核同一方案');await reviewer.screenshot({path:join(out,'02-reviewed-offer.png')});
 phase='app-public-catalog';const buyer=await app('first_auditions_buyer','/auditions/catalog?city='+encodeURIComponent('郑州'));const book=buyer.getByRole('button',{name:'约试镜 ↗',exact:true});await seek(buyer,book);const opening=buyer.waitForResponse(r=>r.request().method()==='GET'&&new URL(r.url()).pathname.endsWith('/auditions/catalog'));await book.click();const opened=await opening,actual=(await opened.json()).data.items.find(item=>item.id===offer.id);assert(opened.ok());assert(actual);assert.equal(actual.title,'浏览器首次试镜方案');await buyer.getByRole('heading',{name:'约一次试镜',exact:true}).first().waitFor();checks.push('App买家按城市读到网页新发布的同一试镜方案');await buyer.screenshot({path:join(out,'03-app-first-offer.png')});
 await writeFile(join(out,'RESULTS.json'),JSON.stringify({result:'PASS',synthetic_only:true,checks,records:{offer:offer.id},limits:'浏览器从首次提交到独立审核与App可约目录；付款、履约与逆向尚须同记录续验。无真实服务。'},null,2));console.log(JSON.stringify({result:'PASS',checks}));
}catch(e){for(let n=0;n<contexts.length;n++){const p=contexts[n].pages()[0];if(p){await p.screenshot({path:join(out,'failure-'+n+'.png')}).catch(()=>{});await writeFile(join(out,'failure-'+n+'.txt'),await p.locator('body').innerText());}}await writeFile(join(out,'FAILURE.json'),JSON.stringify({phase,error:e.message,checks},null,2));console.error(phase+': '+e.message);process.exitCode=1;}finally{for(const c of contexts)await c.close();await browser.close();}
