import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const root=process.cwd(),out=resolve('.local/demo-independent-20261103'),w=resolve('晶晶日上工程交接包/01_源码/frontend_ops_workspace');
const f=JSON.parse(await readFile(process.env.V5_ACCESS_FILE,'utf8'));assert(f.synthetic_only&&new URL(f.base_url).hostname==='127.0.0.1');
const req=createRequire(join(w,'package.json')),{chromium}=req('playwright-core'),{preview}=await import(pathToFileURL(req.resolve('vite')));
let web,browser,current='setup';const contexts=[],checks=[],issues=[],records={},requests=[];
const origin='http://127.0.0.1:5177';
async function api(role,path){const a=f.accounts[role],r=await fetch(f.base_url+path,{headers:{Authorization:'Bearer '+a.bearer_token,'X-Acting-Party':a.party_id}});const j=await r.json();assert.equal(r.status,200,JSON.stringify(j));return j.data}
async function actor(role,path){const a=f.accounts[role],c=await browser.newContext({viewport:{width:1440,height:1100},locale:'zh-CN'});contexts.push(c);await c.addInitScript(({token,party})=>{sessionStorage.setItem('ops.session.token',token);sessionStorage.setItem('ops.session.selected',party)},{token:a.bearer_token,party:a.party_id});const p=await c.newPage();p.setDefaultTimeout(15000);p.on('pageerror',e=>issues.push({kind:'pageerror',error:e.message}));p.on('request',r=>{if(r.url().includes('/api/'))requests.push({method:r.method(),path:new URL(r.url()).pathname})});await go(p,path);return p}
async function go(p,path){await p.goto(origin+path);await p.waitForLoadState('networkidle')}
async function post(p,suffix,action){const waiting=p.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname.endsWith(suffix));await action();const r=await waiting,j=await r.json();assert.equal(r.status(),200,JSON.stringify(j));await p.waitForLoadState('networkidle');return j.data}
async function shot(p,name){await p.screenshot({path:join(out,name+'.png'),fullPage:true});await writeFile(join(out,name+'.txt'),await p.locator('body').innerText())}
const agree=p=>p.getByLabel('已阅读当前记录与本次约定，明确提交上述办理事项。',{exact:true}).check();
async function choices(p,id,label,value){await p.getByRole('button',{name:'读取可选'+label,exact:true}).click();await p.locator('#'+id+' option[value="'+value+'"]').waitFor({state:'attached'});await p.locator('#'+id).selectOption(value)}
async function run(name,fn){if(process.env.DEMO_PHASE&&!process.env.DEMO_PHASE.split(',').includes(name))return;current=name;try{await fn();checks.push({name,result:'PASS'});console.log('PASS '+name)}catch(e){issues.push({name,error:e.stack});console.error('FAIL '+name+': '+e.message);for(const [n,c]of contexts.entries()){const p=c.pages()[0];if(p)await shot(p,'failure-'+name+'-'+n).catch(()=>{})}}}
try{
 web=await preview({root:w,configFile:false,preview:{host:'127.0.0.1',port:5177,strictPort:true,proxy:{'/api':{target:new URL(f.base_url).origin}}}});
 browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 await run('first-audition',async()=>{
  const s=f.scenarios.first_audition,p=await actor('first_auditions_seller','/auditions/offers');
  assert.equal((await api('first_auditions_seller','/auditions/records?kind=OFFER')).items.length,0);
  await p.locator('.business-actions').getByRole('button',{name:'填写试镜方案',exact:true}).click();
  for(const [field,label]of [['person_id','真人'],['avatar_id','数字人'],['public_consent_id','公开预约展示授权'],['rule_id','已审试镜商品规则']])await choices(p,'offer-offer-'+field,label,s[field]);
  for(const[k,v]of Object.entries({title:'独立检查首次试镜',city:'郑州',service_area:'线上材料，合成演示',unit_minor:'100',terms:'合成试镜，不授予商业出演权'}))await p.locator('#offer-offer-'+k).fill(v);
  await p.locator('#offer-offer-mode').selectOption('ONLINE_MATERIALS');await p.locator('#offer-offer-public_booking').check();await p.locator('#offer-offer-public_price').check();await p.getByRole('button',{name:'添加可约时段',exact:true}).click();
  const local=ms=>{const d=new Date(Date.now()+ms);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16)};
  const dates=p.locator('.business-form input[type="datetime-local"]');await dates.nth(0).fill(local(86400000));await dates.nth(1).fill(local(90000000));await agree(p);
  const offer=await post(p,'/auditions/offers',()=>p.getByTestId('business-offer').click());records.offer=offer.id;assert.equal(offer.current_status,'IN_REVIEW');await shot(p,'01-first-offer');
  const r=await actor('first_auditions_reviewer','/auditions/reviews/'+offer.id);await r.locator('.business-actions').getByRole('button',{name:'独立核验试镜方案',exact:true}).click();await r.locator('#review-offer-decision').selectOption('APPROVE');await r.locator('#review-offer-reason').fill('独立合成演示检查');await agree(r);const reviewed=await post(r,'/reviews',()=>r.getByTestId('business-review-offer').click());assert.equal(reviewed.current_status,'PUBLISHED');await shot(r,'02-offer-published');
  const b=await actor('first_auditions_buyer','/auditions/catalog');assert((await b.locator('body').innerText()).includes('独立检查首次试镜'));await shot(b,'03-offer-buyer');
 });
 await run('first-stock',async()=>{
  const model=await api('stock_seller','/stock/listings/'+f.scenarios.stock_pending.listing_id),d=model.data,p=await actor('stock_seller','/stock/listings?action=listing');
  await choices(p,'listing-spec_id','已审核现货商品规格',d.spec_id);await choices(p,'listing-rule_id','生效业务规则',d.rule_id);await choices(p,'listing-seller_person_id','卖方明确对应的真人',d.seller_person_id);
  await p.getByRole('button',{name:'重新核对上架资格',exact:true}).click();await p.waitForLoadState('networkidle');
  for(const[k,v]of Object.entries({description:'独立检查首次网页上架',city:'郑州',payment_window_minutes:String(d.payment_window_minutes)}))await p.locator('#listing-'+k).fill(v);
  await shot(p,'04-listing-form');
  const fields=await p.locator('.business-form input,.business-form textarea,.business-form select').evaluateAll(es=>es.map(e=>({id:e.id,type:e.type,value:e.value,tag:e.tagName})));
  await writeFile(join(out,'stock-form-fields.json'),JSON.stringify({fields,model:{...d,participants:d.participants}},null,2));
  for(const[k,label]of [['file_id','已上传正式视频'],['preview_file_id','已上传不同的预览视频']])await choices(p,'listing-'+k,label,d[k]);
  await p.getByRole('button',{name:'读取可选权利依据',exact:true}).click();for(const id of d.rights_evidence_ids)await p.locator('label').filter({hasText:id}).locator('input[type=checkbox]').check();
  for(const person of d.participants){await p.getByRole('button',{name:'添加出镜人物',exact:true}).click();const n=d.participants.indexOf(person);for(const[k,label]of [['person_id','真实人物'],['avatar_id','具体数字人'],['consent_id','本次销售与展示授权']])await choices(p,'listing-participants-'+n+'-'+k,label,person[k])}
  await agree(p);const listing=await post(p,'/stock/listings',()=>p.getByTestId('business-listing').click());records.listing=listing.id;assert.equal(listing.current_status,'IN_REVIEW');await shot(p,'05-listing-created');
 });
 await run('stock-review-checkout',async()=>{
  const id='13fb03e0-2322-45be-8dfe-3e7062bed217',p=await actor('stock_reviewer','/stock/reviews/'+id);records.listing=id;
  for(const [key,label]of [['rights','独立审核销售权利'],['content','独立审核影片内容']]){
   await p.locator('.business-actions').getByRole('button',{name:label,exact:true}).click();await p.locator('#'+key+'-decision').selectOption('APPROVED');await p.locator('#'+key+'-reason').fill('独立测试：已检查合成素材内容和授权');for(const box of await p.locator('.business-form').last().locator('input[type=checkbox]').all())await box.check();const listing=await post(p,'/reviews',()=>p.getByTestId('business-'+key).click());if(key==='content')assert.equal(listing.current_status,'LISTED');
  }await shot(p,'12-stock-listed');
  const buyer=await actor('stock_buyer','/stock/catalog/'+id);await buyer.locator('.business-actions').getByRole('button',{name:'阅读许可并确认购买',exact:true}).click();await buyer.locator('#checkout-channel').selectOption('ALIPAY');await agree(buyer);const order=await post(buyer,'/stock/checkout',()=>buyer.getByTestId('business-checkout').click());records.stock_order=order.id;assert.equal(order.current_status,'OPEN');assert.equal(order.data.financial.received_minor,0);await shot(buyer,'13-stock-original-order');
 });
 await run('audition-booking-checkout',async()=>{
  const id='1bed101f-23e8-427a-9bf2-e9da44630059',p=await actor('first_auditions_buyer','/auditions/catalog');records.offer=id;
  await p.locator('.business-actions').getByRole('button',{name:'提出具体试镜预约',exact:true}).click();await choices(p,'booking-offer_id','已阅读的试镜方案',id);
  const before=await api('first_auditions_seller','/auditions/records/'+id),offer=before.data.offer||before.data;await writeFile(join(out,'audition-offer.json'),JSON.stringify(before,null,2));
  await p.locator('#booking-appointment-mode').selectOption('ONLINE_MATERIALS');for(const[k,v]of Object.entries({city:'郑州',venue:'隔离线上资料',address:'本机测试资料',purpose:'合成试镜安全用途'}))await p.locator('#booking-appointment-'+k).fill(v);
  const slot=offer.slots[0],local=v=>{const d=new Date(v);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16)};await p.locator('#booking-appointment-starts_at').fill(local(slot.starts_at));await p.locator('#booking-appointment-ends_at').fill(local(slot.ends_at));await agree(p);const booking=await post(p,'/auditions/bookings',()=>p.getByTestId('business-booking').click());records.booking=booking.id;await shot(p,'14-audition-booked');
  const r=await actor('first_auditions_reviewer','/auditions/reviews/'+booking.id);await r.locator('.business-actions').getByRole('button',{name:'独立核验预约安全',exact:true}).click();await r.locator('#review-booking-decision').selectOption('APPROVE');await r.locator('#review-booking-reason').fill('独立合成安全检查');for(const b of await r.locator('.business-form').last().locator('input[type=checkbox]').all())await b.check();const reviewed=await post(r,'/reviews',()=>r.getByTestId('business-review-booking').click());assert.equal(reviewed.current_status,'READY_TO_PAY');await shot(r,'15-audition-safe');
  await go(p,'/auditions/bookings/'+booking.id);await p.locator('.business-actions').getByRole('button',{name:'按已审预约确认原订单',exact:true}).click();await p.locator('#checkout-channel').selectOption('ALIPAY');await agree(p);const order=await post(p,'/auditions/checkout',()=>p.getByTestId('business-checkout').click());records.audition_order=order.id;assert.equal(order.current_status,'OPEN');assert.equal(order.data.financial.received_minor,0);await shot(p,'16-audition-original-order');
 });
 await run('first-cocreation-inspect',async()=>{
  const p=await actor('buyer','/operations/customization/mine/'+(process.env.DEMO_STORY||'new'));await shot(p,'06-new-story');
  let story;
  if(process.env.DEMO_STORY){story={id:process.env.DEMO_STORY};records.story=story.id}else{
  await p.locator('#story-category').selectOption({label:'合成故事 · 模板 1'});await p.locator('#story-answers-story').fill('独立测试：本人首次创建的家庭记忆故事，仅合成材料。');
  story=await post(p,'/customization-requests',()=>p.getByTestId('story-save').click());records.story=story.id;
  await p.getByRole('checkbox',{name:'我已核对保存的文字和故事问题，确认作为正式版本发送给平台。'}).check();story=await post(p,'/submissions',()=>p.getByTestId('story-submit').click());assert.equal(story.current_status,'SUBMITTED');}
  await p.getByRole('link',{name:'为这个故事发起共创',exact:true}).click();await p.waitForLoadState('networkidle');await shot(p,'07-room-options');
  await writeFile(join(out,'room-form-fields.json'),JSON.stringify(await p.locator('input,textarea,select').evaluateAll(es=>es.map(e=>({id:e.id,type:e.type,value:e.value,tag:e.tagName,options:e.options?[...e.options].map(x=>({value:x.value,text:x.text})):undefined}))),null,2));
  for(const id of ['room-producer_party_id','room-rule_id']){const values=await p.locator('#'+id+' option').evaluateAll(es=>es.map(e=>e.value).filter(Boolean));assert.equal(values.length,1);await p.locator('#'+id).selectOption(values[0]);}
  await p.locator('#room-title').fill('独立检查家庭共创');await p.locator('#room-purpose').fill('PRIVATE');await p.locator('#room-territory').fill('CN');const end=new Date(Date.now()+86400000);end.setMinutes(end.getMinutes()-end.getTimezoneOffset());await p.locator('#room-deadline').fill(end.toISOString().slice(0,16));await agree(p);
  const room=await post(p,'/cocreation/rooms',()=>p.getByTestId('business-room').click());records.room=room.id;assert.equal(room.current_status,'OPEN');assert(p.url().includes(room.id));await shot(p,'08-new-room');
  await p.locator('.business-actions').getByRole('button',{name:'邀请明确真人本人参加',exact:true}).click();await choices(p,'invite-person_id','明确被邀请真人',f.scenarios.cocreation.person_id);await agree(p);const invitation=await post(p,'/invitations',()=>p.getByTestId('business-invite').click());records.invitation=invitation.id;await shot(p,'09-invitation');
  const member=await actor('participant','/cocreation/invitations');assert((await member.locator('body').innerText()).includes('独立检查家庭共创'));await shot(member,'10-participant-invitation');
  await go(p,'/operations/customization/mine/'+story.id);await p.getByRole('link',{name:'为这个故事发起共创',exact:true}).click();await p.waitForLoadState('networkidle');assert.match(await p.locator('body').innerText(),/已.*房间|COCREATION_ROOM_EXISTS/);assert(await p.getByTestId('business-room').isDisabled());await shot(p,'11-duplicate-room-blocked');
 });
 await run('cocreation-duplicate-withdraw',async()=>{
  const p=await actor('buyer','/operations/customization/mine/f1fc4279-241b-4294-bfaa-591d60211fcf');await p.getByRole('link',{name:'为这个故事发起共创',exact:true}).click();await p.waitForURL('**/cocreation/rooms?**');await p.getByTestId('business-room').waitFor();await p.waitForLoadState('networkidle');assert.match(await p.locator('body').innerText(),/已.*房间|COCREATION_ROOM_EXISTS/);assert(await p.getByTestId('business-room').isDisabled());await shot(p,'17-duplicate-room-blocked');checks.push({name:'same-story-duplicate-room',result:'PASS'});
  const id=f.scenarios.cocreation.member_id,member=await actor('participant','/cocreation/members/'+id);await member.locator('.business-actions').getByRole('button',{name:'本人撤回本次参加',exact:true}).click();await member.locator('#withdraw-reason').fill('本人独立测试撤回，保留旧合同与其他成员资料');await agree(member);const withdrawn=await post(member,'/withdraw',()=>member.getByTestId('business-withdraw').click());assert.equal(withdrawn.current_status,'WITHDRAWN');records.withdrawn_member=id;await shot(member,'18-member-withdrawn');
  const room=await api('buyer','/cocreation/rooms/'+f.scenarios.cocreation.room_id);assert.equal(room.current_status,'PAUSED');records.paused_room=room.id;await go(p,'/cocreation/rooms/'+room.id);await shot(p,'19-room-paused');
 });
 await run('cocreation-withdraw-checked',async()=>{
  const open=await api('buyer','/cocreation/rooms/'+f.scenarios.cocreation.room_id);assert.equal(open.current_status,'OPEN');assert.equal(open.counts.eligible_count,0);records.open_room=open.id;
  const ready=f.scenarios.cocreation_ready,id=ready.member_id,p=await actor('participant','/cocreation/members/'+id);await p.locator('.business-actions').getByRole('button',{name:'本人撤回本次参加',exact:true}).click();await p.locator('#withdraw-reason').fill('独立测试：已成团后本人撤回，不授权继续下载');await agree(p);const withdrawn=await post(p,'/withdraw',()=>p.getByTestId('business-withdraw').click());assert.equal(withdrawn.current_status,'WITHDRAWN');records.withdrawn_member=id;
  const after=await api('buyer','/cocreation/rooms/'+ready.room_id);assert.equal(after.current_status,'PAUSED');records.paused_room=after.id;const host=await actor('buyer','/cocreation/rooms/'+after.id);await shot(host,'20-formed-room-paused');await shot(p,'21-formed-member-withdrawn');
 });
}finally{for(const c of contexts)await c.close();if(browser)await browser.close();if(web)await new Promise(r=>web.httpServer.close(r));await writeFile(join(out,'results-'+(process.env.DEMO_PHASE||'initial')+'.json'),JSON.stringify({synthetic_only:true,checks,issues,records,requests,current,limits:'Independent browser actions; fixture supplies existing permissions/materials/rules. No native or real providers.'},null,2));console.log(JSON.stringify({checks:checks.length,issues:issues.length,records}));}
