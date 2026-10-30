'use strict';
// Disposable, loopback-only synthetic data for personal-center browser acceptance.
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { randomUUID:key, randomBytes, createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const backend = path.join(root, '晶晶日上工程交接包/01_源码/backend_server');
const from = name => require(path.join(backend, name));
from('scripts/test-network-guard.cjs');
const mysql = from('node_modules/mysql2/promise');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => typeof value === 'string' ? value : JSON.stringify(value);

async function main() {
  if (process.argv.length !== 2 || !process.env.JX_MYSQL_TEST_ENV_FILE) throw Error('Use JX_MYSQL_TEST_ENV_FILE with this local fixture');
  const env = JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE, 'utf8'));
  for (const [k,v] of Object.entries({ NODE_ENV:'test', DB_CLIENT:'mysql', MYSQL_HOST:'127.0.0.1', MYSQL_PORT:'33316', MYSQL_USER:'jx_local', MYSQL_DATABASE:'jx_dev' })) assert.equal(env[k],v,'Refusing non-isolated database configuration');
  const suffix = process.pid+'_'+randomBytes(6).toString('hex');
  const name = 'jx_test_personal_ui_'+suffix;
  const out = path.join(root,'.local/pr39-personal-center-'+suffix);
  await fs.mkdir(out,{ recursive:false, mode:0o700 });
  let control, db, server, created=false, starting=true, stopping=false, cleanupPromise, watcher, timer, commandBusy=false, delayMs=0;
  const requests=[], damaged=new Map();
  const write = (file,value) => fs.writeFile(path.join(out,file),JSON.stringify(value,null,2)+'\n');
  const cleanup = () => cleanupPromise ??= (async () => {
    clearInterval(watcher); clearTimeout(timer); process.stdin.pause();
    const failed_steps=[];
    const step=async(label,action)=>{try {await action();return true;} catch {failed_steps.push(label);return false;}};
    const credentials_removed=await step('credentials',()=>fs.unlink(path.join(out,'access.json')).catch(e=>{if(e.code!=='ENOENT')throw e;}));
    if(server)await step('http',async()=>{server.closeAllConnections();await new Promise((ok,no)=>server.close(e=>e&&e.code!=='ERR_SERVER_NOT_RUNNING'?no(e):ok()));});
    if(db)await step('pool',()=>db.close());
    const database_removed=!created||/^jx_test_personal_ui_[0-9]+_[a-f0-9]{12}$/.test(name)&&await step('database',()=>control.query('DROP DATABASE '+mysql.escapeId(name)));
    if(control)await step('control',()=>control.end());
    await write('requests.json',{synthetic_only:true,requests});
    const result={status:failed_steps.length?'CLEANUP_FAILED':'STOPPED',synthetic_only:true,database_removed,credentials_removed,failed_steps};
    await write('status.json',result);console.log(JSON.stringify(result));if(failed_steps.length)process.exitCode=1;
  })();
  const stop=()=>{stopping=true;if(!starting)void cleanup();};
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  process.stdin.setEncoding('utf8');process.stdin.on('data',text=>{if(text.trim()==='quit')stop();});process.stdin.unref?.();
  const alive=()=>{if(stopping)throw Object.assign(Error('Stopped'),{code:'LOCAL_STOP_REQUESTED'});};
  try {
    control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});
    await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');created=true;
    db=await from('src/infrastructure/database').openDatabase({...env,MYSQL_DATABASE:name});await from('src/infrastructure/database/migrator').migrate(db);alive();
    const S=await from('test/helpers/stock-seed.cjs').seedStock(db);
    const C=await from('test/support/customization-delivery.cjs').seed(db);
    const viewer=C.people.buyer, reviewer=C.people.reviewer, other=C.people.outsider;
    for(const user of Object.values(C.people))S.principals.set(user.ctx,await C.resolvePrincipal(user.ctx));
    await S.person(viewer);
    const resolvePrincipal=S.resolvePrincipal;
    const auth=from('src/modules/auth/repository').createAuthRepository(db,{secret:S.secret});
    for(const user of Object.values(C.people))await db.execute('INSERT INTO auth_sessions(token_hash,account_id,expires_ms) VALUES (?,?,ROUND(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000)+14400000)',[auth.secure.digest('token',user.token),user.account_id]);
    await db.execute('UPDATE auth_sessions SET expires_ms=ROUND(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000)+14400000');
    const grant=async(user,action)=>from('src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:user.account_id,action,enabled:true,expected_version:0,expires_at:null,authority_ref:'synthetic:personal-center',reason:'Isolated UI acceptance fixture'});
    for(const action of ['CREATE_SOURCE','REVIEW_SOURCE','SEAL','GIG_REVIEW'])await grant(S.outsider,action);
    for(const action of ['FINANCE_REVIEW','GIG_REVIEW'])await grant(reviewer,action);
    const storageFactory=()=>({
      put:async i=>{S.bytes.set(i.key,Buffer.from(i.body));return {key:i.key,sha256:sha(i.body),size:i.body.length};},
      getBuffer:async k=>S.bytes.get(k)||C.files.get(k),
    });
    const supply=from('src/modules/works/repository').createSupplyRepository(db,{resolvePrincipal});
    const assets=from('src/modules/works/assets').createSupplyAssets({db,repository:supply,storageFactory});
    const upload=(user,party,purpose,body,type='text/plain')=>assets.upload(user.ctx,{party_id:party,purpose,media_type:type,body:Buffer.from(body),operation_key:key()});
    const parties=from('src/modules/party/repository').createPartyRepository(db,{resolvePrincipal});
    const org=await parties.createOrganization(viewer.ctx,{display_name:'合成个人中心机构',operation_key:key()});
    const invitation=await parties.inviteMember(viewer.ctx,{party_id:org.party_id,invitee_account_id:other.account_id,expires_at:new Date(Date.now()+3600000).toISOString(),operation_key:key()});
    await parties.respondInvitation(other.ctx,{party_id:org.party_id,invitation_id:invitation.invitation_id,decision:'ACCEPT',expected_version:invitation.object_version,operation_key:key()});

    // Real repository transitions; media and provider receipts are synthetic.
    const run=from('src/modules/media/marking').run;
    for(const [file,seconds] of [['full.mp4',3],['preview.mp4',1]]) {
      await run('/opt/homebrew/bin/ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','color=c=0x294F68:s=320x180:r=10','-t',String(seconds),'-c:v','libx264','-pix_fmt','yuv420p','-threads','1','-movflags','+faststart','-y',file],{cwd:out});
      const record=await upload(S.seller,S.seller.personal_party_id,'WORK_CONTENT',await fs.readFile(path.join(out,file)),'video/mp4');
      S.listingInput[file==='full.mp4'?'file_id':'preview_file_id']=record.id;
    }
    const listing=await S.listing(), purchase=await S.checkout(listing,viewer);await S.payment(purchase,viewer);
    const custom=await C.newOrder({title:'合成在制影片：尚未交付'});
    const production=from('src/modules/production/repository').createProductionRepository(db,{resolvePrincipal});
    let project=await production.create(C.people.producer.ctx,{party_id:C.org.party_id,order_id:custom.order.id,line_id:'film',script_version_id:C.work.id,license_project_id:null,assignee_account_id:C.people.producer.account_id,purpose:'PRIVATE',territory:'CN',consent_ids:[],evidence_asset_id:C.proof.id,fulfillment:{uses_identifiable_people:false,cast:[]},operation_key:key()});
    project=await production.review(reviewer.ctx,{record_id:project.id,expected_version:project.object_version,decision:'APPROVED',reason:'Synthetic independent project review',verification:{contract_sha256:project.data.contract_sha256,identity_verified:true,signatures_verified:true,rights_verified:true},operation_key:key()});
    await C.pay(custom.order,'first');
    await production.startCustomization(C.people.producer.ctx,{party_id:C.org.party_id,record_id:project.id,expected_version:project.object_version,operation_key:key()});

    const governance=from('src/modules/governance/repository').createGovernanceRepository(db,{resolvePrincipal});
    async function snapshot(party,ordinal) {
      const source=await governance.createSource(S.outsider.ctx,{content:{business_ref:'synthetic:personal-center:'+ordinal+':'+key(),revision:'1',party_ids:[party],reader_account_ids:[viewer.account_id,S.outsider.account_id],rule_ids:[S.ruleId],commitments:{notice:'合成历史封存记录 '+ordinal+'；封存不代表签署或付款。'}},operation_key:key()});
      await governance.transitionSource(S.outsider.ctx,{source_ref:source.source_ref,target_status:'REVIEWED',expected_version:source.object_version,review_ref:'synthetic:history-review',operation_key:key()});
      return governance.seal(S.outsider.ctx,{source_ref:source.source_ref,operation_key:key()});
    }
    const snapshots=[];for(let n=1;n<=21;n++){snapshots.push(await snapshot(viewer.personal_party_id,n));alive();}
    const orgSnapshot=await snapshot(org.party_id,'organization');

    // Explicit synthetic split on a real paid order; no external transfer occurs.
    const finance=from('src/modules/settlement/repository').createSettlementRepository(db,{resolvePrincipal});
    const sellerProof=await upload(S.seller,S.seller.personal_party_id,'RIGHTS_EVIDENCE','Synthetic settlement rights and bank evidence.');
    const viewerProof=await upload(viewer,viewer.personal_party_id,'RIGHTS_EVIDENCE','Synthetic destination only, not a bank account.');
    let agreement=await finance.agreement(S.seller.ctx,{party_id:S.seller.personal_party_id,source_type:'ORDER',source_id:purchase.id,previous_agreement_id:null,environment:'SANDBOX',rule_id:S.ruleId,rules:{version:'synthetic-ui-1',settlement_at:'2020-01-01T00:00:00.000Z',release_condition:'RECEIVED',terms:'Synthetic 50/50 example, not a product default.',lines:[{line_id:purchase.data.quote.lines[0].line_id,shares:[{party_id:S.seller.personal_party_id,bps:5000,role:'SUPPLIER'},{party_id:viewer.personal_party_id,bps:5000,role:'PARTICIPANT'}],deductions:[]}]},evidence_asset_id:sellerProof.id,operation_key:key()});
    const financeReview=r=>finance.review(reviewer.ctx,{record_id:r.id,expected_version:r.object_version,decision:'APPROVED',reason:'Synthetic independent finance evidence',verification:{parties_verified:true,contract_verified:true,amount_verified:true,evidence_verified:true},operation_key:key()});
    async function confirmAll(r) {r=await financeReview(r);for(const user of [S.seller,viewer])await finance.confirm(user.ctx,{party_id:user.personal_party_id,record_id:r.id,expected_version:r.object_version,content_sha256:r.content_sha256,decision:'APPROVED',reason:'Synthetic exact-version confirmation',operation_key:key()});return r;}
    agreement=await confirmAll(agreement);
    await confirmAll(await finance.settle(S.seller.ctx,{party_id:S.seller.personal_party_id,record_id:agreement.id,expected_version:agreement.object_version,period_reference:'synthetic-ui',note:'Synthetic posted ledger only',operation_key:key()}));
    let payout=await finance.requestPayout(viewer.ctx,{party_id:viewer.personal_party_id,record_id:agreement.id,expected_version:agreement.object_version,recipient_party_id:viewer.personal_party_id,amount_minor:20,destination_asset_id:viewerProof.id,note:'Synthetic payout evidence only, no actual bank transfer',operation_key:key()});
    payout=await financeReview(payout);
    await financeReview(await finance.payoutEvidence(S.seller.ctx,{party_id:S.seller.personal_party_id,record_id:payout.id,expected_version:payout.object_version,outcome:'PAID',amount_minor:20,external_reference:'synthetic:payment:'+key(),occurred_at:'2020-01-01T00:00:00.000Z',evidence_asset_id:sellerProof.id,note:'Synthetic bank evidence only',operation_key:key()}));

    // A separately permissioned legacy commission is deliberately not a finance total.
    const gigs=from('src/modules/gigs/repository').createGigsRepository(db,{resolvePrincipal});
    let consent=await supply.createConsent(S.seller.ctx,{consent:{avatar_id:S.avatar.id,subject_party_id:S.seller.personal_party_id,features:['FACE'],purposes:['COMMERCIAL'],territories:['CN'],valid_from:'2020-01-01T00:00:00.000Z',valid_until:'2099-01-01T00:00:00.000Z',terms:'Synthetic separate commercial permission',evidence_asset_ids:[S.evidence.id]},operation_key:key()});
    consent=await supply.reviewConsent(reviewer.ctx,{record_id:consent.id,expected_version:consent.object_version,decision:'APPROVED',reason:'Synthetic independent rights review',operation_key:key()});
    const reviewTrade=r=>S.trade.review(reviewer.ctx,{record_id:r.id,expected_version:r.object_version,decision:'APPROVED',reason:'Synthetic independent trade review',operation_key:key()});
    const spec=await reviewTrade(await S.trade.createSpec(S.seller.ctx,{party_id:S.seller.personal_party_id,previous_spec_id:null,title:'合成商业合作记录',provider_party_id:S.seller.personal_party_id,line_kind:'OTHER',unit_minor:10001,currency:'CNY',specification:{version:'1',service_tier:'test',sample_seconds:0,final_seconds:0,revision_limit:1,deliverables:['Synthetic material'],terms:'Synthetic only'},operation_key:key()}));
    const reviewGig=r=>gigs.review(reviewer.ctx,{record_id:r.id,expected_version:r.object_version,decision:'APPROVED',reason:'Synthetic independent commercial review',checks:r.kind==='RULE'?null:{identity_verified:true,authority_verified:true,materials_reviewed:true,content_reviewed:true,marking_reviewed:true},operation_key:key()});
    const gigRule=await reviewGig(await gigs.createRule(S.outsider.ctx,{rule:{version:'synthetic1',categories:[{code:'TEST',allowed:true,required_proofs:[]}],ranking:{window_days:7,newcomer_days:30,minimum_orders:1,order_weight:10,net_minor_weight:0,newcomer_bonus:2},terms:'Synthetic only'},operation_key:key()}));
    const gig=await reviewGig(await gigs.createGig(viewer.ctx,{party_id:viewer.personal_party_id,title:'合成佣金来源',brief:'No real commercial engagement',category:'TEST',scope:{purpose:'COMMERCIAL',territory:'CN',valid_until:'2098-01-01T00:00:00.000Z'},rule_id:gigRule.id,proofs:[],operation_key:key()}));
    let offer=await reviewGig(await gigs.offer(S.seller.ctx,{party_id:S.seller.personal_party_id,gig_id:gig.id,spec_id:spec.id,avatar_id:S.avatar.id,consent_id:consent.id,relation_id:null,commission:{platform_bps:2000,mcn_bps:0},terms:'Synthetic legacy agreement',ranking_opt_in:false,evidence_asset_ids:[S.evidence.id],operation_key:key()}));
    offer=await gigs.acceptOffer(viewer.ctx,{party_id:viewer.personal_party_id,record_id:offer.id,expected_version:offer.object_version,offer_sha256:offer.content_sha256,operation_key:key()});
    const quote=await reviewTrade(await S.trade.quote(S.seller.ctx,{party_id:S.seller.personal_party_id,buyer_party_id:viewer.personal_party_id,lines:[{line_id:'commercial',spec_id:spec.id,quantity:1}],installments:[{key:'full',trigger:'ORDER_ACCEPTED',allocations:[{line_id:'commercial',amount_minor:10001}],apple_product_id:null}],channel:'ALIPAY',transaction_model:'DIRECT_SUPPLIER',rule_id:S.ruleId,expires_at:'2098-01-01T00:00:00.000Z',payment_window_minutes:30,license_reservation_id:null,commercial_offer_id:offer.id,operation_key:key()}));
    const commercial=await S.trade.accept(viewer.ctx,{party_id:viewer.personal_party_id,record_id:quote.id,expected_version:quote.object_version,quote_sha256:quote.content_sha256,operation_key:key()});
    const payment=await S.trade.preparePayment(viewer.ctx,{party_id:viewer.personal_party_id,order_id:commercial.id,installment_key:'full',operation_key:key()},S.config);
    await S.trade.applyPayment({...S.config,payment_id:payment.id,currency:'CNY',amount_minor:10001,transaction_id:'synthetic.'+payment.id,status:'SUCCEEDED',product_id:null,app_account_token:null});
    const commission=await gigs.calculate(viewer.ctx,{party_id:viewer.personal_party_id,order_id:commercial.id,operation_key:key()});
    alive();

    const app=from('src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:storageFactory,supplyEnv:{MEDIA_FFMPEG:'/opt/homebrew/bin/ffmpeg',MEDIA_FFPROBE:'/opt/homebrew/bin/ffprobe'},allowedOrigins:['http://127.0.0.1:5173','http://localhost:5173','http://127.0.0.1:5500','http://localhost:5500']});
    server=http.createServer((req,res)=>{
      const requestPath=req.url,requestMethod=req.method;
      res.on('finish',()=>{if(requestPath.startsWith('/api/')){requests.push({at:new Date().toISOString(),method:requestMethod,path:requestPath,status:res.statusCode});if(requests.length>1500)requests.shift();}});
      if(delayMs&&requestMethod==='GET'&&requestPath.startsWith('/api/v1/me/business/'))setTimeout(()=>{if(!stopping&&!res.destroyed)app(req,res);},delayMs);else app(req,res);
    });
    server.listen(0,'127.0.0.1');await new Promise((ok,no)=>{server.once('listening',ok);server.once('error',no);});
    const base_url='http://127.0.0.1:'+server.address().port+'/api/v1';
    const account=(u,party=u.personal_party_id)=>({account_id:u.account_id,party_id:party,personal_party_id:u.personal_party_id,bearer_token:u.token});
    const accounts={viewer:account(viewer),owner:account(viewer,org.party_id),member:account(other,org.party_id),other:account(other),reviewer:account(reviewer),seller:account(S.seller),producer:account(C.people.producer,C.org.party_id)};
    const scenarios={snapshot_ids:snapshots.map(s=>s.id),organization_snapshot_id:orgSnapshot.id,organization_party_id:org.party_id,purchase_order_id:purchase.id,listing_id:listing.id,production_project_id:project.id,production_order_id:custom.order.id,finance_agreement_id:agreement.id,commission_id:commission.id,commercial_order_id:commercial.id,expected_personal_income:{accrued_minor:50,adjustment_minor:0,verified_paid_minor:20,pending_minor:30,retained_minor:0,recovery_due_minor:0}};
    const faultTargets={CONTRACT_SNAPSHOTS:{table:'governance_snapshots',field:'content_json',id:snapshots.at(-1).id},CONTRACT_SNAPSHOTS_NEXT:{table:'governance_snapshots',field:'content_json',id:snapshots[0].id},TRADE_ORDERS:{table:'trade_records',field:'data_json',id:purchase.id},PRODUCTION_PROJECTS:{table:'production_records',field:'data_json',id:project.id},FINANCE:{table:'finance_records',field:'data_json',id:agreement.id},COMMISSIONS:{table:'gig_records',field:'data_json',id:commission.id}};
    async function damage(source) {
      const target=faultTargets[source];if(!target)throw Error('Unknown fixture source');if(damaged.has(source))return;
      const [[row]]=await db.execute('SELECT '+target.field+' AS content FROM '+target.table+' WHERE id=?',[target.id]);
      damaged.set(source,json(row.content));const value=JSON.parse(json(row.content));value.synthetic_fault='Deliberate isolated content-hash mismatch';
      await db.execute('UPDATE '+target.table+' SET '+target.field+'=? WHERE id=?',[JSON.stringify(value),target.id]);
    }
    async function restore(source) {
      for(const name of source?[source]:[...damaged.keys()]){if(!damaged.has(name))continue;const target=faultTargets[name];await db.execute('UPDATE '+target.table+' SET '+target.field+'=? WHERE id=?',[damaged.get(name),target.id]);damaged.delete(name);}
    }
    const setMembership=async(enabled,identity='personal')=>{assert.equal(typeof enabled,'boolean');assert.ok(['personal','organization'].includes(identity));await db.execute('UPDATE party_memberships SET current_status=? WHERE account_id=? AND party_id=?',[enabled?'ACTIVE':'REVOKED',viewer.account_id,identity==='personal'?viewer.personal_party_id:org.party_id]);};
    async function call(url,actor=accounts.viewer){const response=await fetch(base_url+url,{headers:{Authorization:'Bearer '+actor.bearer_token,'X-Acting-Party':actor.party_id}});return {status:response.status,body:await response.json()};}
    const section=(data,source)=>data.sections.find(x=>x.source===source);
    const ok=result=>{assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.data.partial,false);return result.body.data;};
    const checks=[];
    const record=(label,detail={})=>checks.push({label,ok:true,...detail});
    const contracts=ok(await call('/me/business/contracts')),works=ok(await call('/me/business/works')),income=ok(await call('/me/business/income'));
    assert.equal(contracts.sections.length,8);assert.equal(works.sections.length,5);assert.equal(income.sections.length,2);
    assert.ok(section(contracts,'TRADE_ORDERS').items.some(x=>x.record_id===purchase.id));assert.ok(section(works,'STOCK_PURCHASES').items.some(x=>x.record_id===purchase.id));record('same original order in contracts and purchased works');
    assert.ok(section(works,'PRODUCTION_PROJECTS').items.some(x=>x.record_id===project.id));record('in-progress project has original target');
    const ownIncome=section(income,'FINANCE').items.find(x=>x.record_id===agreement.id).income;
    for(const [k,v] of Object.entries(scenarios.expected_personal_income))assert.equal(ownIncome[k],v,k);assert.equal(ownIncome.bank_arrival_verified,false);assert.equal(ownIncome.environment,'SANDBOX');
    assert.equal(section(income,'COMMISSIONS').items.find(x=>x.record_id===commission.id).income,null);record('posted personal ledger isolated from commission figures',{income:ownIncome});
    const first=section(contracts,'CONTRACT_SNAPSHOTS');assert.equal(first.items.length,20);assert.ok(first.next_cursor);
    const nextUrl='/me/business/contracts?source=CONTRACT_SNAPSHOTS&cursor='+encodeURIComponent(first.next_cursor);
    const second=section(ok(await call(nextUrl)),'CONTRACT_SNAPSHOTS');assert.equal(second.items.length,1);assert.equal(second.next_cursor,null);assert.ok(!first.items.some(x=>x.record_id===second.items[0].record_id));record('real default pagination 20 plus 1');
    await damage('CONTRACT_SNAPSHOTS_NEXT');try{const failed=await call(nextUrl);assert.equal(failed.status,200);assert.equal(failed.body.data.partial,true);assert.equal(section(failed.body.data,'CONTRACT_SNAPSHOTS').status,'UNAVAILABLE');}finally{await restore('CONTRACT_SNAPSHOTS_NEXT');}
    assert.equal(section(ok(await call(nextUrl)),'CONTRACT_SNAPSHOTS').items[0].record_id,second.items[0].record_id);record('same next-page cursor succeeds after real source restoration');
    await damage('CONTRACT_SNAPSHOTS');try{const partial=await call('/me/business/contracts');assert.equal(partial.status,200);assert.equal(partial.body.data.partial,true);assert.equal(section(partial.body.data,'CONTRACT_SNAPSHOTS').retryable,true);assert.ok(section(partial.body.data,'TRADE_ORDERS').items.length>=2);}finally{await restore();}record('one real corrupt source preserves successful sections');
    for(const source of ['FINANCE','COMMISSIONS']){await damage(source);try{const partial=await call('/me/business/income');assert.equal(partial.status,200);assert.equal(section(partial.body.data,source).status,'UNAVAILABLE');assert.equal(section(partial.body.data,source==='FINANCE'?'COMMISSIONS':'FINANCE').status,'AVAILABLE');}finally{await restore();}}record('income and commissions fail and recover independently');
    const organization=ok(await call('/me/business/contracts',accounts.owner));assert.equal(section(organization,'CONTRACT_SNAPSHOTS').items.length,1);assert.equal(section(organization,'CONTRACT_SNAPSHOTS').items[0].record_id,orgSnapshot.id);assert.equal(section(organization,'TRADE_ORDERS').items.length,0);
    assert.equal((await call(nextUrl,accounts.owner)).status,400);assert.equal((await call('/me/business/works',accounts.member)).status,403);assert.ok(ok(await call('/me/business/works',accounts.other)).sections.every(s=>s.items.length===0));record('same-account identity, unrelated account, MEMBER, and cursor scopes isolated');
    await setMembership(false);try{assert.equal((await call('/me/business/works')).status,403);}finally{await setMembership(true);}ok(await call('/me/business/works'));record('live OWNER membership revocation and recovery');
    await write('verified.json',{synthetic_only:true,transport:'real loopback HTTP and backend repositories',checks});
    await fs.writeFile(path.join(out,'access.json'),JSON.stringify({synthetic_only:true,base_url,accounts,scenarios},null,2)+'\n',{mode:0o600});
    await write('fixture.json',{synthetic_only:true,scenarios,notes:['Only isolated synthetic data; no production providers, real personal data, or bank transfers.','The viewer and owner roles are one account with separate personal and organization acting parties.','21 snapshots are synthetic history prepared via governance repository transitions, not evidence of ordinary end-user contracting.','Receipt injection and payout evidence are synthetic; bank_arrival_verified remains false.','Source faults deliberately corrupt only owned isolated rows and are real backend failures, not fabricated HTTP responses.','Intermediate empty cursor page remains covered by frontend unit tests; this fixture exercises real 20+1 and original next-cursor recovery.'],commands:['inspect','source-failure {source,enabled}','membership {enabled,identity:personal|organization}','delay {ms:0..10000}'],fault_sources:Object.keys(faultTargets)});
    await write('status.json',{status:'RUNNING',synthetic_only:true,database:name,base_url,created_at:new Date().toISOString(),expires_in_minutes:240});
    async function command(input){
      assert.match(input.id,/^[a-zA-Z0-9_-]{1,80}$/);
      if(input.action==='source-failure'){assert.equal(typeof input.enabled,'boolean');assert.ok(faultTargets[input.source]);if(input.enabled)await damage(input.source);else await restore(input.source);}
      else if(input.action==='membership')await setMembership(input.enabled,input.identity);
      else if(input.action==='delay'){assert.ok(Number.isInteger(input.ms)&&input.ms>=0&&input.ms<=10000);delayMs=input.ms;}
      else if(input.action!=='inspect')throw Error('Unknown fixture action');
      await write('requests.json',{synthetic_only:true,requests});return {scenarios,failed_sources:[...damaged.keys()],delay_ms:delayMs};
    }
    async function watch(){
      if(commandBusy||stopping)return;
      try{await fs.access(path.join(out,'stop'));stop();return;}catch(e){if(e.code!=='ENOENT'){stop();return;}}
      commandBusy=true;
      try{
        let input;try{input=JSON.parse(await fs.readFile(path.join(out,'command.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return;throw e;}
        await fs.unlink(path.join(out,'command.json'));let result;
        try{result={id:input.id,ok:true,result:await command(input)};}catch(e){result={id:input.id,ok:false,error:e.code||e.message};}
        await write('command-result.json',result);
      }catch(e){console.error('ISOLATED_COMMAND_FAILED',e.code||e.message);}finally{commandBusy=false;}
    }
    starting=false;watcher=setInterval(watch,200);timer=setTimeout(stop,240*60*1000);
    console.log(JSON.stringify({status:'READY',synthetic_only:true,base_url,folder:out,access_file:path.join(out,'access.json'),checks:checks.length,ttl_minutes:240}));
  }catch(e){starting=false;await cleanup();if(e.code!=='LOCAL_STOP_REQUESTED')throw e;}
}
main().catch(e=>{console.error(e.code||e.message||'PERSONAL_CENTER_SANDBOX_FAILED');process.exitCode=1;});
