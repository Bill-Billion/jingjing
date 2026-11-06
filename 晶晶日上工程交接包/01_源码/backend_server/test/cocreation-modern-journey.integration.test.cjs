'use strict';
// Composition test: private invitations + the October contract + original production.
// Identity/material prerequisites and provider receipts are explicitly synthetic.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const mysql=require('mysql2/promise'),{randomUUID:key,randomBytes,createHash}=require('node:crypto');
const A=require('../src/modules/artists/context');
test('private invitations reach twenty-person production under new contract without changing old commitments',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 for(const [k,v] of Object.entries({NODE_ENV:'test',DB_CLIENT:'mysql',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const database='jx_test_co_modern_'+randomBytes(8).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});
 const checks=[],requests=[],fixtures=[];let db,server,created=false,failed=false;
 const hash=b=>createHash('sha256').update(b).digest('hex');
 async function check(label,task){await t.test(label,async()=>{try{const records=await task();checks.push({id:'CO-MODERN-'+String(checks.length+1).padStart(2,'0'),name:label,result:'PASS',records:records||{}});}catch(e){failed=true;checks.push({name:label,result:'FAIL',error:e.code||e.message});throw e;}});}
 try{
  await control.query('CREATE DATABASE '+mysql.escapeId(database)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');created=true;
  db=await require('../src/infrastructure/database').openDatabase({...env,MYSQL_DATABASE:database,MYSQL_CONNECTION_LIMIT:'1'});await require('../src/infrastructure/database/migrator').migrate(db);
  const f=await require('./support/customization-delivery.cjs').seed(db),{buyer,producer,reviewer,outsider}=f.people;
  for(const u of [producer,reviewer])await f.grant(u,'COCREATION_REVIEW');
  server=require('../src/http/account-api').createAccountApi({db,secret:f.secret,supplyStorageFactory:f.storageFactory,tradeEnv:{CUSTOMIZATION_MERCHANT_PARTY_ID:f.org.party_id,CUSTOMIZATION_CONTRACT_POLICY:'CONTRACT_20261029',COPYRIGHT_CONTRACT_POLICY:'CONTRACT_20261029'}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port+'/api/v1';
  async function call(method,url,u,body,version,op=key(),party=u===reviewer?null:u.acting_party_id){
   const res=await fetch(base+url,{method,headers:{Authorization:'Bearer '+u.token,...party?{'X-Acting-Party':party}:{},...body===undefined?{}:{'Content-Type':Buffer.isBuffer(body)?'application/octet-stream':'application/json','Idempotency-Key':op},...version?{'If-Match':'"'+version+'"'}:{}},...body===undefined?{}:{body:Buffer.isBuffer(body)?body:JSON.stringify(body)},signal:AbortSignal.timeout(20000)});
   const binary=!(res.headers.get('content-type')||'').includes('json'),value=binary?Buffer.from(await res.arrayBuffer()):await res.json();
   requests.push({method,path:new URL(base+url).pathname,actor:u.account_id,status:res.status,error:binary?null:value.error?.code||null});
   if(!binary){const schema=!res.ok?'ErrorResponse':url.includes('/invite-links')?(url.endsWith('/claim')?'CocreationInviteClaimResponse':'CocreationInviteLinkResponse'):url.startsWith('/cocreation')?'CocreationResponse':url.startsWith('/trade')?'TradeRecordResponse':url.endsWith('/start')?'CustomizationFulfillmentResponse':'ProductionRecordResponse';fixtures.push({method,path:new URL(base+url).pathname,schema,value});}
   if(!res.ok)throw Object.assign(new Error(value.error?.code),{code:value.error?.code,status:res.status});return binary?value:value.data;
  }
  const bad=(p,code)=>assert.rejects(p,e=>{assert.equal(e.code,code);return true;});
  let rule=await call('POST','/cocreation/rules',producer,{rule:{version:'synthetic-modern-family',source_ref:'synthetic:contract-19-and-13',max_people:40,extension_days:7,participation_terms:'Synthetic separate participation, never consent by host.',benefit:{service_code:'synthetic-credit',description:'Synthetic noncash service credit',credit_minor:1000,valid_days:30}}},null,key(),null);
  rule=await call('POST','/cocreation/rules/'+rule.id+'/review',reviewer,{decision:'APPROVE',reason:'Synthetic independent review'},rule.object_version);
  const people=[];for(let n=0;n<20;n++){const user=await f.registerActor('Synthetic private guest '+n);people.push({user,...await f.actorCast(user)});}
  let room,order,project,member,final,snippet;const members=[];
  const getRoom=()=>call('GET','/cocreation/rooms/'+room.id,buyer);
  const reviewTrade=r=>call('POST','/trade/records/'+r.id+'/reviews',reviewer,{decision:'APPROVED',reason:'Synthetic independent contract review'},r.object_version);
  await check('one shared order freezes new 30/40/30, reviewed calendar, copyright and room promise',async()=>{
   let prepared;const stop=new Error('quote fixture only');
   await assert.rejects(f.newOrder({preview:'SCRIPT_BEFORE_INTERIM',calendar:require('./support/working-calendar.cjs')(),copyrightTerms:require('./support/copyright-terms.cjs')(),beforeQuote:async({story})=>{
    const at=await db.withTransaction(tx=>A.now(tx));room=await call('POST','/cocreation/rooms',buyer,{request_id:story.id,rule_id:rule.id,producer_party_id:f.org.party_id,title:'Synthetic family shared film',deadline:new Date(Date.parse(at)+600000).toISOString(),purpose:'PRIVATE',territory:'CN'});
   },beforeAccept:async x=>{prepared=x;throw stop;}}),e=>e===stop);
   const q=prepared.quote.data,body={buyer_party_id:buyer.acting_party_id,lines:[{line_id:'film',spec_id:prepared.spec.id,quantity:1}],...Object.fromEntries(['installments','channel','transaction_model','rule_id','expires_at','payment_window_minutes','license_reservation_id'].map(k=>[k,q[k]])),customization_source:q.customization};
   const quote=await reviewTrade(await call('POST','/trade/quotes',producer,body));order=await call('POST','/trade/quotes/'+quote.id+'/acceptance',buyer,{quote_sha256:quote.content_sha256},quote.object_version);
   assert.deepEqual(order.data.quote.installments.map(x=>x.allocations[0].amount_minor),[3000,4000,3000]);assert.equal(order.data.quote.installments[1].trigger,'CUSTOMIZATION_SCRIPT_CONFIRMED');
   assert.equal(order.data.quote.lines[0].specification.customization_delivery.acceptance_working_days,5);assert.equal(order.data.quote.customization_copyright.terms.mode,'BUYER_OWNERSHIP');
   assert.equal(order.data.quote.cocreation.room_id,room.id);assert.deepEqual(order.data.contract.commitments.quote,order.data.quote);
   return {room_id:room.id,order_id:order.id,installments:[3000,4000,3000]};
  });
  await check('twenty private adults claim invitations; claiming alone adds no participants or personal orders',async()=>{
   for(const p of people){const r=await getRoom(),link=await call('POST','/cocreation/rooms/'+room.id+'/invite-links',buyer,{},r.object_version),op=key(),body={token:link.token,person_id:p.person.id};const invite=await call('POST','/cocreation/invite-links/claim',p.user,body,null,op);assert.deepEqual(await call('POST','/cocreation/invite-links/claim',p.user,body,null,op),invite);}
   const r=await getRoom();assert.equal(r.counts.joined_count,0);assert.equal(r.counts.eligible_count,0);assert.equal(r.order_id,order.id);await bad(call('GET','/cocreation/rooms/'+room.id,outsider),'COCREATION_NOT_FOUND');return {room_id:room.id,claimed:20,joined:0};
  });
  await check('each person confirms materials separately; unpaid participants do not qualify and retry does not double count',async()=>{
   for(let i=0;i<20;i++){const p=people[i],r=await getRoom(),op=key(),body={person_id:p.person.id,cast:p.roster.cast,private_story:'PRIVATE synthetic '+i,material_asset_ids:p.look.data.material_asset_ids,sharing_allowed:true,participation_sha256:r.participation_sha256,agreed:true};
    if(i===0)await bad(call('POST','/cocreation/rooms/'+room.id+'/members',p.user,{...body,agreed:false}),'COCREATION_PARTICIPATION_REQUIRED');
    const m=await call('POST','/cocreation/rooms/'+room.id+'/members',p.user,body,null,op);assert.deepEqual(await call('POST','/cocreation/rooms/'+room.id+'/members',p.user,body,null,op),m);members.push(m);
    const next=await getRoom();assert.equal(next.counts.joined_count,i+1);assert.equal(next.counts.eligible_count,0);assert(!JSON.stringify(next).includes('PRIVATE synthetic'));
   }
   member=members[0];await bad(call('GET','/cocreation/members/'+member.id,buyer),'ARTIST_NOT_FOUND');return {room_id:room.id,joined:20,eligible:0,member_ids:members.map(x=>x.id)};
  });
  await check('first payment qualifies twenty people; cutoff creates one noncash benefit and one original order',async()=>{
   await f.pay(order,'first');let r=await getRoom();assert.equal(r.counts.eligible_count,20);await bad(call('POST','/cocreation/rooms/'+room.id+'/close',buyer,{},r.object_version),'COCREATION_CUTOFF_NOT_DUE');
   // Only the one-connection random test database clock advances; no row status is edited.
   await db.execute('SET timestamp=?',[Math.floor(Date.parse(r.deadline)/1000)+1]);r=await call('POST','/cocreation/rooms/'+room.id+'/close',buyer,{},r.object_version);assert.equal(r.current_status,'READY');assert.equal(r.cutoff.eligible_count,20);
   await call('POST','/cocreation/rooms/'+room.id+'/close',buyer,{},r.object_version);const benefits=await call('GET','/cocreation/benefits',buyer);assert.equal(benefits.items.length,1);assert.equal(benefits.items[0].data.non_cash,true);assert.equal(benefits.items[0].data.units,1);
   assert.equal(Number((await db.execute("SELECT COUNT(*) n FROM trade_records WHERE kind='ORDER'"))[0][0].n),1);return {room_id:room.id,order_id:order.id,benefit_id:benefits.items[0].id,eligible_at_cutoff:20};
  });
  const getProject=()=>call('GET','/production/records/'+project.id,producer),cmd=async(action,u,body={})=>call('POST','/production/projects/'+project.id+'/'+action,u,body,(await getProject()).object_version);
  const checklist=stage=>stage==='SCRIPT'?{script_reviewed:true}:{script_reviewed:true,specification_reviewed:true,audio_reviewed:true,branding_reviewed:true};
  const reviewP=p=>call('POST','/production/records/'+p.id+'/reviews',reviewer,{decision:'APPROVED',reason:'Synthetic independent review',verification:p.kind==='PROJECT'?{contract_sha256:p.data.contract_sha256,identity_verified:true,signatures_verified:true,rights_verified:true}:{...checklist(p.data.stage),...(p.data.stage==='SCRIPT'?{}:{commercial_watermark_verified:true,ai_label_verified:true})}},p.object_version);
  async function file(stage){return call('POST','/production/projects/'+project.id+'/files?media_type='+encodeURIComponent(stage==='SCRIPT'?'text/plain':'video/mp4'),producer,Buffer.from('synthetic protocol bytes '+key()));}
  async function deliver(stage){const a=await file(stage),b=stage==='SCRIPT'?a:await file(stage);return reviewP(await cmd('versions',producer,{stage,file_id:a.id,preview_file_id:b.id,note:'Synthetic protocol only; media quality not tested'}));}
  async function accept(v){await call('GET','/production/versions/'+v.id+'/content?variant=preview',buyer);return call('POST','/production/versions/'+v.id+'/feedback',buyer,{decision:'ACCEPT',note:'Synthetic explicit confirmation',checklist:checklist(v.data.stage),change_kind:null},v.object_version);}
  await check('independently reviewed project keeps twenty separate authorizations; host cannot read other peoples private materials',async()=>{
   project=await reviewP(await call('POST','/production/projects',producer,{order_id:order.id,line_id:'film',script_version_id:f.work.id,license_project_id:null,assignee_account_id:producer.account_id,purpose:'PRIVATE',territory:'CN',consent_ids:[],evidence_asset_id:f.proof.id,fulfillment:{uses_identifiable_people:true,cast:[]}}));
   await cmd('start',producer);const first=await call('GET','/cocreation/rooms/'+room.id+'/materials?limit=10',producer),second=await call('GET','/cocreation/rooms/'+room.id+'/materials?limit=10&cursor='+first.next_cursor,producer);assert.equal(first.items.length+second.items.length,20);assert.equal(new Set([...first.items,...second.items].map(x=>x.id)).size,20);
   await bad(call('GET','/cocreation/rooms/'+room.id+'/materials',buyer),'COCREATION_PRODUCER_FORBIDDEN');return {room_id:room.id,project_id:project.id,material_count:20};
  });
  await check('new contract collects 40 percent after script acceptance, then samples and final require separate reviews',async()=>{
   await assert.rejects(f.pay(order,'interim'));const script=await deliver('SCRIPT');await accept(script);const p=await f.pay(order,'interim');assert.equal(p.data.amount_minor,4000);await accept(await deliver('SAMPLE'));await accept(await deliver('ROUGH_CUT'));final=await deliver('FINAL');return {order_id:order.id,script_version_id:script.id,final_version_id:final.id,interim_minor:4000};
  });
  await check('personal clip remains unavailable until final acceptance and remaining 30 percent; other people cannot download',async()=>{
   const clip=await file('FINAL');snippet=await call('POST','/cocreation/rooms/'+room.id+'/snippets',producer,{member_id:member.id,file_id:clip.id,final_version_id:final.id,note:'Synthetic own-person clip'});
   const original=await call('GET','/cocreation/snippets/'+snippet.id+'/review-file',reviewer);snippet=await call('POST','/cocreation/snippets/'+snippet.id+'/review',reviewer,{decision:'APPROVE',reason:'Synthetic independent person/marking check',verification:{only_target_person:true,authorization_marked:true,ai_label_verified:true,content_reviewed:true}},snippet.object_version);
   const url='/cocreation/snippets/'+snippet.id+'/file';await bad(call('GET',url,people[0].user),'COCREATION_SNIPPET_NOT_READY');await accept(final);await bad(call('GET',url,people[0].user),'COCREATION_SNIPPET_NOT_READY');const payment=await f.pay(order,'last');assert.equal(payment.data.amount_minor,3000);assert.equal(hash(await call('GET',url,people[0].user)),hash(original));
   await bad(call('GET',url,people[1].user),'COCREATION_NOT_FOUND');await bad(call('GET',url,buyer),'COCREATION_NOT_FOUND');await bad(call('GET','/production/versions/'+final.id+'/content?variant=final',people[0].user),'PRODUCTION_NOT_FOUND');return {order_id:order.id,snippet_id:snippet.id,content_sha256:hash(original),final_payment_minor:3000};
  });
  await check('withdrawal pauses old production and downloads; independent recovery keeps old cutoff but requires new versions',async()=>{
   member=await call('POST','/cocreation/members/'+member.id+'/withdraw',people[0].user,{reason:'Synthetic personal withdrawal'},member.object_version);let r=await getRoom();assert.equal(r.current_status,'PAUSED');assert.equal(r.cutoff.eligible_count,20);await bad(call('GET','/cocreation/snippets/'+snippet.id+'/file',people[0].user),'COCREATION_PARTICIPATION_REQUIRED');await bad(file('FINAL'),'CUSTOMIZATION_PAUSED');
   const c=await call('POST','/cocreation/rooms/'+room.id+'/cases',buyer,{kind:'RESUME',reason:'Make new film without withdrawn person',new_deadline:null},r.object_version);await call('POST','/cocreation/cases/'+c.id+'/review',reviewer,{decision:'APPROVE',reason:'Synthetic independent review of remaining nineteen'},c.object_version);
   r=await getRoom();assert.equal(r.current_status,'READY');assert.equal(r.cutoff.eligible_count,20);const p=await getProject();assert.deepEqual(p.data.current,{});assert.deepEqual(p.data.accepted,{});await bad(call('GET','/cocreation/snippets/'+snippet.id+'/file',people[0].user),'COCREATION_PARTICIPATION_REQUIRED');const materials=await call('GET','/cocreation/rooms/'+room.id+'/materials?limit=30',producer);assert.equal(materials.items.length,19);assert(!materials.items.some(x=>x.id===member.id));const originalOrder=await call('GET','/trade/records/'+order.id,buyer);assert.equal(originalOrder.data.financial.received_minor,10000);assert.equal(originalOrder.data.financial.refunded_minor,0);assert.deepEqual(originalOrder.data.contract,order.data.contract);return {room_id:room.id,project_id:project.id,original_cutoff:20,current_production_members:19,received_minor:10000};
  });
 }catch(e){failed=true;throw e;}
 finally{
  if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}if(db)await db.close();if(created)await control.query('DROP DATABASE '+mysql.escapeId(database));await control.end();
  const root=path.resolve(__dirname,'../../../..'),out=path.join(root,'.local');await fs.mkdir(out,{recursive:true});
  await fs.writeFile(path.join(out,'cocreation-modern-journey-fixtures.json'),JSON.stringify({synthetic_only:true,cases:fixtures},null,2));
  await fs.writeFile(path.join(out,'cocreation-modern-journey-result.json'),JSON.stringify({result:failed?'FAIL':'PASS',database,checks,requests,cleanup:{server_stopped:true,database_removed:created},limits:['API composition only; no new invitation UI or native App','Identity/materials preseeded; provider payment receipts simulated through repository, not real money','Media protocol bytes only; not playable video quality or markings verification','Only isolated connection clock advanced to cutoff, no business row status edits']},null,2));
 }
});
