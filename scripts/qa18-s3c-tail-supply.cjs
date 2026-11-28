'use strict';
// One isolated stock revision/rights combination and one real-time editorial expiry.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {randomUUID:key,randomBytes,createHash}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const backend=path.join(root,'晶晶日上工程交接包/01_源码/backend_server');
const load=p=>require(path.join(backend,p));
load('scripts/test-network-guard.cjs');
const sha=b=>createHash('sha256').update(b).digest('hex');
const product='053168fb6e06b80680101702a733357309368809';

async function main(){
  const out=path.resolve(process.argv[2]||'');
  assert(out.startsWith(path.join(root,'.local/qa18')+path.sep));
  await fs.mkdir(out,{recursive:true});
  await fs.writeFile(path.join(out,'CREATE_ONCE'),'supply tail',{flag:'wx'});
  const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
  for(const [k,v] of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
  const database='jx_test_qa18_tail_supply_'+randomBytes(10).toString('hex');
  const proof={database,product,started_at:new Date().toISOString(),checkout:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),checks:[],requests:[]};
  const mysql=load('node_modules/mysql2/promise');
  const admin=await mysql.createConnection({host:env.MYSQL_HOST,port:+env.MYSQL_PORT,user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});
  let db,server,browser;
  const save=()=>fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify(proof,null,2)+'\n');
  async function stop(){if(browser){await browser.close();browser=null;}if(server){server.closeAllConnections();await new Promise(r=>server.close(r));server=null;}}
  async function section(name,body){try{await body();proof.checks.push({name,status:'PASS'});console.log('PASS '+name);}
    catch(e){proof.checks.push({name,status:'FAIL',message:e.message,code:e.code});console.error(name+': '+e.message);process.exitCode=1;}
    finally{await stop();await save();}}
  try {
    await admin.query('CREATE DATABASE '+mysql.escapeId(database)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');
    db=await load('src/infrastructure/database').openDatabase({...env,MYSQL_DATABASE:database});
    await load('src/infrastructure/database/migrator').migrate(db);
    const [m]=await db.execute('SELECT version,name,status FROM platform_schema_migrations ORDER BY version');
    assert.equal(m.length,225);
    assert(m.every(x=>x.status==='APPLIED'));
    proof.last_migration=m.at(-1);
    const createApi=load('src/http/account-api').createAccountApi;
    async function start(S,media){
      server=createApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory,supplyEnv:media||{}}).listen(0,'127.0.0.1');
      await new Promise((ok,bad)=>{server.once('listening',ok);server.once('error',bad);});
    }
    async function call(role,actor,url,{body,party,version,operation,status=200,code,expectedNoStore=false}={}){
      const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/v1'+url,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+actor.token,...party?{'X-Acting-Party':party}:{},...version?{'If-Match':'"'+version+'"'}:{},...body?{'Idempotency-Key':operation||key(),'Content-Type':'application/json'}:{}},...body?{body:JSON.stringify(body)}:{},signal:AbortSignal.timeout(12000)});
      const raw=Buffer.from(await r.arrayBuffer());
      const j=r.headers.get('content-type')?.includes('json')?JSON.parse(raw):null;
      proof.requests.push({role,path:url,method:body?'POST':'GET',status:r.status,...j?.error?.code?{code:j.error.code}:{},sha256:sha(raw),bytes:raw.length});
      assert.equal(r.status,status,url+' '+j?.error?.code);
      if(code)assert.equal(j.error.code,code);
      if(expectedNoStore)assert.equal(r.headers.get('cache-control'),'no-store');
      return j?.data??raw;
    }

    const scope=process.env.QA_TAIL_SUPPLY_SCOPE;
    if(scope!=='PORTRAIT_MINOR')await section('G01-G03-G05 original purchase survives two rejected/reviewed versions with distinct previews; revoked consent blocks fresh use',async()=>{
      const S=await load('test/helpers/stock-seed.cjs').seedStock(db);
      const {seller,buyer,reviewer,buyer2}=S,party=seller.personal_party_id;
      const media=process.env.JX_TEST_FFMPEG&&process.env.JX_TEST_FFPROBE
        ?{MEDIA_FFMPEG:process.env.JX_TEST_FFMPEG,MEDIA_FFPROBE:process.env.JX_TEST_FFPROBE}:{};
      const reference=path.join(root,'.local/v5-r05-r12-media');
      const [a,b]=await Promise.all(['full.mp4','preview.mp4'].map(n=>fs.readFile(path.join(reference,n))));
      assert.notEqual(sha(a),sha(b));
      const upload=bytes=>S.supply.upload(seller.ctx,{party_id:party,purpose:'WORK_CONTENT',media_type:'video/mp4',body:bytes,operation_key:key()});
      const full=await upload(a),preview=await upload(b);
      const coverTest=Boolean(media.MEDIA_FFMPEG);
      let swapFile=preview,swapPreview=full,newPreviewBytes=a;
      if(coverTest){
        const output=path.join(out,'replacement-preview.mp4');
        await load('src/modules/media/marking').run(media.MEDIA_FFMPEG,['-nostdin','-v','error','-f','lavfi','-i','color=c=green:s=320x180:d=1','-c:v','libx264','-threads','1','-y',output],{cwd:out});
        newPreviewBytes=await fs.readFile(output);
        assert(![sha(a),sha(b)].includes(sha(newPreviewBytes)));
        swapFile=full;
        swapPreview=await upload(newPreviewBytes);
      }
      const {party_id,...original}=S.listingInput;
      const input={...original,file_id:full.id,preview_file_id:preview.id};
      await start(S,media);
      if(process.env.QA_TAIL_SUPPLY_BROWSERS==='1'){
        proof.browser_requests=[];
        proof.browser_checks=[];
        const roles=Object.fromEntries(Object.entries({seller,buyer,reviewer,outsider:buyer2}).map(([role,who])=>
          [role,{bearer_token:who.token,party_id:who.personal_party_id,account_id:who.account_id}]));
        browser=await require('./test-fixtures/qa18-s4-artifact-browser.cjs').openBrowser(
          'http://127.0.0.1:'+server.address().port+'/api/v1',roles,proof);
      }
      async function observe(surface,role,route,label,observePage){
        if(!browser)return;
        console.log('Checking '+surface+' '+label);
        const page=await browser.actor(surface,role,route);
        try{
          const value=await observePage(page);
          proof.browser_checks.push({surface,role,label,result:'PASS'});
          await save();
          return value;
        }catch(error){
          proof.browser_checks.push({surface,role,label,result:'FAIL',message:error.message});
          const snapshot=await page.locator('body').ariaSnapshot({timeout:2000}).catch(()=>'');
          await fs.writeFile(path.join(out,surface+'-'+label+'.aria.txt'),snapshot);
          await save();
          throw error;
        }finally{await page.context().close();}
      }
      async function bothStatuses(listing,marker,webLabel){
        await observe('app','seller','/stock/listing?listingId='+listing.id,marker,async page=>{
          await page.getByRole('group',{name:/^上架状态与审核/}).waitFor();
          if(listing.current_status==='REJECTED')await page.getByRole('button',{name:'修改材料并重新提交审核',exact:true}).waitFor();
        });
        await observe('vue','seller','/stock/listings/'+listing.id,marker,async page=>{
          await page.getByText(webLabel,{exact:true}).first().waitFor();
        });
        if(browser)for(const surface of ['app','vue']) assert(proof.browser_requests.some(row=>
          row.surface===surface&&row.id===listing.id&&row.status===200&&row.state===listing.current_status),'Missing real '+surface+' response');
      }
      const sellerGet=url=>call('seller',seller,url,{party});
      const publicGet=(url,opts)=>call('buyer',buyer,url,opts);
      const offer=id=>'/stock/catalog/'+id;
      const buy=(url,opts)=>call('buyer',buyer,url,{...opts,party:buyer.personal_party_id});
      const revise=(from,body,operation)=>call('seller',seller,'/stock/listings/'+from.id+'/revisions',{party,version:from.object_version,body,operation});
      const approve=(r,channel)=>call('reviewer',reviewer,'/stock/listings/'+r.id+'/reviews',{version:r.object_version,body:{channel,decision:'APPROVED',reason:'Independent synthetic review',verification:channel==='RIGHTS'?{rights_verified:true,all_people_authorized:true,seller_qualified:true,source_sha256:r.data.files.full_sha256}:{content_verified:true,preview_watermark_verified:true,ai_labels_verified:true,source_sha256:r.data.files.full_sha256}}});
      assert.equal((await sellerGet('/stock/listings')).items.length,0);
      assert((await sellerGet('/stock/sales-publications')).items.some(x=>x.spec_id===S.spec.id));
      await observe('app','outsider','/stock/new','first-listing-no-selected-person',async page=>{
        await page.getByRole('button',{name:'卖方具体真人',exact:true}).waitFor();
        assert.equal(await page.getByRole('button',{name:'提交内容与权利双审核',exact:true}).count(),0);
        assert(!proof.browser_requests.some(row=>row.role==='outsider'&&row.method==='POST'));
      });
      await observe('vue','seller','/stock/listings?action=listing','first-listing-unverified-halo',async page=>{
        const eligibility=()=>page.getByTestId('stock-eligibility');
        // Isolated negative precondition. Restore fixture in finally before any real listing.
        await db.execute("UPDATE artist_records SET current_status='IN_REVIEW' WHERE id=?",[S.talentId]);
        try {
          await page.getByRole('button',{name:'读取可选卖方明确对应的真人',exact:true}).click();
          await page.locator('#listing-seller_person_id').selectOption(seller.person.id);
          await page.getByRole('button',{name:'重新核对上架资格',exact:true}).click();
          await eligibility().getByText(/主角光环人工审核：未满足/).waitFor();
          assert(await page.getByTestId('business-listing').isDisabled());
          assert(!proof.browser_requests.some(row=>row.method==='POST'));
        }finally {await db.execute("UPDATE artist_records SET current_status='APPROVED' WHERE id=?",[S.talentId]);}
      });
      if(scope==='STOCK_ELIGIBILITY_ONLY'){
        assert(browser);
        await db.execute("UPDATE artist_records SET current_status='IN_REVIEW' WHERE id=?",[S.talentId]);
        await observe('app','seller','/stock/new','first-listing-unverified-halo',async page=>{
          await page.waitForLoadState('networkidle',{timeout:12000});
          await page.getByRole('button',{name:'卖方具体真人',exact:true}).click();
          const eligibility=page.waitForResponse(r=>{
            const url=new URL(r.url());
            return url.pathname==='/api/v1/stock/seller-eligibility'&&url.searchParams.get('person_id')===seller.person.id;
          },{timeout:10000});
          eligibility.catch(()=>{});
          await page.getByRole('menuitem',{name:'synthetic person',exact:true}).click();
          const result=await eligibility;
          assert.equal(result.status(),200);
          assert.equal((await result.json()).data.manual_review_approved,false);
          await page.getByRole('textbox',{name:/画面与声音.*逐人核对/}).waitFor();
          await page.getByRole('button',{name:'本作品可识别出镜人数',exact:true}).click();
          await page.getByRole('menuitem',{name:'无可识别人物',exact:true}).click();
          const submit=page.getByRole('button',{name:'提交内容与权利双审核',exact:true});
          await submit.waitFor();
          assert(await submit.isDisabled());
          assert(!proof.browser_requests.some(row=>row.method==='POST'));
        });
        await db.execute("UPDATE artist_records SET current_status='APPROVED' WHERE id=?",[S.talentId]);
        proof.first_gate={same_person:seller.person.id,app_and_vue:true,no_submission:true};
        return;
      }
      const k=key();
      let first=await call('seller',seller,'/stock/listings',{party,body:input,operation:k});
      assert.equal((await call('seller',seller,'/stock/listings',{party,body:input,operation:k})).id,first.id);
      await publicGet(offer(first.id),{status:409,code:'STOCK_NOT_LISTED'});
      await bothStatuses(first,'first-review','待独立审核');
      first=await approve(first,'RIGHTS');
      await publicGet(offer(first.id),{status:409,code:'STOCK_NOT_LISTED'});
      first=await approve(first,'CONTENT');
      assert.equal((await publicGet(offer(first.id))).id,first.id);
      assert.equal(sha(await publicGet(offer(first.id)+'/preview',{expectedNoStore:true})),sha(b));
      if(scope==='STOCK_PORTAL_ONLY'){
        const origin='http://127.0.0.1:'+server.address().port;
        const gates=[];
        for(const route of ['/api/scripts/apply','/api/scripts/upload']){
          const res=await fetch(origin+route,{method:'POST',headers:{Authorization:'Bearer '+seller.token,
            'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(10000)});
          const bytes=await res.arrayBuffer();
          assert([404,410].includes(res.status),route);
          gates.push({route,status:res.status,sha256:sha(Buffer.from(bytes))});
        }
        proof.simultaneous_paths={legacy_writer:gates,new_stock_listing:first.id,reviewed_preview_sha256:sha(b),status:first.current_status};
        return;
      }
      const order=await S.checkout(first);
      await S.payment(order);
      const purchased='/stock/purchases/'+order.id;
      const frozen=await buy(purchased);
      const oldFile=await buy(purchased+'/content');
      assert.equal(sha(oldFile),sha(a));
      let rejected=await revise(first,{...input,file_id:swapFile.id,preview_file_id:swapPreview.id,description:'Synthetic proposed replacement'},key());
      rejected=await call('reviewer',reviewer,'/stock/listings/'+rejected.id+'/reviews',{version:rejected.object_version,body:{channel:'CONTENT',decision:'REJECTED',reason:'Synthetic revision requires resubmission',verification:null}});
      assert.equal(rejected.current_status,'REJECTED');
      await bothStatuses(rejected,'revision-returned','已退回');
      await publicGet(offer(rejected.id),{status:409,code:'STOCK_NOT_LISTED'});
      const rv={...input,file_id:swapFile.id,preview_file_id:swapPreview.id,description:'Synthetic independently corrected replacement'}, rk=key();
      let next;
      if(browser){
        next=await observe('app','seller','/stock/listing?listingId='+rejected.id+'&action=revise','app-revise-same-listing',async page=>{
          const edit=page.getByRole('textbox',{name:/作品内容与范围/});
          await edit.click();
          await page.keyboard.press('Control+A');
          await page.keyboard.press('Backspace');
          await page.keyboard.insertText(rv.description);
          const submit=page.getByRole('button',{name:'提交内容与权利双审核',exact:true});
          await submit.click();
          const confirm=page.getByRole('button',{name:'确认办理',exact:true});
          const response=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/v1/stock/listings/'+rejected.id+'/revisions');
          response.catch(()=>{});
          await confirm.click();
          const sent=await response,json=await sent.json();
          assert.equal(sent.status(),200,json.error?.code);
          assert.equal(json.data.data.previous_listing_id,rejected.id);
          assert.equal(json.data.data.description,rv.description);
          return json.data;
        });
        await bothStatuses(next,'new-revision-review','待独立审核');
      }else{
        next=await revise(rejected,rv,rk);
        assert.equal((await revise(rejected,rv,rk)).id,next.id);
      }
      await publicGet(offer(next.id)+'/preview',{status:409});
      await call('seller',seller,'/stock/listings/'+next.id+'/revisions',{party,version:9999,body:rv,status:412});
      async function reviewReplacement(record,channel){
        if(!browser)return approve(record,channel);
        const kind=channel.toLowerCase();
        return observe('vue','reviewer','/stock/reviews/'+record.id,'approve-'+kind,async page=>{
          const title=channel==='CONTENT'?'独立审核影片内容':'独立审核销售权利';
          await page.locator('.business-actions').getByRole('button',{name:title,exact:true}).click();
          await page.locator('#'+kind+'-decision').selectOption('APPROVED');
          await page.locator('#'+kind+'-reason').fill('独立核对原商品改版与本次材料，合成审核。');
          for(const box of await page.locator('.business-form').last().locator('input[type=checkbox]').all())await box.check();
          const wait=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/v1/stock/listings/'+record.id+'/reviews');
          wait.catch(()=>{});
          await page.getByTestId('business-'+kind).click();
          const response=await wait,json=await response.json();
          assert.equal(response.status(),200,json.error?.code);
          assert.equal(json.data.id,record.id);
          return json.data;
        });
      }
      next=await reviewReplacement(next,'CONTENT');
      await publicGet(offer(next.id),{status:409,code:'STOCK_NOT_LISTED'});
      next=await reviewReplacement(next,'RIGHTS');
      const pub=await publicGet(offer(next.id));
      assert.equal(pub.id,next.id);
      const newPreview=await publicGet(offer(next.id)+'/preview',{expectedNoStore:true});
      assert.equal(sha(newPreview),sha(newPreviewBytes));
      await publicGet(offer(first.id)+'/preview',{status:409,code:'STOCK_NOT_LISTED'});
      assert.equal(sha(await buy(purchased+'/content')),sha(a));
      const originalPurchase=await buy(purchased);
      assert.equal(originalPurchase.contract_sha256,frozen.contract_sha256);
      assert.deepEqual(originalPurchase.data.license,frozen.data.license);
      await bothStatuses(next,'replacement-listed','可销售');
      if(media.MEDIA_FFMPEG){
        const metadata=await publicGet(offer(next.id)+'/media',{expectedNoStore:true});
        const cover=await publicGet(offer(next.id)+'/cover',{expectedNoStore:true});
        assert.equal(sha(cover),metadata.cover.content_sha256);
        assert.equal(metadata.cover.source,'REVIEWED_PREVIEW');
        assert.equal(metadata.preview_duration_ms,1000);
        proof.cover={after_revision:metadata.cover.content_sha256,duration_ms:metadata.duration_ms,preview_duration_ms:metadata.preview_duration_ms,no_store:true,preview_is_distinct_from_original_full:true};
        await publicGet(offer(first.id)+'/cover',{status:409,code:'STOCK_NOT_LISTED'});
      }else proof.cover={status:'BLOCKED_LOCAL_TOOL',scope:'actual preview bytes verified; JPEG generation remains separate'};
      const display=await S.artists.declareConsent(seller.ctx,{person_id:seller.person.id,party_id:party,avatar_id:S.avatar.id,consent:{features:['FACE'],purposes:['PUBLIC_DISPLAY'],grantee_party_id:party,territories:['WORLDWIDE'],valid_from:'2020-01-01T00:00:00.000Z',valid_until:'2099-01-01T00:00:00.000Z',terms:'Synthetic display-only consent',evidence_asset_ids:[S.evidence.id]},operation_key:key()});
      const displayApproved=await S.artists.review(reviewer.ctx,{person_id:seller.person.id,record_id:display.id,expected_version:display.object_version,decision:'APPROVE',reason:'Synthetic display only review',operation_key:key()});
      assert.equal(displayApproved.current_status,'APPROVED');
      const wrongConsent={...input,participants:[{...input.participants[0],consent_id:displayApproved.id}]};
      await call('seller',seller,'/stock/listings',{party,body:wrongConsent,status:409,code:'STOCK_SALE_CONSENT_REQUIRED'});
      await call('seller',seller,'/artists/people/'+seller.person.id+'/records/'+S.consent.id+'/withdrawals',{party,version:S.consent.object_version,body:{reason:'Synthetic authorized withdrawal for one product'}});
      await publicGet(offer(next.id)+'/preview',{status:409,code:'STOCK_SALE_CONSENT_REQUIRED'});
      if(media.MEDIA_FFMPEG)await publicGet(offer(next.id)+'/cover',{status:409,code:'STOCK_SALE_CONSENT_REQUIRED'});
      await buy(purchased+'/content',{status:409,code:'STOCK_SALE_CONSENT_REQUIRED'});
      const end=await buy(purchased);
      assert.equal(end.contract_sha256,frozen.contract_sha256);
      assert.equal(end.data.status,frozen.data.status);
      const [money]=await db.execute('SELECT direction,amount_minor FROM trade_journal WHERE order_id=?',[order.id]);
      assert.deepEqual(money.map(x=>[x.direction,Number(x.amount_minor)]),[['RECEIPT',100]]);
      proof.stock={first:first.id,rejected:rejected.id,replacement:next.id,original_order:order.id,original_contract_sha256:end.contract_sha256,original_file_sha256:sha(oldFile),replacement_preview_sha256:sha(newPreview),same_order_ledger_receipts:1};
    });

    if(!scope)await section('G06 reviewed editorial selection expires in real time and underlying public artist remains accessible',async()=>{
      const S=await load('test/helpers/directory-seed.cjs').seedDirectory(db);
      const {buyer,outsider,reviewer}=S;
      const grant=load('src/modules/governance/operator-access').maintainOperatorGrant;
      for(const u of [outsider,reviewer]){
        for(const action of ['SUPPLY_REVIEW_PROFILE','ARTIST_REVIEW_CONTENT']){
          const [found]=await db.execute('SELECT id FROM governance_operator_grants WHERE account_id=? AND action_code=?',[u.account_id,action]);
          if(!found.length)await grant(db,{account_id:u.account_id,action,enabled:true,expected_version:0,expires_at:null,authority_ref:'synthetic:s3c-tail',reason:'Independent editorial test'});
        }
      }
      await start(S);
      const resolved=await db.execute('SELECT UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS now');
      const begin=Number(resolved[0][0].now);
      const until=new Date(begin+9000).toISOString();
      const feature={listing_id:S.publicListing.id,recommendation:'Synthetic limited editorial selection',sort_order:4,valid_from:new Date(begin-2000).toISOString(),valid_until:until};
      const draft=await call('operator',outsider,'/directory/featured-artists',{body:{feature}});
      const approved=await call('reviewer',reviewer,'/directory/records/'+draft.id+'/reviews',{version:draft.object_version,body:{decision:'APPROVE',reason:'Independent selection review',checks:{public_source_verified:true,recommendation_reviewed:true,not_star_certification:true}}});
      const listing='/artists/catalog/'+S.publicListing.id;
      const get=id=>call('buyer',buyer,id);
      const items=(await get('/directory/featured-artists')).items;
      assert(items.some(x=>x.record_id===approved.id&&x.selection_kind==='EDITORIAL_SELECTION'));
      assert.equal((await get(listing)).listing_id,S.publicListing.id);
      await new Promise(r=>setTimeout(r,Math.max(0,Date.parse(until)-Date.now()+250)));
      assert(!(await get('/directory/featured-artists')).items.some(x=>x.record_id===approved.id));
      assert.equal((await get(listing)).listing_id,S.publicListing.id);
      proof.editorial={id:approved.id,artist_listing:S.publicListing.id,valid_until:until,checked_after:new Date().toISOString(),clock_changed:false};
    });

    if(scope==='PORTRAIT_MINOR')await section('G02/G05 own portrait version and minor protective report remain separated from trading authority',async()=>{
      const S=await load('test/helpers/directory-seed.cjs').seedDirectory(db);
      const {seller,buyer2,outsider,reviewer}=S;
      const prior=S.publicListing;
      const person=seller.person.id,party=seller.personal_party_id;
      const listingPath='/artists/catalog/',memberPath='/artists/people/'+person;
      const grant=load('src/modules/governance/operator-access').maintainOperatorGrant;
      await grant(db,{account_id:reviewer.account_id,action:'SUPPORT_HANDLE',enabled:true,expected_version:0,
        expires_at:null,authority_ref:'synthetic:s3c-tail',reason:'Isolated reviewer'});
      const childContext={};
      S.principals.set(childContext,{subject_ref:'synthetic:'+key()});
      const child={ctx:childContext,...await S.parties.registerAccount(childContext,{display_name:'Synthetic minor applicant'}),
        token:randomBytes(32).toString('base64url')};
      const auth=load('src/modules/auth/repository').createAuthRepository(db,{secret:S.secret});
      await db.execute('INSERT INTO auth_sessions(token_hash,account_id,expires_ms) VALUES (?,?,ROUND(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000)+3600000)',
        [auth.secure.digest('token',child.token),child.account_id]);
      const childPerson=await S.artists.createPerson(child.ctx,{party_id:child.personal_party_id,display_name:'Synthetic minor',operation_key:key()});
      const childCheck=await S.artists.prepareIdentity(child.ctx,{party_id:child.personal_party_id,person_id:childPerson.id,
        session_ref:'synthetic:'+key(),operation_key:key()});
      const verifiedChild=await S.artists.applyIdentity(childCheck.id,{request_key:childCheck.data.request_key,person_id:childPerson.id,
        status:'VERIFIED',issuer:'synthetic-provider',subject_fingerprint:sha(Buffer.from(child.account_id)),age_band:'MINOR',
        valid_until:'2099-01-01T00:00:00.000Z',evidence_ref:'synthetic:age',liveness_verified:true,phone_verified:true});
      assert.equal(verifiedChild.data.result.age_band,'MINOR');
      await start(S);
      const reportInput={kind:'REPORT',title:'Synthetic youth content report',
        target:{domain:'ARTIST_PUBLIC',record_id:prior.id},text:'Please examine the synthetic preview.',asset_ids:[]};
      const originalKey=key(),tickets='/support/tickets';
      const postComplaint=()=>call('synthetic-minor',child,tickets,{party:child.personal_party_id,body:reportInput,operation:originalKey});
      let complaint=await postComplaint();
      assert.equal((await postComplaint()).id,complaint.id);
      const casePath=tickets+'/'+complaint.id,operatorPath='/support/operations/tickets/'+complaint.id;
      await call('unrelated',outsider,casePath,{party:outsider.personal_party_id,status:404});
      await call('unrelated',outsider,operatorPath,{status:403});
      complaint=await call('separate-handler',reviewer,operatorPath+'/actions',{version:complaint.object_version,
        body:{action:'START',text:'Synthetic review started',asset_ids:[]}});
      complaint=await call('separate-handler',reviewer,operatorPath+'/actions',{version:complaint.object_version,
        body:{action:'ANSWER',text:'Synthetic assessment provided to applicant',asset_ids:[]}});
      assert.equal(complaint.current_status,'ANSWERED');
      assert.equal((await call('synthetic-minor',child,casePath,{party:child.personal_party_id})).current_status,'ANSWERED');
      for(const route of ['/wallet/recharges','/auditions/bookings','/redemption/draws','/engagement/votes']) {
        await call('synthetic-minor',child,route,{party:child.personal_party_id,body:{},status:403,code:'MINOR_OPERATION_RESTRICTED'});
      }
      const tagged=await call('synthetic-minor',child,tickets,{party:child.personal_party_id});
      assert.equal(tagged.items.filter(x=>x.id===complaint.id).length,1);
      proof.minor={synthetic_person_id:childPerson.id,case_id:complaint.id,case_status:complaint.current_status,
        complaint_cases:1,direct_trading_or_activities_rejected:4,independent_handler:true};

      const scopeBody={person_id:person,party_id:party};
      const publicGet=(url,opts)=>call('viewer',buyer2,url,opts);
      const artistAssets=load('src/modules/works/assets').createSupplyAssets({db,
        repository:load('src/modules/artists/assets').createArtistAssetsRepository(db,{resolvePrincipal:S.resolvePrincipal}),storageFactory:S.storageFactory});
      const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+0s4sAAAAASUVORK5CYII=','base64');
      const material=await artistAssets.upload(seller.ctx,{...scopeBody,purpose:'AVATAR_MATERIAL',media_type:'image/png',body:png,operation_key:key()});
      const variant=await call('seller',seller,memberPath+'/variants',{party,body:{avatar_id:S.avatar.id,kind:'LOOK',variant:{
        previous_version_id:prior.data.look_version_id,display_name:'Synthetic replacement portrait',
        material_asset_ids:[material.id],consent_id:S.publicConsent.id}}});
      const initial=await publicGet(listingPath+prior.id+'/media',{expectedNoStore:true});
      assert.equal(initial.primary_portrait_asset_id,null);
      const revised={display_name:prior.data.display_name,city:prior.data.city,introduction:prior.data.introduction,
        tags:prior.data.tags,consent_id:S.publicConsent.id,look_version_id:variant.id,voice_version_id:null,
        audition_public:false,preview_asset_ids:[material.id],primary_portrait_asset_id:material.id};
      await call('seller',seller,memberPath+'/listings',{party,body:{avatar_id:S.avatar.id,
        listing:{...revised,primary_portrait_asset_id:prior.data.preview_asset_ids[0]}},status:409,code:'ARTIST_PORTRAIT_NOT_IN_PREVIEW'});
      const submitted=await call('seller',seller,memberPath+'/listings',{party,body:{avatar_id:S.avatar.id,listing:revised}});
      await publicGet(listingPath+submitted.id+'/media',{status:404});
      const accepted=await call('operator',reviewer,memberPath+'/records/'+submitted.id+'/reviews',
        {version:submitted.object_version,body:{decision:'APPROVE',reason:'Independent synthetic portrait review'}});
      const manifest=await publicGet(listingPath+accepted.id+'/media',{expectedNoStore:true});
      await publicGet(listingPath+prior.id+'/media',{status:404,code:'ARTIST_NOT_FOUND'});
      assert.equal(manifest.primary_portrait_asset_id,material.id);
      assert.equal(manifest.items.find(x=>x.asset_id===material.id).content_sha256,sha(png));
      const filePath=listingPath+accepted.id+'/assets/'+material.id+'/content';
      assert.deepEqual(await publicGet(filePath,{expectedNoStore:true}),png);
      await publicGet(listingPath+accepted.id+'/assets/'+prior.data.preview_asset_ids[0]+'/content',{status:404});
      const [[storage]]=await db.execute('SELECT object_key FROM supply_assets WHERE id=?',[material.id]);
      S.bytes.set(storage.object_key,Buffer.from('deliberate synthetic corrupted portrait'));
      try {
        await assert.rejects(artistAssets.download(seller.ctx,material.id,party),{code:'PRIVATE_CONTENT_MISMATCH'});
        await publicGet(filePath,{status:503,code:'SERVICE_UNAVAILABLE'});
      }
      finally {S.bytes.set(storage.object_key,png);}
      const withdrawal=await call('seller',seller,memberPath+'/records/'+S.publicConsent.id+'/withdrawals',
        {party,version:S.publicConsent.object_version,body:{reason:'Synthetic owner withdrew face display authorization'}});
      assert.equal(withdrawal.current_status,'WITHDRAWN');
      await publicGet(listingPath+accepted.id+'/media',{status:409,code:'ARTIST_CONSENT_REQUIRED'});
      await publicGet(listingPath+prior.id+'/media',{status:404,code:'ARTIST_NOT_FOUND'});
      await publicGet(filePath,{status:409,code:'ARTIST_CONSENT_REQUIRED'});
      assert.equal((await call('synthetic-minor',child,casePath,{party:child.personal_party_id})).id,complaint.id);
      proof.portrait={prior_listing:prior.id,new_listing:accepted.id,approved_asset:material.id,sha256:sha(png),
        consent:withdrawal.id,withdrew_at:withdrawal.data.withdrawal.at,synthetic_storage_corruption_rejected:true};
    });
  }finally{
    await stop();
    await db?.close();
    await admin.end();
    proof.finished_at=new Date().toISOString();
    await save();
  }
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
