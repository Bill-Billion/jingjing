// Resume only the paid S1 notice order. Product routes and independent reviewers are used throughout.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {join,resolve,sep,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';

const root=process.cwd(), out=resolve(process.env.QA18_OUTPUT_DIR);
assert(out.startsWith(join(root,'.local','qa18')+sep));
await mkdir(out,{recursive:true});
const prior=JSON.parse(await readFile(process.env.QA18_NOTICE_CHECKPOINT,'utf8'));
const accessPath=resolve(process.env.V5_ACCESS_FILE);
const access=JSON.parse(await readFile(accessPath,'utf8'));
const environment=dirname(accessPath).split(sep).at(-1);
assert(access.synthetic_only&&new URL(access.base_url).hostname==='127.0.0.1'&&Date.parse(access.expires_at)>Date.now());
assert(prior.complete&&prior.environment===environment&&prior.final_order.current_status==='PAID');
const roles={seller:'notices_seller',buyer:'notices_buyer2',reviewer:'reviewer',outsider:'auditions_outsider'};
const account=role=>access.accounts[roles[role]];
assert.notEqual(account('seller').account_id,account('reviewer').account_id);
assert.notEqual(account('buyer').account_id,account('reviewer').account_id);
const target=join(out,'checkpoint.json'), orderId=prior.order.id;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
let state;
try{state=JSON.parse(await readFile(target,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;state={order_id:orderId,environment,requests:[],checks:[],commands:{},files:{},versions:{},accepted:{},attempts:[]};}
assert(state.order_id===orderId&&state.environment===environment&&!state.complete);
const attempt={source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),started_at:new Date().toISOString()};
state.attempts.push(attempt);
const save=()=>writeFile(target,JSON.stringify(state,null,2));
const done=async (name,details={})=>{state.checks.push({name,...details});await save();console.log('PASS '+name);};
async function api(role,route,{body,version,allowed=[200],slot,raw=false,acting=role!=='reviewer',verb}={}){
 const u=account(role), method=verb||(body===undefined?'GET':'POST');
 const headers={Authorization:'Bearer '+u.bearer_token,...(acting?{'X-Acting-Party':u.party_id}:{})};
 let payload;
 if(body!==undefined){
  payload=raw?body:JSON.stringify(body);
  const label=slot||route, fingerprint=hash(payload);
  const command=state.commands[label]??={key:randomUUID(),fingerprint,version,route,role};
  assert.equal(command.fingerprint,fingerprint);assert.equal(command.version,version);assert.equal(command.route,route);assert.equal(command.role,role);
  headers['Content-Type']=raw?'application/octet-stream':'application/json';headers['Idempotency-Key']=command.key;
  if(version!==undefined)headers['If-Match']='"'+version+'"';
  await save();
 }
 const r=await fetch(access.base_url+route,{method,headers,body:payload,signal:AbortSignal.timeout(20000)});
 const bytes=Buffer.from(await r.arrayBuffer());let j;
 if(r.headers.get('content-type')?.includes('json'))j=JSON.parse(bytes);
 state.requests.push({method,role,route,status:r.status,code:j?.error?.code,bytes:bytes.length,sha256:hash(bytes)});await save();
 assert(allowed.includes(r.status),route+' '+r.status+' '+j?.error?.code);
 return j?.data??bytes;
}
const {chromium}=createRequire(join(root,'晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'))('playwright-core');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
async function page(role,path,surface='vue'){
 const c=await browser.newContext({viewport:surface==='app'?{width:590,height:2400}:{width:1450,height:1080},locale:'zh-CN',timezoneId:'Asia/Shanghai',acceptDownloads:true});
 if(surface==='vue')await c.addInitScript(({token,party})=>{sessionStorage.setItem('ops.session.token',token);sessionStorage.setItem('ops.session.selected',party);},{token:account(role).bearer_token,party:account(role).party_id});
 const p=await c.newPage();p.setDefaultTimeout(17000);await p.goto(surface==='app'?'http://127.0.0.1:5500/?fixtureRole='+roles[role]+'#'+path:'http://127.0.0.1:5173'+path);
 if(surface==='app'){const semantics=p.locator('flt-semantics-placeholder');await semantics.waitFor({state:'attached'});await semantics.evaluate(e=>e.click());}
 await p.waitForLoadState('networkidle');return p;
}
const snap=(p,n)=>p.screenshot({path:join(out,n+'.png'),fullPage:true});
async function browserPost(p,path,action){
 const wait=p.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/v1'+path);
 wait.catch(()=>{});await action();const r=await wait, bytes=await r.body(), j=JSON.parse(bytes);
 state.requests.push({method:'POST',surface:'browser',route:path,status:r.status(),code:j.error?.code,sha256:hash(bytes)});await save();
 assert.equal(r.status(),200,path+' '+j.error?.code);return j.data;
}
const button=(p,name)=>p.getByRole('button',{name,exact:true});
const reason='隔离合成资料，核对本笔原商单、来源、用途和材料。';
const script=Buffer.from('仅供隔离验收的合成原创剧本。镜头一：蓝色方块进入白色画面。镜头二：方块停下，出现“合成测试”标记。无真人、他人作品或真实商标。','utf8');
const rights=Buffer.from('合成原创权利说明。原商单 '+orderId+'。本说明与剧本只用于本机机测，未授权真实发布。','utf8');
let phase='same-paid-order';
try{
 const order=await api('seller','/trade/records/'+orderId);
 assert.equal(order.id,prior.final_order.id);assert.deepEqual(order.data.contract,prior.final_order.data.contract);
 assert.equal(order.merchant_party_id,account('seller').party_id);assert.equal(order.buyer_party_id,account('buyer').party_id);
 assert.deepEqual(order.data.financial,state.final_order?.data.financial||{received_minor:10001,refunded_minor:0,net_minor:10001});
 const line=order.data.quote.lines.find(l=>l.line_id==='commercial');assert.equal(line.line_kind,'PRODUCTION');assert.equal(line.provider_party_id,account('seller').party_id);assert.equal(order.data.quote.license_reservation_id,null);
 const offer=await api('seller','/gigs/records/'+order.data.quote.commercial.offer_id);
 const consent=await api('seller','/supply/records/'+offer.data.consent_id);
 const rightsScope=consent.data.consent;
 assert.equal(consent.current_status,'APPROVED');assert.equal(rightsScope.avatar_id,offer.data.avatar_id);
 assert(rightsScope.purposes.includes('COMMERCIAL')&&rightsScope.territories.includes('CN')&&Date.parse(rightsScope.valid_from)<=Date.now()&&Date.parse(rightsScope.valid_until)>Date.now());
 if(!state.origin){state.origin={order_id:order.id,contract_sha256:order.data.contract.content_sha256,offer_id:offer.id,consent_id:consent.id,producer_party_id:line.provider_party_id};await done('original-contract-supplier-and-authorized-scope-verified',state.origin);}
 phase='review-original-synthetic-script';
 const upload=(purpose,body,slot)=>api('seller','/supply/assets?purpose='+purpose+'&media_type=text%2Fplain',{body,raw:true,slot});
 if(!state.script_file){state.script_file=await upload('WORK_CONTENT',script,'script-source');await save();}
 if(!state.rights_file){state.rights_file=await upload('RIGHTS_EVIDENCE',rights,'script-evidence');await save();}
 if(!state.profile){
  const profiles=await api('seller','/supply/records?kind=PROFILE&limit=100');
  assert.equal(profiles.next_cursor,null);
  const latest=profiles.items.sort((a,b)=>b.revision-a.revision)[0];
  state.profile=latest?.current_status==='APPROVED'||latest?.current_status==='PENDING_REVIEW'?latest:await api('seller','/supply/profiles',{body:{display_name:'S1原商单合成制作方',description:'该原供给主体的隔离合成剧本制作，只用于本地机测。',evidence_asset_ids:[state.rights_file.id],previous_profile_id:latest?.id??null}});
  await save();
 }
 if(state.profile.current_status==='PENDING_REVIEW'){
  const file=await api('reviewer','/supply/assets/'+state.rights_file.id+'/content');assert.equal(hash(file),hash(rights));
  state.profile=await api('reviewer','/supply/profiles/'+state.profile.id+'/reviews',{version:state.profile.object_version,body:{decision:'APPROVED',reason}});
  assert.equal(state.profile.current_status,'APPROVED');await done('original-supplier-profile-approved-by-independent-reviewer',{profile_id:state.profile.id});
 }
 if(!state.work){const evidence=[state.rights_file.id];state.work=await api('seller','/supply/work-versions',{body:{work_id:null,previous_version_id:null,title:'S1原商单合成原创短片',kind:'ORIGINAL',source_version_id:null,project_id:null,content_asset_id:state.script_file.id,evidence_ids:evidence,credits:[{party_id:account('seller').party_id,role:'RIGHTS_HOLDER',evidence_asset_ids:evidence}]}});await save();}
 if(!state.work_submitted){state.work=await api('seller','/supply/work-versions/'+state.work.id+'/actions',{version:state.work.object_version,body:{action:'SUBMIT',reason:null}});state.work_submitted=true;await save();}
 state.work_reviews??={};
 for(const channel of ['RIGHTS','CONTENT']){
  if(state.work_reviews[channel])continue;
  const file=channel==='RIGHTS'?state.rights_file:state.script_file, expected=channel==='RIGHTS'?rights:script;
  const actual=await api('reviewer','/supply/assets/'+file.id+'/content');
  assert.equal(hash(actual),hash(expected));
  state.work=await api('reviewer','/supply/work-versions/'+state.work.id+'/reviews',{version:state.work.object_version,slot:'script-'+channel,body:{channel,decision:'APPROVED',reason}});
  state.work_reviews[channel]=state.work.object_version;await done('actual-script-material-read-and-reviewed-'+channel,{work_id:state.work.id,file_id:file.id,sha256:hash(actual)});
 }
 assert.equal(state.work.current_status,'REVIEWS_COMPLETE');assert.equal(state.work.owner_party_id,account('seller').party_id);
 phase='project';
 if(!state.project){
   state.project=await api('seller','/production/projects',{body:{order_id:orderId,line_id:'commercial',script_version_id:state.work.id,license_project_id:null,assignee_account_id:account('seller').account_id,purpose:'COMMERCIAL',territory:'CN',consent_ids:[consent.id],evidence_asset_id:state.rights_file.id}});
   await save();
 }
 // The V5 project's current-authorization gate is separate from the original commercial consent.
 if(state.attempts.some(a=>a.error?.includes('ARTIST_CONSENT_REQUIRED'))){
  phase='independent-current-production-authorization';
  const personId=prior.submission.data.submission.person_id, base='/artists/people/'+personId;
  const person=await api('seller',base);assert.equal(person.person.id,personId);
  assert.equal(person.person.owner_party_id,account('seller').party_id);
  assert(person.avatars.some(x=>x.id===offer.data.avatar_id));
  const proof=Buffer.from('仅隔离机测，本人确认同一原商单 '+orderId+' 的合成形象和本次制作主体。测试权限单独登记，不扩展原商业合同或真实用途。','utf8');
  if(!state.production_consent_proof){state.production_consent_proof=await upload('CONSENT_EVIDENCE',proof,'artist-production-authorization');await save();}
  if(!state.generation_consent){
   state.generation_terms??={features:rightsScope.features,purposes:['NEW_GENERATION'],grantee_party_id:line.provider_party_id,territories:['CN'],valid_from:new Date(Date.now()-1000).toISOString(),valid_until:new Date(Math.min(Date.now()+7200000,Date.parse(access.expires_at))).toISOString(),terms:'仅同一原商单隔离合成制作机测。'+orderId,evidence_asset_ids:[state.production_consent_proof.id]};
   await save();
   state.generation_consent=await api('seller',base+'/consents',{body:{avatar_id:offer.data.avatar_id,consent:state.generation_terms}});await save();
  }
  if(state.generation_consent.current_status==='SUBMITTED'){
   const consentPath=base+'/records/'+state.generation_consent.id;
   const actual=await api('reviewer',consentPath+'/assets/'+state.production_consent_proof.id+'/content');assert.equal(hash(actual),hash(proof));
   state.generation_consent=await api('reviewer',consentPath+'/reviews',{version:state.generation_consent.object_version,body:{decision:'APPROVE',reason}});
   assert.equal(state.generation_consent.current_status,'APPROVED');await done('original-performer-limited-current-authorization-independently-reviewed',{consent_id:state.generation_consent.id,valid_until:state.generation_terms.valid_until});
  }
  if(!state.hosting){
   const service=await api('seller',base+'/free-services',{body:{avatar_id:offer.data.avatar_id,kind:'AVATAR_HOSTING',rule_version:'CONTRACT_20261029'}});
   assert.equal(service.data.price_minor,0);assert.equal(service.current_status,'DELIVERED');state.hosting=service;await done('same-avatar-normal-zero-charge-hosting',{service_id:service.id});
  }
 }
 phase='project';
 if(state.project.current_status==='IN_REVIEW'){
   const p=await page('reviewer','/production/reviews/projects/'+state.project.id);
   await p.getByTestId('production-read-evidence').click();
   await p.getByTestId('production-contract-hash').fill(state.origin.contract_sha256);
   for(const k of ['identity','signatures','rights'])await p.getByTestId('production-check-'+k).check();
   await p.getByTestId('production-review-decision').selectOption('APPROVED');await p.getByTestId('production-review-reason').fill(reason);
   state.project=await browserPost(p,'/production/records/'+state.project.id+'/reviews',()=>p.getByTestId('production-review-submit').click());
   await done('vue-independently-approves-project-on-original-order',{project_id:state.project.id});await snap(p,'vue-project-reviewed');await p.context().close();
 }
 for(const stage of ['SCRIPT','SAMPLE','ROUGH_CUT','FINAL']){
   phase=stage;
   let version=state.versions[stage];
   const mediaType=stage==='SCRIPT'?'text/plain':'video/mp4';
   const checklist=stage==='SCRIPT'?{script_reviewed:true}:{script_reviewed:true,specification_reviewed:true,audio_reviewed:true,branding_reviewed:true};
   if(!version){
     const files=state.files[stage]??=[];
     for(let i=files.length;i<2;i++){
       const body=stage==='SCRIPT'?script:await readFile(join(root,'.local/v5-r05-r12-media',i?'preview.mp4':'full.mp4'));
       files.push(await api('seller','/production/projects/'+state.project.id+'/files?media_type='+encodeURIComponent(mediaType),{body,raw:true,slot:stage+'-upload-'+i}));await save();
     }
     const latest=await api('seller','/production/records/'+state.project.id);
     version=state.versions[stage]=await api('seller','/production/projects/'+state.project.id+'/versions',{version:latest.object_version,slot:stage+'-submit',body:{stage,file_id:files[0].id,preview_file_id:files[1].id,note:reason}});await save();
   }
   if(version.current_status==='IN_REVIEW'){
     const p=await page('reviewer','/production/reviews/versions/'+version.id);
     await p.getByTestId('production-read-preview').click();
     if(stage==='SCRIPT')await p.locator('.production-text-preview').waitFor();else await p.waitForFunction(()=>document.querySelector('video')?.readyState>=2);
     for(const k of stage==='SCRIPT'?['script']:['script','specification','audio','branding'])await p.getByTestId('production-check-'+k).check();
     await p.getByTestId('production-review-decision').selectOption('APPROVED');await p.getByTestId('production-review-reason').fill(reason);
     version=state.versions[stage]=await browserPost(p,'/production/records/'+version.id+'/reviews',()=>p.getByTestId('production-review-submit').click());
     await done('vue-independently-approved-'+stage,{version_id:version.id});await p.context().close();
   }
   if(!state.accepted[stage]){
     const preview=await api('buyer','/production/versions/'+version.id+'/content?variant=preview');
     assert(preview.length>0);
     const p=await page('buyer','/production/version?versionId='+version.id,'app');
     if(stage==='SCRIPT'){
       await button(p,'完整阅读').click();await button(p,'返回审阅').click();await p.getByRole('checkbox',{name:'我已完整阅读本版剧本。',exact:true}).click();
     }else{
       await button(p,'播放预览').click();await p.waitForFunction(()=>document.querySelector('video')?.readyState>=2);
       for(const name of ['剧本内容','交付规格','声音','内容标识'])await p.getByRole('checkbox',{name,exact:true}).click();
       await button(p,'本版确认与修改意见').click();await button(p,'确认本版').click();
     }
     const box=p.getByRole('textbox',{name:/确认说明/});await box.click();await p.keyboard.insertText('本人已实际核对本版隔离合成材料。');
     state.accepted[stage]=await browserPost(p,'/production/versions/'+version.id+'/feedback',async()=>{await button(p,stage==='SCRIPT'?'确认这版剧本':'提交本版确认').click();await button(p,'确认办理').click();});assert.equal(state.accepted[stage].data.decision,'ACCEPT');
     await done('app-buyer-accepts-'+stage,{version_id:version.id,feedback_id:state.accepted[stage].id,preview_sha256:hash(preview)});await p.context().close();
   }
 }
 phase='original-final-file';
 if(!state.delivery){
  const project=await api('buyer','/production/records/'+state.project.id),version=state.versions.FINAL;
  assert.equal(project.current_status,'ACCEPTED');
  const bytes=await api('buyer','/production/versions/'+version.id+'/content?variant=final');
  assert(bytes.length>1000);await api('outsider','/production/versions/'+version.id+'/content?variant=final',{allowed:[403,404]});
  state.delivery={project_id:project.id,version_id:version.id,bytes:bytes.length,sha256:hash(bytes)};await done('same-order-final-file-and-unrelated-account-denied',state.delivery);
 }
 phase='same-payment-refund';
 const paymentId=prior.payment.id, payment=await api('buyer','/trade/records/'+paymentId);
 assert.equal(payment.order_id,orderId);assert.equal(payment.current_status,'SUCCEEDED');
 if(!state.refund){state.refund=await api('buyer','/trade/refunds',{body:{payment_id:paymentId,allocations:[{line_id:'commercial',amount_minor:3001}],reason:'同一商单交付后合成部分退款'}});await save();}
 if(['IN_REVIEW','REQUESTED'].includes(state.refund.current_status)){state.refund=await api('reviewer','/trade/records/'+state.refund.id+'/reviews',{version:state.refund.object_version,body:{decision:'APPROVED',reason}});await save();}
 if(!state.execution){state.execution=await api('reviewer','/trade/refunds/'+state.refund.id+'/execution',{version:state.refund.object_version,body:{}});await save();}
 if(!state.reconciled){
  await api('buyer','/testing/payments/outcome',{body:{record_id:state.refund.id,state:'SUCCEEDED'}});
  state.reconciled=await api('buyer','/trade/refunds/'+state.refund.id+'/reconciliation',{body:{}});assert.equal(state.reconciled.current_status,'SUCCEEDED');await save();
 }
 const final=await api('buyer','/trade/records/'+orderId);
 assert.deepEqual(final.data.contract,order.data.contract);
 assert.deepEqual(final.data.financial,{received_minor:10001,refunded_minor:3001,net_minor:7000});
 state.final_order=final;state.complete=true;attempt.result='PASS';await done('original-order-partial-refund-and-contract-unchanged',{refund_id:state.refund.id,financial:final.data.financial});
}catch(e){attempt.result='FAIL';attempt.phase=phase;attempt.error=e.message;await save();for(const [i,c] of browser.contexts().entries())for(const [j,p] of c.pages().entries())await snap(p,'failure-'+state.attempts.length+'-'+i+'-'+j).catch(()=>{});console.error(phase+': '+e.message);process.exitCode=1;}
finally{attempt.finished_at=new Date().toISOString();await save();await browser.close();}
