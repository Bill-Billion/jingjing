'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto');
const {load,root,read,hash}=require('./test-fixtures/qa18-s4-delta-clone.cjs');
const home=path.join(root,'.local/qa18/s4-a-closeout-20261128');
const out=path.resolve(process.argv[2]||'');

async function main(){
  assert(out.startsWith(home+path.sep));
  await fs.mkdir(out,{recursive:true});
  await fs.writeFile(path.join(out,'RUN_ONCE'),'original award weights, deterministic valid tickets, isolated payments disabled',{flag:'wx'});
  const e={started_at:new Date().toISOString(),requests:[],checks:[]};
  const save=()=>fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify(e,null,2)+'\n');
  const cfg=await read(process.env.JX_MYSQL_TEST_ENV_FILE);
  for(const [k,v] of Object.entries({NODE_ENV:'test',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_DATABASE:'jx_dev'}))assert.equal(cfg[k],v);
  const mysql=load('node_modules/mysql2/promise');
  const control=await mysql.createConnection({host:cfg.MYSQL_HOST,port:Number(cfg.MYSQL_PORT),user:cfg.MYSQL_USER,password:cfg.MYSQL_PASSWORD,database:cfg.MYSQL_DATABASE});
  const name='jx_test_qa18_awards_'+randomBytes(10).toString('hex');
  const time=load('src/modules/artists/context'),lottery=load('src/modules/redemption/lottery-policy');
  const actualNow=time.now,actualDraw=lottery.draw;
  let db,server,created=false;
  try{
    await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');
    created=true;
    db=await load('src/infrastructure/database').openDatabase({...cfg,MYSQL_DATABASE:name});
    await load('src/infrastructure/database/migrator').migrate(db);
    const S=await load('test/support/customization-delivery.cjs').seed(db);
    const {producer,reviewer,outsider:fin,buyer,artist}=S.people;
    e.database=name;
    e.production_prices_real=false;
    for(const u of [producer,reviewer,fin])for(const action of ['REDEMPTION_REVIEW','WALLET_RULE_REVIEW'])
      await S.grant(u,action);
    await S.grant(fin,'FINANCE_REVIEW');
    const roster={buyer,none:artist,third:await S.registerActor('third prize holder'),
      fourth:await S.registerActor('fourth prize holder'),fifth:await S.registerActor('inventory refusal')};
    const W=load('src/modules/wallet/repository').createWalletRepository(db,{resolvePrincipal:S.resolvePrincipal});
    let walletRule=await W.createRule(fin.ctx,{rule:{...load('test/helpers/wallet-rule.cjs'),
      free_awards:{REGISTER:10000,DAILY_CHECKIN:null,REVIEW:null,SHARE:null}},operation_key:key()});
    walletRule=await W.reviewRule(reviewer.ctx,{record_id:walletRule.id,expected_version:walletRule.object_version,
      decision:'APPROVE',reason:'独立核对合成额度，无真实渠道',operation_key:key()});
    for(const p of Object.values(roster)){
      await load('test/helpers/trusted-identity.cjs').seedAdultIdentity(db,S.resolvePrincipal,p);
      await W.open(p.ctx,{party_id:p.personal_party_id,rule_id:walletRule.id,rule_sha256:walletRule.content_sha256,operation_key:key()});
    }
    let offer;
    const stop=new Error('retain approved synthetic offer only');
    await assert.rejects(S.newOrder({unitMinor:300000,beforeAccept:async current=>{offer=current;throw stop;}}),error=>error===stop);
    const prep=await require('./test-fixtures/qa18-contract-lottery.cjs')(db,S,offer);
    server=load('src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory}).listen(0,'127.0.0.1');
    await new Promise((ok,fail)=>{server.once('listening',ok);server.once('error',fail);});
    const api='http://127.0.0.1:'+server.address().port+'/api/v1';
    async function call(u,uri,{body,version,status=200,party=true,op=key()}={}){
      const r=await fetch(api+uri,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+u.token,
        ...party?{'X-Acting-Party':u.acting_party_id}:{},...body?{'Content-Type':'application/json','Idempotency-Key':op}:{},
        ...version?{'If-Match':'"'+version+'"'}:{}},...body?{body:JSON.stringify(body)}:{},signal:AbortSignal.timeout(12000)});
      const raw=Buffer.from(await r.arrayBuffer()),j=JSON.parse(raw);
      e.requests.push({uri,http:r.status,code:j.error?.code,sha256:hash(raw)});
      await save();assert.equal(r.status,status,uri+' '+j.error?.code);
      return j.data||j.error;
    }
    const proof=await S.upload(producer,'REVIEW_EVIDENCE');
    let pool=await call(producer,'/redemption/pools',{body:{config:prep.config,bindings:prep.bindings,
      starts_at:'2020-01-01T00:00:00.000Z',ends_at:'2099-01-01T00:00:00.000Z',terms:'既有合同11档，合成场景',
      cost_limit_single_minor:3000,cost_limit_ten_minor:27000,evidence_asset_ids:[proof.id]}});
    for(const [who,channel] of [[reviewer,'RULES'],[fin,'FINANCE']])
      pool=await call(who,'/redemption/pools/'+pool.id+'/review',{party:false,version:pool.object_version,body:{channel,
        decision:'APPROVE',reason:'隔离合成复核',evidence_asset_id:proof.id}});
    assert.equal(pool.current_status,'PUBLISHED');
    const policy=await call(buyer,'/redemption/pools/'+pool.id,{party:false});
    assert.deepEqual(policy.source_catalog.items.filter(x=>!x.enabled).map(x=>x.kind),['INTERVIEW_FINAL']);
    const original=load('src/modules/redemption/contract-pool').prizes;
    assert.deepEqual(pool.data.config.prizes.map(p=>[p.key,p.kind,p.weight]),original.map(p=>p.slice(0,3)));
    const drawBody=count=>({pool_id:pool.id,rules_sha256:pool.data.rules_sha256,count});
    async function confirmDraw(u,count,op){
      const target={kind:'LOTTERY',pool_id:pool.id,count,request_key:op};
      const v=await call(u,'/wallet/consumer-risk/preview?'+new URLSearchParams(target));
      if(v.required)await call(u,'/wallet/consumer-risk/confirm',
        {body:{target,preview_sha256:v.preview_sha256,read_confirmed:true}});
    }
    assert.equal((await call(buyer,'/redemption/draws',{body:drawBody(10),status:409})).code,'LOTTERY_NOTICE_PERIOD');
    const advance=new Date(Date.parse(pool.data.publication_notice.opens_at)+2000).toISOString();
    assert(Date.parse(advance)<Date.parse('2026-12-25T15:00:00.000Z'));
    time.now=async()=>advance;
    e.isolated_clock_after_publication=advance;
    const ticket=original.map((p,i)=>original.slice(0,i).reduce((total,row)=>total+row[2],0));
    function select(validTickets){
      lottery.draw=(config,count)=>{
        let index=0;
        return actualDraw(config,count,total=>{
          const t=validTickets[index++];
          assert(Number.isInteger(t)&&t<total);
          return t;
        });
      };
    }
    const before=(await call(buyer,'/wallet/summary')).available_points;
    select(ticket.slice(0,10));
    const op=key();
    await confirmDraw(buyer,10,op);
    const draw=await call(buyer,'/redemption/draws',{body:drawBody(10),op});
    assert.equal(draw.current_status,'SETTLED');
    assert.equal(draw.data.points,2700);
    assert.deepEqual(draw.data.results.map(r=>r.key),original.slice(0,10).map(p=>p[0]));
    assert.equal((await call(buyer,'/wallet/summary')).available_points,before-2700+100);
    for(const result of draw.data.results){
      if(result.kind==='POINT_BACK'){
        assert.equal(result.point_back,100);
        assert(result.point_earning_id&&!result.grant_id);
        continue;
      }
      const grant=await call(buyer,'/redemption/grants/'+result.grant_id);
      const want=prep.stocks[result.key].data.template;
      assert.deepEqual(grant.data.template,want);
      assert.equal(grant.parent_id,prep.stocks[result.key].id);
      assert.equal(grant.current_status,'AVAILABLE');
      assert.equal(grant.data.cashable,false);
      assert.deepEqual(grant.data.source,['LOTTERY',draw.id,String(result.index)]);
      e.checks.push({award:result.key,kind:result.kind,grant:grant.id,original_stock:grant.parent_id});
    }
    const seen=await call(buyer,'/redemption/draws/'+draw.id);
    assert.deepEqual(seen.data.results,draw.data.results);
    const same=await call(buyer,'/redemption/draws',{body:drawBody(10),op});
    assert.equal(same.id,draw.id);
    assert.equal((await call(buyer,'/wallet/summary')).available_points,before-2600);
    assert.equal((await call(roster.none,'/redemption/draws/'+draw.id,{status:404})).code,'REDEMPTION_NOT_FOUND');
    select([ticket[10]]);
    const noneOperation=key();
    await confirmDraw(roster.none,1,noneOperation);
    const none=await call(roster.none,'/redemption/draws',{body:drawBody(1),op:noneOperation});
    assert.equal(none.data.results[0].kind,'NONE');
    assert.equal(none.data.results[0].grant_id,null);
    select(Array(10).fill(ticket[0]));
    for(const p of [roster.third,roster.fourth]){
      const original=key();
      await confirmDraw(p,10,original);
      await call(p,'/redemption/draws',{body:drawBody(10),op:original});
    }
    const beforeDenied=(await call(roster.fifth,'/wallet/summary')).available_points;
    const attempt=key();
    await confirmDraw(roster.fifth,10,attempt);
    const fail=await call(roster.fifth,'/redemption/draws',{body:drawBody(10),status:409,op:attempt});
    assert.match(fail.code,/STOCK/);
    assert.equal((await call(roster.fifth,'/wallet/summary')).available_points,beforeDenied);
    assert.equal((await call(roster.fifth,'/redemption/draws')).items.length,0);
    e.checks.push({draw_id:draw.id,original_weights:true,point_back:100,no_win: none.id,count:10,
      no_second_debit_on_replay:true,stock_shortage:fail.code,zero_charge_and_no_draw:true});
    const originalGrant=key=>draw.data.results.find(item=>item.key===key).grant_id;
    const cast=await S.actorCast(buyer);
    const scope={person_id:cast.person.id,party_id:buyer.personal_party_id};
    const consentProof=await S.upload(buyer,'CONSENT_EVIDENCE');
    await S.grant(reviewer,'ARTIST_REVIEW_HALO');
    const halo=await cast.repo.requestHalo(buyer.ctx,{...scope,level:1,ownership_promise:true,
      evidence_asset_ids:[consentProof.id],service_id:null,operation_key:key()});
    await cast.repo.review(reviewer.ctx,{person_id:cast.person.id,record_id:halo.id,expected_version:halo.object_version,
      decision:'APPROVE',reason:'独立核对合成一级光环',operation_key:key()});
    const pendingConsent=await cast.repo.declareConsent(buyer.ctx,{...scope,avatar_id:cast.avatar.id,operation_key:key(),
      consent:{features:['FACE'],purposes:['PUBLIC_DISPLAY'],grantee_party_id:buyer.personal_party_id,territories:['WORLDWIDE'],
        valid_from:'2020-01-01T00:00:00.000Z',valid_until:'2099-01-01T00:00:00.000Z',
        terms:'仅允许合成曝光定向测试',evidence_asset_ids:[consentProof.id]}});
    await cast.repo.review(reviewer.ctx,{person_id:cast.person.id,record_id:pendingConsent.id,
      expected_version:pendingConsent.object_version,decision:'APPROVE',reason:'独立展示审核',operation_key:key()});
    const E=load('src/modules/engagement/repository').createEngagementRepository(db,{resolvePrincipal:S.resolvePrincipal});
    const profile=await E.rankingProfile(buyer.ctx,{...scope,city:'上海',district:'浦东',category:'合成视频',opt_in:true,operation_key:key()});
    const priority='/redemption/grants/'+originalGrant('priority');
    const primary=await call(buyer,priority);
    const gate=await call(buyer,priority+'/bind',{version:primary.object_version,status:409,
      body:{person_id:cast.person.id,avatar_id:cast.avatar.id,cast:cast.roster.cast[0],profile_id:null}});
    assert.equal(gate.code,'INTERVIEW_HALO_REQUIRED');
    const oldBalance=(await call(buyer,'/wallet/summary')).available_points;
    const complaint=await call(buyer,priority+'/remedies',{version:primary.object_version,body:{reason:'合成优先面试奖项目前未能安排合格批次'}});
    const settlement='/redemption/remedies/'+complaint.id+'/review';
    const relief={decision:'RETURN_POINTS',reason:'隔离独立核对原批次补救与原库存',evidence_asset_id:proof.id};
    const reliefKey=key();
    const resolved=await call(reviewer,settlement,{version:complaint.object_version,party:false,body:relief,op:reliefKey});
    assert.equal(resolved.current_status,'RESOLVED');
    assert.equal((await call(reviewer,settlement,{version:complaint.object_version,party:false,body:relief,op:reliefKey})).id,resolved.id);
    assert.equal((await call(buyer,priority)).current_status,'POINTS_RETURNED');
    assert.equal((await call(buyer,'/wallet/summary')).available_points,oldBalance+600);
    e.checks.push({priority_grant:primary.id,halo_gate:gate.code,remedy:complaint.id,one_fallback:600});
    const exposure='/redemption/grants/'+originalGrant('exposure');
    let active=await call(buyer,exposure);
    active=await call(buyer,exposure+'/bind',{version:active.object_version,
      body:{person_id:cast.person.id,avatar_id:cast.avatar.id,cast:null,profile_id:profile.id}});
    await call(producer,exposure+'/evidence-submissions',{version:active.object_version,body:{asset_id:proof.id,purpose:'SCHEDULE'}});
    const starts=new Date(Date.parse(advance)+3600000).toISOString(),ends=new Date(Date.parse(starts)+7*86400000).toISOString();
    const schedule=await call(fin,exposure+'/deliveries',{party:false,version:active.object_version,
      body:{starts_at:starts,ends_at:ends,reference:'同一中奖记录的七天合成展示档期',evidence_asset_id:proof.id}});
    await call(reviewer,'/redemption/deliveries/'+schedule.id+'/review',{party:false,version:schedule.object_version,
      body:{decision:'APPROVE',reason:'独立核准同中奖原展示档期'}});
    active=await call(buyer,exposure);
    active=await call(buyer,exposure+'/confirmation',{version:active.object_version,body:{accepted:true}});
    time.now=async()=>new Date(Date.parse(starts)+1000).toISOString();
    assert((await call(buyer,'/redemption/exposures?city='+encodeURIComponent('上海'),{party:false})).items.some(x=>x.person_id===cast.person.id));
    time.now=async()=>new Date(Date.parse(ends)+1000).toISOString();
    const conclusion={outcome:'EXPOSURE_COMPLETED',reason:'同一合成奖项完整周期已取证',evidence_asset_id:proof.id};
    assert.equal((await call(fin,exposure+'/finish',{party:false,status:409,version:active.object_version,body:conclusion})).code,
      'REWARD_EVIDENCE_NOT_FOUND');
    await call(producer,exposure+'/evidence-submissions',{version:active.object_version,body:{asset_id:proof.id,purpose:'COMPLETION'}});
    const finish=await call(fin,exposure+'/finish',{party:false,version:active.object_version,body:conclusion});
    assert.equal(finish.current_status,'FULFILLED');
    assert.equal(finish.id,active.id);
    assert.equal(finish.data.delivery.outcome,'EXPOSURE_COMPLETED');
    assert.deepEqual((await call(buyer,'/redemption/draws/'+draw.id)).data.results,draw.data.results);
    e.checks.push({exposure_grant:finish.id,schedule:schedule.id,visible_during_seven_days:true,actual_completion:true});
    const waiver='/redemption/grants/'+originalGrant('free');
    const waiverGrant=await call(buyer,waiver);
    const held=await call(buyer,waiver+'/checkout',{version:waiverGrant.object_version,body:{quote_id:offer.quote.id}});
    const accepted=await call(buyer,'/trade/quotes/'+offer.quote.id+'/acceptance',{version:offer.quote.object_version,
      body:{quote_sha256:offer.quote.content_sha256,reward_selection:{hold_id:held.id,
        adjusted_quote_sha256:held.data.adjusted_quote_sha256}}});
    assert.equal(accepted.current_status,'REWARD_FUNDED');
    assert.equal(accepted.data.quote.total_minor,0);
    assert.deepEqual(accepted.data.quote.installments,[]);
    const production=load('src/modules/production/repository').createProductionRepository(db,{resolvePrincipal:S.resolvePrincipal});
    let project=await production.create(producer.ctx,{party_id:S.org.party_id,order_id:accepted.id,line_id:'film',
      assignee_account_id:producer.account_id,script_version_id:S.work.id,license_project_id:null,consent_ids:[],purpose:'PRIVATE',
      territory:'CN',evidence_asset_id:S.proof.id,fulfillment:{uses_identifiable_people:false,cast:[]},operation_key:key()});
    project=await production.review(reviewer.ctx,{record_id:project.id,expected_version:project.object_version,decision:'APPROVED',
      reason:'独立核对同一免单合成制作项目',verification:{contract_sha256:project.data.contract_sha256,identity_verified:true,
        signatures_verified:true,rights_verified:true},operation_key:key()});
    const start={record_id:project.id,party_id:S.org.party_id,expected_version:project.object_version,operation_key:key()};
    await production.startCustomization(producer.ctx,start);
    await production.startCustomization(producer.ctx,start);
    assert.equal((await call(buyer,waiver)).current_status,'USED');
    const [[journal]]=await db.execute('SELECT COUNT(*) n FROM trade_journal WHERE order_id=?',[accepted.id]);
    assert.equal(Number(journal.n),0);
    e.checks.push({free_grant:waiverGrant.id,original_zero_cash_order:accepted.id,project:project.id,used_at_start_only:true,journal_rows:0});


    e.result='PASS';
  }catch(error){e.result='FAIL';e.failure=error.message;throw error;}
  finally{
    time.now=actualNow;
    lottery.draw=actualDraw;
    try{
      if(server){server.closeAllConnections();await new Promise(ok=>server.close(ok));}
      await db?.close();
      if(created&&/^jx_test_qa18_awards_[a-f0-9]{20}$/.test(name))await control.query('DROP DATABASE '+mysql.escapeId(name));
    }finally{await control.end();e.finished_at=new Date().toISOString();await save();}
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
