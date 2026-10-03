 'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes,createHash}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
const {createPartyRepository}=require('../src/modules/party/repository'),{createAuthRepository}=require('../src/modules/auth/repository');
const {createSupplyRepository}=require('../src/modules/works/repository'),{createSupplyAssets}=require('../src/modules/works/assets');
const {maintainOperatorGrant}=require('../src/modules/governance/operator-access'),{createAccountApi}=require('../src/http/account-api');
const {createTradeRepository}=require('../src/modules/trade/repository'),{createRuleContent,digest}=require('../src/modules/governance/content');
const {productionPaymentGate}=require('../src/modules/production/payment-gate');
test('finance actual HTTP: separately verified receipts, accrual, payouts and corrections',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));assert.equal(env.NODE_ENV,'test');assert.equal(env.MYSQL_HOST,'127.0.0.1');assert.equal(env.MYSQL_DATABASE,'jx_dev');
 const name=`jx_test_${process.pid}_${randomBytes(6).toString('hex')}`,control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;
 try{
 await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await t.test('existing stage 7 and stage 8 schemas upgrade in order without rewriting applied migrations',async()=>{
 const source=path.resolve(__dirname,'../migrations/mysql-runtime'),root=path.resolve(__dirname,'../../../..','.local'),directory=await fs.mkdtemp(path.join(root,'project-upgrade-'));const copied=[];
 try{const names=(await fs.readdir(source)).filter(x=>x.endsWith('.sql')).sort();for(const boundary of ['0068']){for(const name of names.filter(n=>n.slice(0,4)<=boundary&&!copied.includes(n))){await fs.copyFile(path.join(source,name),path.join(directory,name));copied.push(name);}await migrate(db,{directory});const [rows]=await db.execute("SELECT MAX(version) AS version FROM platform_schema_migrations WHERE status='APPLIED'");assert.equal(rows[0].version,boundary);}await migrate(db);const [rows]=await db.execute("SELECT MAX(version) AS version FROM platform_schema_migrations WHERE status='APPLIED'");assert.equal(rows[0].version,names.at(-1).slice(0,4));await migrate(db);
 }finally{for(const name of copied)await fs.unlink(path.join(directory,name));await fs.rmdir(directory);}
 });
 const principals=new Map(),resolvePrincipal=async ctx=>principals.get(ctx),parties=createPartyRepository(db,{resolvePrincipal}),secret=randomBytes(32).toString('base64'),auth=createAuthRepository(db,{secret}),supply=createSupplyRepository(db,{resolvePrincipal,verifyProjectSource:require('../src/modules/licensing/repository').validBinding}),trade=createTradeRepository(db,{resolvePrincipal,fulfillmentGate:productionPaymentGate});
 const people=[];for(const label of ['producer','buyer','reviewer','outsider','stranger']){const ctx={};principals.set(ctx,{subject_ref:'synthetic:'+key()});const p={ctx,...await parties.registerAccount(ctx,{display_name:label}),token:randomBytes(32).toString('base64url')};people.push(p);await db.execute('INSERT INTO auth_sessions(token_hash,account_id,expires_ms) VALUES (?,?,ROUND(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000)+3600000)',[auth.secure.digest('token',p.token),p.account_id]);}
 const [producer,buyer,reviewer,outsider,stranger]=people;for(const person of [reviewer,producer])for(const action of ['FINANCE_REVIEW','TRADE_REFUND','PROJECT_REVIEW','TRADE_REVIEW','PRODUCTION_REVIEW','SUPPLY_REVIEW_PROFILE','SUPPLY_REVIEW_RIGHTS','SUPPLY_REVIEW_CONTENT','SUPPLY_REVIEW_CONSENT'])await maintainOperatorGrant(db,{account_id:person.account_id,action,enabled:true,expires_at:null,expected_version:0,authority_ref:'synthetic:test',reason:'isolated test'});
 let holdUpload=null;const files=new Map(),storageFactory=()=>({async put({key,body}){if(holdUpload)await holdUpload();files.set(key,Buffer.from(body));return {key,size:body.length,sha256:createHash('sha256').update(body).digest('hex')};},async getBuffer(key){return files.get(key);}}),assets=createSupplyAssets({db,repository:supply,storageFactory});
 const upload=purpose=>assets.upload(producer.ctx,{party_id:producer.personal_party_id,purpose,media_type:'text/plain',body:Buffer.from('synthetic '+purpose),operation_key:key()});
 const proof=await upload('RIGHTS_EVIDENCE'),script=await upload('WORK_CONTENT'),avatarMaterial=await upload('AVATAR_MATERIAL'),consentEvidence=await upload('CONSENT_EVIDENCE');const avatar=await supply.createAvatar(producer.ctx,{party_id:producer.personal_party_id,display_name:'synthetic',material_asset_ids:[avatarMaterial.id],operation_key:key()});let consent=await supply.createConsent(producer.ctx,{consent:{avatar_id:avatar.id,subject_party_id:producer.personal_party_id,features:['FACE'],purposes:['PRIVATE','AI_TRAIN','PUBLIC_SHARE','RELEASE'],territories:['CN'],valid_from:'2020-01-01T00:00:00.000Z',valid_until:'2099-01-01T00:00:00.000Z',terms:'Synthetic consent',evidence_asset_ids:[consentEvidence.id]},operation_key:key()});consent=await supply.reviewConsent(reviewer.ctx,{record_id:consent.id,expected_version:1,decision:'APPROVED',reason:'synthetic',operation_key:key()});let profile=await supply.createProfile(producer.ctx,{party_id:producer.personal_party_id,display_name:'synthetic',description:'synthetic',evidence_asset_ids:[proof.id],previous_profile_id:null,operation_key:key()});await supply.reviewProfile(reviewer.ctx,{record_id:profile.id,expected_version:1,decision:'APPROVED',reason:'synthetic',operation_key:key()});
 let work=await supply.createVersion(producer.ctx,{party_id:producer.personal_party_id,work_id:null,previous_version_id:null,title:'Synthetic original',kind:'ORIGINAL',source_version_id:null,project_id:null,content_asset_id:script.id,evidence_ids:[proof.id],credits:[{party_id:producer.personal_party_id,role:'RIGHTS_HOLDER',evidence_asset_ids:[proof.id]}],operation_key:key()});work=await supply.changeVersion(producer.ctx,{party_id:producer.personal_party_id,record_id:work.id,expected_version:1,action:'SUBMIT',reason:null,operation_key:key()});for(const channel of ['RIGHTS','CONTENT'])work=await supply.reviewVersion(reviewer.ctx,{record_id:work.id,expected_version:work.object_version,channel,decision:'APPROVED',reason:'synthetic',operation_key:key()});
 const ruleId=key(),rule=createRuleContent({id:ruleId,rule_key:'production.test',version:'1',terms:{explicit:'synthetic only'}});await db.execute('INSERT INTO governance_rules(id,rule_key,version_label,content_json,effective_at,created_by,current_status) VALUES (?,?,?,?,?,?,?)',[ruleId,'production.test','1',JSON.stringify(rule),'2020-01-01 00:00:00',producer.account_id,'EFFECTIVE']);
 const reviewTrade=r=>trade.review(reviewer.ctx,{record_id:r.id,expected_version:r.object_version,decision:'APPROVED',reason:'synthetic',operation_key:key()});
 const spec=await reviewTrade(await trade.createSpec(producer.ctx,{party_id:producer.personal_party_id,previous_spec_id:null,title:'Synthetic production',provider_party_id:producer.personal_party_id,line_kind:'PRODUCTION',unit_minor:10000,currency:'CNY',specification:{version:'1',service_tier:'test',sample_seconds:20,final_seconds:90,revision_limit:2,deliverables:['Synthetic film with reviewed script audio and marks'],terms:'synthetic terms'},operation_key:key()}));
 const quote=await reviewTrade(await trade.quote(producer.ctx,{party_id:producer.personal_party_id,buyer_party_id:buyer.personal_party_id,lines:[{line_id:'film',spec_id:spec.id,quantity:1}],installments:[{key:'first',trigger:'ORDER_ACCEPTED',allocations:[{line_id:'film',amount_minor:4000}],apple_product_id:null},{key:'last',trigger:'FINAL_ACCEPTED',allocations:[{line_id:'film',amount_minor:6000}],apple_product_id:null}],channel:'ALIPAY',transaction_model:'DIRECT_SUPPLIER',rule_id:ruleId,expires_at:'2099-01-01T00:00:00.000Z',payment_window_minutes:30,license_reservation_id:null,operation_key:key()}));
 const order=await trade.accept(buyer.ctx,{record_id:quote.id,party_id:buyer.personal_party_id,expected_version:quote.object_version,quote_sha256:quote.content_sha256,operation_key:key()}),config={provider:'ALIPAY',environment:'SANDBOX',app_id:'test.app',merchant_id:'test.merchant',merchant_party_id:producer.personal_party_id,config_revision:'test'};
 async function pay(step){const p=await trade.preparePayment(buyer.ctx,{party_id:buyer.personal_party_id,order_id:order.id,installment_key:step,operation_key:key()},config);await trade.applyPayment({...config,payment_id:p.id,currency:'CNY',amount_minor:p.data.amount_minor,transaction_id:'test.'+p.id,status:'SUCCEEDED',product_id:null,app_account_token:null});return p;}
 let enabled=false,submits=0,queries=0;const upstream=new Map(),provider={async descriptor(){return {provider_code:'synthetic.long-lived',environment:'SANDBOX',config_revision:'test'};},async assertReady(){if(!enabled)throw Error('not configured');},async readiness(){return {current_status:enabled?'SERVICE_READY':'NOT_ENABLED',reason_code:enabled?null:'PROVIDER_NOT_IMPLEMENTED',...await this.descriptor()};},async submit(input){submits++;upstream.set(input.request_key,input);return {request_key:input.request_key,status:'PENDING',task_id:'task.'+input.request_key};},async query(input){queries++;assert.ok(upstream.has(input.request_key));return {request_key:input.request_key,status:'SUCCEEDED',asset_type:'LONG_LIVED_AVATAR',asset_ref:'synthetic.asset',result_ref:'synthetic.result',deleted:true};}};
 let privateConsent=await supply.createConsent(producer.ctx,{consent:{...consent.data.consent,purposes:['PRIVATE']},operation_key:key()});privateConsent=await supply.reviewConsent(reviewer.ctx,{record_id:privateConsent.id,expected_version:1,decision:'APPROVED',reason:'synthetic private production only',operation_key:key()});
 server=createAccountApi({db,secret,supplyStorageFactory:storageFactory,productionProviderFactory:()=>provider}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1/production',fixtures=[];
 async function api(method,url,person=producer,body,party=person?.personal_party_id,headers={}){const r=await fetch(base+url,{method,headers:{...(person?{Authorization:'Bearer '+person.token}:{}),...(party?{'X-Acting-Party':party}:{}),...(method==='POST'?{'Content-Type':Buffer.isBuffer(body)?'application/octet-stream':'application/json','Idempotency-Key':key()}:{}),...headers},...(body===undefined?{}:{body:Buffer.isBuffer(body)?body:JSON.stringify(body)})});return {status:r.status,body:(r.headers.get('content-type')||'').includes('application/json')?await r.json():Buffer.from(await r.arrayBuffer())};}
 const productionTake=(r,schema='ProductionRecordResponse')=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body.data;};
 const get=id=>api('GET','/records/'+id).then(productionTake);
 const checks=stage=>stage==='SCRIPT'?{script_reviewed:true}:{script_reviewed:true,specification_reviewed:true,audio_reviewed:true,branding_reviewed:true};
 let project,scriptV,sample,final,first;
 const projectInput={order_id:order.id,line_id:'film',script_version_id:work.id,license_project_id:null,assignee_account_id:producer.account_id,purpose:'PRIVATE',territory:'CN',consent_ids:[privateConsent.id],evidence_asset_id:proof.id};
 async function review(row){return productionTake(await api('POST','/records/'+row.id+'/reviews',reviewer,{decision:'APPROVED',reason:'synthetic manual review',verification:row.kind==='PROJECT'?{contract_sha256:row.data.contract_sha256,identity_verified:true,signatures_verified:true,rights_verified:true}:checks(row.data.stage)},null,{'If-Match':'"'+row.object_version+'"'}));}
 async function uploadFile(stage,text){return productionTake(await api('POST','/projects/'+project.id+'/files?media_type='+encodeURIComponent(stage==='SCRIPT'?'text/plain':'video/mp4'),producer,Buffer.from(text)));}
 async function deliver(stage){const f=await uploadFile(stage,'synthetic unverified media '+key()),preview=stage==='FINAL'?await uploadFile(stage,'synthetic preview '+key()):f,p=await get(project.id);return review(productionTake(await api('POST','/projects/'+p.id+'/versions',producer,{stage,file_id:f.id,preview_file_id:preview.id,note:'synthetic delivery'},producer.personal_party_id,{'If-Match':'"'+p.object_version+'"'})));}
 async function accept(v,decision='ACCEPT'){return productionTake(await api('POST','/versions/'+v.id+'/feedback',buyer,{decision,note:'synthetic review',checklist:decision==='ACCEPT'?checks(v.data.stage):null},buyer.personal_party_id,{'If-Match':'"'+v.object_version+'"'}));}

 // Build a real paid production through public HTTP; upstream media/payments remain synthetic.
 project=productionTake(await api('POST','/projects',producer,projectInput));project=await review(project);first=await pay('first');scriptV=await deliver('SCRIPT');await accept(scriptV);sample=await deliver('SAMPLE');await accept(sample);await accept(await deliver('ROUGH_CUT'));final=await deliver('FINAL');await accept(final);await pay('last');
 const buyerProof=await assets.upload(buyer.ctx,{party_id:buyer.personal_party_id,purpose:'RIGHTS_EVIDENCE',media_type:'text/plain',body:Buffer.from('synthetic release rights'),operation_key:key()});
 const root=base.replace('/production','/projects');
 async function call(method,url,person=buyer,body,party=person?.personal_party_id,headers={}){const r=await fetch(root+url,{method,headers:{...(person?{Authorization:'Bearer '+person.token}:{}),...(party?{'X-Acting-Party':party}:{}),...(method==='POST'?{'Content-Type':'application/json','Idempotency-Key':key()}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:(r.headers.get('content-type')||'').includes('application/json')?await r.json():Buffer.from(await r.arrayBuffer())};}
 const take=(r,schema='ProjectRecordResponse')=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body.data;};
 const read=(r,person=buyer,party=person.personal_party_id)=>call('GET','/records/'+(r.id||r),person,undefined,party).then(take);
 const post=(url,row,body,person=buyer,party=person.personal_party_id,headers={})=>call('POST',url,person,body,party,{'If-Match':'"'+row.object_version+'"',...headers});
 const decision=(row,act,person=buyer)=>post('/candidates/'+row.id+'/decisions',row,{decision:act,content_sha256:row.content_sha256,reason:'synthetic explicit decision'},person);
 const verification=kind=>Object.fromEntries(require('../src/modules/projects/release').APPROVAL_CHECKS[kind].map(k=>[k,true]));
 const rev=(row,decision='APPROVED',person=reviewer)=>post('/records/'+row.id+'/reviews',row,{decision,reason:'synthetic independent evidence review',verification:verification(row.kind)},person,null);
 const confirm=(row,person)=>post('/records/'+row.id+'/confirmations',row,{content_sha256:row.content_sha256,decision:'APPROVED',reason:'synthetic version confirmation'},person);
 const target={purpose:'RELEASE',territory:'CN',language:'zh',valid_until:'2090-01-01T00:00:00.000Z'};

 // Finance uses genuine module transactions and HTTP-created project/release records.
 // Storage, payment observations and external publication evidence are synthetic in this isolated DB.
 let film=take(await call('POST','/projects',buyer,{title:'Synthetic finance project',scope:target}));
 const role=take(await post('/projects/'+film.id+'/roles',film,{title:'Synthetic cast',capacity:1,pricing:'FIXED',amount_minor:0,terms:'Explicit test zero'}));let candidate=take(await post('/roles/'+role.id+'/applications',role,{avatar_id:avatar.id,consent_id:consent.id,amount_minor:0,note:'synthetic'},producer));candidate=take(await decision(candidate,'SELECT'));take(await decision(candidate,'CONFIRM',producer));film=await read(film);
 const planInput={production_project_id:project.id,rights:require('../src/modules/projects/policy').LAYERS.map(layer=>({layer,holder_party_id:producer.personal_party_id,evidence_asset_id:buyerProof.id,purpose:target.purpose,territory:target.territory,valid_until:target.valid_until,terms:'synthetic '+layer})),confirmers:[{party_id:producer.personal_party_id,responsibility:'rights',after_party_ids:[]},{party_id:buyer.personal_party_id,responsibility:'sponsor',after_party_ids:[producer.personal_party_id]}],funding:[],terms:'synthetic finance source'};
 let plan=take(await post('/projects/'+film.id+'/plans',film,planInput));plan=take(await rev(plan));take(await confirm(plan,producer));take(await confirm(plan,buyer));film=await read(film);film=take(await post('/projects/'+film.id+'/start',film,{}));
 let edition=take(await post('/projects/'+film.id+'/editions',film,{final_version_id:final.id,material_asset_ids:[buyerProof.id],note:'synthetic edition'}));edition=take(await rev(edition));take(await confirm(edition,producer));take(await confirm(edition,buyer));
 let channel=take(await call('POST','/channels',producer,{name:'Synthetic channel',channel_reference:'synthetic:finance',submission_requirements:'synthetic only',evidence_asset_id:proof.id}));channel=take(await rev(channel));film=await read(film);
 let release=take(await post('/projects/'+film.id+'/releases',film,{channel_id:channel.id,prior_release_id:null,material_asset_ids:[buyerProof.id],note:'synthetic release'}));release=take(await rev(release));
 for(const outcome of ['SUBMITTED','PUBLISHED']){const event=take(await post('/releases/'+release.id+'/external-events',release,{outcome,external_reference:'synthetic:'+key(),occurred_at:'2020-01-01T00:00:00.000Z',evidence_asset_id:buyerProof.id,note:'synthetic external evidence'}));take(await rev(event));release=await read(release);}
 const platformProof=await assets.upload(outsider.ctx,{party_id:outsider.personal_party_id,purpose:'RIGHTS_EVIDENCE',media_type:'text/plain',body:Buffer.from('synthetic bank destination'),operation_key:key()});
 const financeRoot=root.replace('/projects','/finance'),requests=[];
 async function fc(method,url,person=producer,body,party=person?.personal_party_id,headers={}){const response=await fetch(financeRoot+url,{method,headers:{...(person?{Authorization:'Bearer '+person.token}:{}),...(party?{'X-Acting-Party':party}:{}),...(method==='POST'?{'Content-Type':'application/json','Idempotency-Key':key()}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});const result={status:response.status,body:(response.headers.get('content-type')||'').includes('application/json')?await response.json():Buffer.from(await response.arrayBuffer())};if(response.status===200&&method==='POST')requests.push({url,body});return result;}
 const ft=(r,schema='FinanceRecordResponse')=>{assert.equal(r.status,200,JSON.stringify(r.body));fixtures.push({schema,value:r.body});return r.body.data;};
 const fp=(url,row,body,person=producer,party=person?.personal_party_id,headers={})=>fc('POST',url,person,body,party,{'If-Match':'"'+row.object_version+'"',...headers});
 const fr=(r,p=producer,party=p.personal_party_id)=>fc('GET','/records/'+(r.id||r),p,undefined,party).then(ft);
 const check={parties_verified:true,contract_verified:true,amount_verified:true,evidence_verified:true};
 const freview=(r,decision='APPROVED',person=reviewer)=>fp('/records/'+r.id+'/reviews',r,{decision,reason:'synthetic independent finance review',verification:check},person,null);
 const fconfirm=(r,p,decision='APPROVED')=>fp('/records/'+r.id+'/confirmations',r,{content_sha256:r.content_sha256,decision,reason:'synthetic exact version'},p);
 const approveAll=async(r,people)=>{r=ft(await freview(r));for(const person of people)ft(await fconfirm(r,person));return r;};
 const shares=[{party_id:producer.personal_party_id,bps:8500,role:'SUPPLIER'},{party_id:outsider.personal_party_id,bps:1500,role:'PLATFORM'}];
 const rules={version:'test.explicit.1',settlement_at:'2020-01-01T00:00:00.000Z',release_condition:'DELIVERY_ACCEPTED',terms:'Synthetic 15 percent example, never a default',lines:[{line_id:'film',shares,deductions:[]}]};
 const agreementInput={source_type:'ORDER',source_id:order.id,previous_agreement_id:null,environment:'SANDBOX',rule_id:ruleId,rules,evidence_asset_id:proof.id};
 let g,settlement,payout,savedSettlement;
 const settle=async(group,people,person=producer)=>approveAll(ft(await fp('/agreements/'+group.id+'/settlements',group,{period_reference:'synthetic:'+key(),note:'reconcile actual facts'},person)),people);
 const balances=(group,person=producer)=>fc('GET','/agreements/'+group.id+'/balances',person).then(r=>ft(r,'FinanceBalancesResponse'));
 const payoutBody=amount=>({recipient_party_id:outsider.personal_party_id,amount_minor:amount,destination_asset_id:platformProof.id,note:'synthetic manual payout request'});
 const evidenceBody=(outcome,amount,reference=key())=>({outcome,amount_minor:amount,external_reference:reference,occurred_at:'2020-01-01T00:00:00.000Z',evidence_asset_id:proof.id,note:'synthetic bank evidence, no transfer executed'});
 await t.test('authentication, explicit rules and independent review are required',async()=>{
  assert.equal((await fc('POST','/agreements',null,agreementInput)).status,401);assert.equal((await fc('POST','/agreements',buyer,agreementInput)).status,403);
  g=ft(await fc('POST','/agreements',producer,agreementInput));assert.equal((await freview(g,'APPROVED',producer)).status,403);
  assert.equal((await fc('GET','/records/'+g.id,stranger)).status,404);assert.equal((await fp('/agreements/'+g.id+'/settlements',g,{period_reference:'blocked',note:'not approved'})).status,409);
 });
 await t.test('rejected draft can be replaced while history stays; active agreement cannot change',async()=>{
  const rejected=ft(await freview(g,'REJECTED'));g=ft(await fc('POST','/agreements',producer,{...agreementInput,previous_agreement_id:g.id,rules:{...rules,version:'test.explicit.2'}}));assert.equal((await fr(rejected)).current_status,'SUPERSEDED');
  g=ft(await freview(g));assert.equal((await fp('/records/'+g.id+'/confirmations',g,{content_sha256:'0'.repeat(64),decision:'APPROVED',reason:'wrong hash'},buyer)).status,409);
  for(const p of [producer,buyer,outsider])ft(await fconfirm(g,p));assert.equal((await fc('POST','/agreements',producer,{...agreementInput,previous_agreement_id:g.id})).status,409);
  assert.equal((await fr(g)).data.rules.version,'test.explicit.2');
 });
 await t.test('settlement review and every party confirmation precede available balance',async()=>{
  settlement=ft(await fp('/agreements/'+g.id+'/settlements',g,{period_reference:'initial',note:'synthetic'}));const before=await balances(g);assert.equal(before.items.find(x=>x.party_id===outsider.personal_party_id).available_minor,0);
  settlement=ft(await freview(settlement));for(const p of [producer,buyer])ft(await fconfirm(settlement,p));assert.equal((await balances(g)).items.find(x=>x.party_id===outsider.personal_party_id).available_minor,0);
  const confirmationKey=key(),confirmationBody={content_sha256:settlement.content_sha256,decision:'APPROVED',reason:'synthetic exact own-balance confirmation'};
  for(let attempt=0;attempt<2;attempt++){const result=ft(await fp('/records/'+settlement.id+'/confirmations',settlement,confirmationBody,outsider,outsider.personal_party_id,{'Idempotency-Key':confirmationKey}));assert.deepEqual(result.data.balances.map(x=>x.party_id),[outsider.personal_party_id]);assert.equal(result.content_sha256,settlement.content_sha256);}
  savedSettlement=JSON.stringify((await fr(settlement)).data);
  const after=await balances(g);assert.equal(after.received_minor,10000);assert.equal(after.items.find(x=>x.party_id===outsider.personal_party_id).available_minor,1500);assert.equal(after.items.find(x=>x.party_id===producer.personal_party_id).available_minor,0);
 });
 await t.test('settlement detail and list isolate participant balances while payer and reviewer retain original snapshot',async()=>{
  const full=await fr(settlement),own=await fr(settlement,outsider),review=await fr(settlement,reviewer,null);
  assert.ok(full.data.balances.length>1);assert.deepEqual(review.data.balances,full.data.balances);assert.deepEqual(own.data.balances,full.data.balances.filter(x=>x.party_id===outsider.personal_party_id));
  assert.equal(own.content_sha256,full.content_sha256);assert.equal(own.object_version,full.object_version);
  const listed=ft(await fc('GET','/agreements/'+g.id+'/records?kind=SETTLEMENT&limit=100',outsider),'FinanceListResponse');
  assert.ok(listed.items.length);for(const row of listed.items)assert.deepEqual(row.data.balances.map(x=>x.party_id),[outsider.personal_party_id]);
  assert.equal(JSON.stringify((await fr(settlement)).data),savedSettlement);
 });
 await t.test('concurrent withdrawals reserve available amount once and exact retries reuse request',async()=>{
  const op=key(),url='/agreements/'+g.id+'/payouts',body=payoutBody(1000);const all=await Promise.all([fp(url,g,body,outsider),fp(url,g,body,outsider)]);assert.deepEqual(all.map(x=>x.status).sort(),[200,409]);payout=ft(all.find(x=>x.status===200));
  const cancelled=ft(await fp('/payouts/'+payout.id+'/cancellation',payout,{reason:'synthetic cancel'},outsider));assert.equal(cancelled.current_status,'CANCELLED');
  payout=ft(await fp(url,g,body,outsider,outsider.personal_party_id,{'Idempotency-Key':op}));assert.equal(ft(await fp(url,g,body,outsider,outsider.personal_party_id,{'Idempotency-Key':op})).id,payout.id);
  assert.equal((await fp(url,g,payoutBody(1001),outsider,outsider.personal_party_id,{'Idempotency-Key':op})).status,409);payout=ft(await freview(payout));
 });
 await t.test('request approval is not paid; only independent bank evidence books actual payout',async()=>{
  assert.equal((await balances(g)).items.find(x=>x.party_id===outsider.personal_party_id).paid_minor,0);
  const e=ft(await fp('/payouts/'+payout.id+'/evidence',payout,evidenceBody('PAID',1000,'synthetic.bank.payout.1')));assert.equal((await freview(e,'APPROVED',producer)).status,403);
  assert.equal((await balances(g)).items.find(x=>x.party_id===outsider.personal_party_id).paid_minor,0);ft(await freview(e));payout=await fr(payout);
  assert.equal(payout.current_status,'PAID');assert.equal((await balances(g)).items.find(x=>x.party_id===outsider.personal_party_id).paid_minor,1000);
  const e2=await fp('/payouts/'+payout.id+'/evidence',payout,evidenceBody('PAID',1000));assert.equal(e2.status,409);
 });
 await t.test('return and failed payouts keep facts and release reservation for a new request',async()=>{
  ft(await freview(ft(await fp('/payouts/'+payout.id+'/evidence',payout,evidenceBody('RETURNED',1000)))));assert.equal((await balances(g)).items.find(x=>x.party_id===outsider.personal_party_id).paid_minor,0);
  payout=await approveAll(ft(await fp('/agreements/'+g.id+'/payouts',g,payoutBody(1000),outsider)),[]);
  const fail=ft(await fp('/payouts/'+payout.id+'/evidence',payout,evidenceBody('FAILED',1000)));ft(await freview(fail));assert.equal((await fr(payout)).current_status,'FAILED');
  payout=ft(await fp('/agreements/'+g.id+'/payouts',g,payoutBody(1000),outsider));payout=ft(await freview(payout));
  const dup=ft(await fp('/payouts/'+payout.id+'/evidence',payout,evidenceBody('PAID',1000,'synthetic.bank.payout.1')));assert.equal((await freview(dup)).body.error.code,'EXTERNAL_REFERENCE_ALREADY_USED');
  ft(await freview(ft(await fp('/payouts/'+payout.id+'/evidence',payout,evidenceBody('PAID',1000)))));
 });
 await t.test('disputes notify parties, freeze new payouts, retain replies and all decisions',async()=>{
  let dispute=ft(await fp('/records/'+g.id+'/disputes',g,{category:'SETTLEMENT',reason:'synthetic objection',evidence_asset_ids:[buyerProof.id]},buyer));
  assert.equal((await fp('/agreements/'+g.id+'/payouts',g,payoutBody(1),outsider)).body.error.code,'FINANCE_DISPUTED');
  ft(await fp('/disputes/'+dispute.id+'/responses',dispute,{message:'synthetic reply',evidence_asset_ids:[proof.id]}));
  const decide=(d,decision,action_record_id=null)=>fp('/disputes/'+d.id+'/decisions',d,{decision,reason:'synthetic independent decision',action_record_id},reviewer,null);
  assert.equal((await decide(dispute,'REMEDIED',key())).status,409);dispute=ft(await decide(dispute,'ACTION_REQUIRED'));dispute=ft(await decide(dispute,'RESUME'));assert.equal(dispute.data.decision_history.length,2);
  ft(await fc('GET','/notifications',buyer),'FinanceNotificationsResponse');
 });
 await t.test('refund reduces future entitlement, preserves old settlement and actual payout',async()=>{
  let refund=await trade.requestRefund(buyer.ctx,{party_id:buyer.personal_party_id,payment_id:first.id,allocations:[{line_id:'film',amount_minor:4000}],reason:'synthetic refund',operation_key:key()});refund=await reviewTrade(refund);
  const claim=await trade.claim(reviewer.ctx,refund.id,null,'REFUND');await trade.applyRefund(refund.id,{...config,refund_id:refund.id,payment_id:first.id,transaction_id:'test.'+first.id,currency:'CNY',amount_minor:4000,status:'SUCCEEDED'});
  assert.equal((await fp('/agreements/'+g.id+'/payouts',g,payoutBody(1),outsider)).body.error.code,'CURRENT_SETTLEMENT_CONFIRMATION_REQUIRED');
  await settle(g,[producer,buyer,outsider]);const row=(await balances(g)).items.find(x=>x.party_id===outsider.personal_party_id);assert.equal(row.accrued_minor,900);assert.equal(row.paid_minor,1000);assert.equal(row.recovery_due_minor,100);assert.equal(JSON.stringify((await fr(settlement)).data),savedSettlement);
 });
 await t.test('adjustment is balanced, separately reviewed and forces new settlement confirmation',async()=>{
  const input={entries:[{party_id:producer.personal_party_id,amount_minor:-200},{party_id:outsider.personal_party_id,amount_minor:200}],reason:'synthetic agreed correction',evidence_asset_id:proof.id};const adj=ft(await fp('/agreements/'+g.id+'/adjustments',g,input));ft(await freview(adj));assert.equal((await balances(g)).items.find(x=>x.party_id===outsider.personal_party_id).available_minor,0);await settle(g,[producer,buyer,outsider]);assert.equal((await balances(g)).items.find(x=>x.party_id===outsider.personal_party_id).available_minor,100);
 });
 await t.test('reconciliation compares verified facts without turning imported rows into money',async()=>{
  const refs=require('../src/modules/settlement/source');const f=await db.withTransaction(tx=>refs.facts(tx,g)),items=f.references.map(x=>({record_id:x.record_id,direction:x.direction,external_reference:x.external_reference,amount_minor:x.amount_minor}));
  const input={provider:'ALIPAY',environment:'SANDBOX',external_reference:'synthetic.statement',items,evidence_asset_id:proof.id};assert.equal(ft(await fp('/agreements/'+g.id+'/reconciliations',g,input)).current_status,'MATCHED');assert.equal(ft(await fp('/agreements/'+g.id+'/reconciliations',g,{...input,items:[]})).current_status,'DIFFERENCES');assert.equal((await fp('/agreements/'+g.id+'/reconciliations',g,{...input,environment:'PRODUCTION'})).status,409);
 });
 let revenue,statement;
 await t.test('external release statement is accrued revenue, not cash received or automatic payout',async()=>{
  const rr={...rules,release_condition:'RECEIVED',lines:[{line_id:'revenue',shares:[{party_id:buyer.personal_party_id,bps:6000,role:'PRODUCER'},{party_id:producer.personal_party_id,bps:4000,role:'RIGHTSHOLDER'}],deductions:[]}]};
  revenue=await approveAll(ft(await fc('POST','/agreements',buyer,{...agreementInput,source_type:'RELEASE',source_id:release.id,rules:rr,evidence_asset_id:buyerProof.id})),[buyer,producer]);
  statement=ft(await fp('/agreements/'+revenue.id+'/statements',revenue,{external_reference:'synthetic.channel.bill',period_start:'2020-01-01T00:00:00.000Z',period_end:'2020-02-01T00:00:00.000Z',gross_minor:100000,refund_minor:10000,channel_fee_minor:5000,tax_minor:5000,direction:'CREDIT',original_statement_id:null,evidence_asset_id:buyerProof.id,note:'synthetic statement'},buyer));statement=ft(await freview(statement));
  await settle(revenue,[buyer,producer],buyer);const b=await balances(revenue,buyer);assert.equal(b.receivable_minor,80000);assert.equal(b.received_minor,0);assert.equal(b.items.find(x=>x.party_id===producer.personal_party_id).accrued_minor,32000);assert.equal(b.items.find(x=>x.party_id===producer.personal_party_id).available_minor,0);
 });
 await t.test('partial receipts, duplicate bank references and statement corrections never rewrite history',async()=>{
  const input={amount_minor:30000,external_reference:'synthetic.channel.receipt',occurred_at:'2020-02-02T00:00:00.000Z',evidence_asset_id:buyerProof.id,note:'synthetic cash receipt'};
  ft(await freview(ft(await fp('/statements/'+statement.id+'/receipts',statement,input,buyer))));assert.equal((await balances(revenue,buyer)).receivable_minor,50000);
  const dup=ft(await fp('/statements/'+statement.id+'/receipts',statement,input,buyer));assert.equal((await freview(dup)).body.error.code,'EXTERNAL_REFERENCE_ALREADY_USED');
  ft(await freview(ft(await fp('/statements/'+statement.id+'/receipts',statement,{...input,amount_minor:50000,external_reference:key()},buyer))));await settle(revenue,[buyer,producer],buyer);assert.equal((await balances(revenue,buyer)).items.find(x=>x.party_id===producer.personal_party_id).available_minor,32000);
  const correction={...statement.data};delete correction.review;delete correction.net_minor;delete correction.environment;correction.direction='DEBIT';correction.original_statement_id=statement.id;correction.gross_minor=10000;correction.refund_minor=0;correction.channel_fee_minor=0;correction.tax_minor=0;correction.external_reference=key();
  ft(await freview(ft(await fp('/agreements/'+revenue.id+'/statements',revenue,correction,buyer))));await settle(revenue,[buyer,producer],buyer);const b=await balances(revenue,buyer);assert.equal(b.received_minor,80000);assert.equal(b.receivable_minor,-10000);assert.equal(b.items.find(x=>x.party_id===producer.personal_party_id).accrued_minor,28000);assert.equal((await fr(statement,buyer)).data.net_minor,80000);
 });
 await t.test('record permissions, private proof integrity, stale membership and disabled automatic payout',async()=>{
  assert.equal((await fc('GET','/records/'+payout.id,buyer)).status,404);assert.equal((await fc('GET','/records/'+g.id+'/evidence/'+proof.id,outsider)).status,403);
  assert.equal((await fc('GET','/records/'+g.id+'/evidence/'+proof.id,reviewer,undefined,null)).status,200);
  const row=(await db.execute('SELECT * FROM supply_assets WHERE id=?',[proof.id]))[0][0],old=files.get(row.object_key);files.set(row.object_key,Buffer.from('corrupt'));assert.equal((await fc('GET','/records/'+g.id+'/evidence/'+proof.id)).status,503);files.set(row.object_key,old);
  await db.execute("UPDATE party_memberships SET current_status='REVOKED' WHERE party_id=? AND account_id=?",[outsider.personal_party_id,outsider.account_id]);try{assert.equal((await fc('GET','/records/'+g.id,outsider)).status,403);}finally{await db.execute("UPDATE party_memberships SET current_status='ACTIVE' WHERE party_id=? AND account_id=?",[outsider.personal_party_id,outsider.account_id]);}
  assert.equal(ft(await fc('GET','/agreements/'+g.id+'/readiness'),'FinanceReadinessResponse').automatic_payout.current_status,'NOT_IMPLEMENTED');
 });
 await t.test('late customer payment review and unaccepted delivery block payouts even with prior agreement',async()=>{
  const original=(await trade.read(buyer.ctx,{record_id:order.id,party_id:buyer.personal_party_id})).current_status;
  await db.execute("UPDATE trade_records SET current_status='PAYMENT_REVIEW_REQUIRED' WHERE id=?",[order.id]);try{assert.equal((await balances(g)).items.find(x=>x.party_id===outsider.personal_party_id).reason_code,'CUSTOMER_PAYMENT_REVIEW_REQUIRED');}finally{await db.execute('UPDATE trade_records SET current_status=? WHERE id=?',[original,order.id]);}
  await db.execute("UPDATE production_records SET current_status='IN_REVIEW' WHERE id=?",[project.id]);try{assert.equal((await balances(g)).items.find(x=>x.party_id===outsider.personal_party_id).reason_code,'FINANCE_DELIVERY_NOT_ACCEPTED');}finally{await db.execute("UPDATE production_records SET current_status='ACCEPTED' WHERE id=?",[project.id]);}
 });
 await t.test('notification cursor can retrieve newly recorded events, and different parties keep their own feed',async()=>{
  const old=ft(await fc('GET','/notifications?limit=100',stranger),'FinanceNotificationsResponse');assert.equal(old.items.length,0);
  const all=ft(await fc('GET','/notifications?limit=100',buyer),'FinanceNotificationsResponse'),cursor=all.items.at(-1).id;
  ft(await fp('/records/'+g.id+'/disputes',g,{category:'OTHER',reason:'synthetic cursor proof',evidence_asset_ids:[buyerProof.id]},buyer));
  const delta=ft(await fc('GET','/notifications?cursor='+cursor+'&limit=100',buyer),'FinanceNotificationsResponse');assert.ok(delta.items.some(x=>x.event_code==='DISPUTE_CREATED'));assert.ok(delta.items.every(x=>Number(x.id)>Number(cursor)));
 });
 await t.test('audit failure rolls back adjustment and idempotency reservation; stale review fails',async()=>{
  await db.withConnection(c=>c.query("CREATE TRIGGER finance_audit_fail BEFORE INSERT ON finance_audit FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic rollback'"));
  try{const before=(await db.execute('SELECT COUNT(*) n FROM finance_records'))[0][0].n;assert.equal((await fp('/agreements/'+g.id+'/adjustments',g,{entries:[{party_id:producer.personal_party_id,amount_minor:-1},{party_id:outsider.personal_party_id,amount_minor:1}],reason:'rollback',evidence_asset_id:proof.id})).status,503);assert.equal((await db.execute('SELECT COUNT(*) n FROM finance_records'))[0][0].n,before);}finally{await db.withConnection(c=>c.query('DROP TRIGGER finance_audit_fail'));}
  assert.equal((await freview({...settlement,object_version:1})).status,412);
 });
 ft(await fc('GET','/agreements?limit=1'),'FinanceListResponse');ft(await fc('GET','/agreements/'+g.id+'/records?kind=PAYOUT&limit=1'),'FinanceListResponse');ft(await fc('GET','/agreements/'+g.id+'/entries?limit=2'),'FinanceEntriesResponse');ft(await fc('GET','/agreements/'+g.id+'/entries?limit=100'),'FinanceEntriesResponse');ft(await fc('GET','/agreements/'+revenue.id+'/entries?limit=100',buyer),'FinanceEntriesResponse');ft(await fc('GET','/records/'+g.id+'/confirmations'),'FinanceConfirmationsResponse');
 const out=path.resolve(__dirname,'../../../..','.local/finance-http-fixtures.json');await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify({synthetic_only:true,cases:fixtures},null,2));await fs.writeFile(out.replace('http-fixtures','request-fixtures'),JSON.stringify(requests,null,2));
 }finally{if(server)await new Promise(r=>{server.close(r);server.closeAllConnections();});if(db)await db.close();await control.query('DROP DATABASE '+mysql.escapeId(name));await control.end();}
});
