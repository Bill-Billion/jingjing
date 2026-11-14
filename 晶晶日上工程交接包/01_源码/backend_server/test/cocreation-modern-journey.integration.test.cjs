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
  for(const u of [producer,reviewer])for(const action of ['COCREATION_REVIEW','REDEMPTION_REVIEW'])await f.grant(u,action);
  server=require('../src/http/account-api').createAccountApi({db,secret:f.secret,supplyStorageFactory:f.storageFactory,tradeEnv:{CUSTOMIZATION_MERCHANT_PARTY_ID:f.org.party_id,CUSTOMIZATION_CONTRACT_POLICY:'CONTRACT_20261029',COPYRIGHT_CONTRACT_POLICY:'CONTRACT_20261029'}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port+'/api/v1';
  async function call(method,url,u,body,version,op=key(),party=u===reviewer?null:u.acting_party_id){
   const res=await fetch(base+url,{method,headers:{Authorization:'Bearer '+u.token,...party?{'X-Acting-Party':party}:{},...body===undefined?{}:{'Content-Type':Buffer.isBuffer(body)?'application/octet-stream':'application/json','Idempotency-Key':op},...version?{'If-Match':'"'+version+'"'}:{}},...body===undefined?{}:{body:Buffer.isBuffer(body)?body:JSON.stringify(body)},signal:AbortSignal.timeout(20000)});
   const binary=!(res.headers.get('content-type')||'').includes('json'),value=binary?Buffer.from(await res.arrayBuffer()):await res.json();
   requests.push({method,path:new URL(base+url).pathname,actor:u.account_id,status:res.status,error:binary?null:value.error?.code||null});
   if(!binary){const schema=!res.ok?'ErrorResponse':url.includes('/invite-links')?(url.endsWith('/claim')?'CocreationInviteClaimResponse':'CocreationInviteLinkResponse'):url.startsWith('/cocreation')?'CocreationResponse':url.startsWith('/trade')?'TradeRecordResponse':url.startsWith('/redemption')?'RedemptionResponse':['/start','/case-resolution','/refund-sync'].some(x=>url.endsWith(x))?'CustomizationFulfillmentResponse':'ProductionRecordResponse';fixtures.push({method,path:new URL(base+url).pathname,schema,value});}
   if(!res.ok)throw Object.assign(new Error(value.error?.code),{code:value.error?.code,status:res.status});return binary?value:value.data;
  }
  const bad=(p,code)=>assert.rejects(p,e=>{assert.equal(e.code,code);return true;});
  let rule=await call('POST','/cocreation/rules',producer,{rule:{version:'synthetic-modern-family',source_ref:'synthetic:contract-19-and-13',max_people:40,extension_days:7,participation_terms:'Synthetic separate participation, never consent by host.',benefit:{service_code:'synthetic-credit',description:'Synthetic noncash service credit',credit_minor:1000,valid_days:30}}},null,key(),null);
  rule=await call('POST','/cocreation/rules/'+rule.id+'/review',reviewer,{decision:'APPROVE',reason:'Synthetic independent review'},rule.object_version);
  const people=[];for(let n=0;n<20;n++){const user=await f.registerActor('Synthetic private guest '+n);people.push({user,...await f.actorCast(user)});}
  let room,order,project,member,final,snippet;const members=[],payments=[];
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
   payments.push(await f.pay(order,'first'));let r=await getRoom();assert.equal(r.counts.eligible_count,20);await bad(call('POST','/cocreation/rooms/'+room.id+'/close',buyer,{},r.object_version),'COCREATION_CUTOFF_NOT_DUE');
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
  const credit=require('./support/cocreation-credit-journey.cjs').journey({db,f,call,bad,check,buyer,producer,reviewer,outsider,room,order,reviewProject:reviewP});await credit.prepare();
  await check('independently reviewed project keeps twenty separate authorizations; host cannot read other peoples private materials',async()=>{
   project=await reviewP(await call('POST','/production/projects',producer,{order_id:order.id,line_id:'film',script_version_id:f.work.id,license_project_id:null,assignee_account_id:producer.account_id,purpose:'PRIVATE',territory:'CN',consent_ids:[],evidence_asset_id:f.proof.id,fulfillment:{uses_identifiable_people:true,cast:[]}}));
   await cmd('start',producer);const first=await call('GET','/cocreation/rooms/'+room.id+'/materials?limit=10',producer),second=await call('GET','/cocreation/rooms/'+room.id+'/materials?limit=10&cursor='+first.next_cursor,producer);assert.equal(first.items.length+second.items.length,20);assert.equal(new Set([...first.items,...second.items].map(x=>x.id)).size,20);
   await bad(call('GET','/cocreation/rooms/'+room.id+'/materials',buyer),'COCREATION_PRODUCER_FORBIDDEN');return {room_id:room.id,project_id:project.id,material_count:20};
  });
  await check('new contract collects 40 percent after script acceptance, then samples and final require separate reviews',async()=>{
   await assert.rejects(f.pay(order,'interim'));const script=await deliver('SCRIPT');await accept(script);const p=await f.pay(order,'interim');assert.equal(p.data.amount_minor,4000);payments.push(p);await accept(await deliver('SAMPLE'));await accept(await deliver('ROUGH_CUT'));final=await deliver('FINAL');return {order_id:order.id,script_version_id:script.id,final_version_id:final.id,interim_minor:4000};
  });
  await check('personal clip remains unavailable until final acceptance and remaining 30 percent; other people cannot download',async()=>{
   const clip=await file('FINAL');snippet=await call('POST','/cocreation/rooms/'+room.id+'/snippets',producer,{member_id:member.id,file_id:clip.id,final_version_id:final.id,note:'Synthetic own-person clip'});
   const original=await call('GET','/cocreation/snippets/'+snippet.id+'/review-file',reviewer);snippet=await call('POST','/cocreation/snippets/'+snippet.id+'/review',reviewer,{decision:'APPROVE',reason:'Synthetic independent person/marking check',verification:{only_target_person:true,authorization_marked:true,ai_label_verified:true,content_reviewed:true}},snippet.object_version);
   const url='/cocreation/snippets/'+snippet.id+'/file';await bad(call('GET',url,people[0].user),'COCREATION_SNIPPET_NOT_READY');await accept(final);await bad(call('GET',url,people[0].user),'COCREATION_SNIPPET_NOT_READY');const payment=await f.pay(order,'last');assert.equal(payment.data.amount_minor,3000);payments.push(payment);assert.equal(hash(await call('GET',url,people[0].user)),hash(original));
   await bad(call('GET',url,people[1].user),'COCREATION_NOT_FOUND');await bad(call('GET',url,buyer),'COCREATION_NOT_FOUND');await bad(call('GET','/production/versions/'+final.id+'/content?variant=final',people[0].user),'PRODUCTION_NOT_FOUND');return {order_id:order.id,snippet_id:snippet.id,content_sha256:hash(original),final_payment_minor:3000};
  });
  await check('withdrawal pauses old production and downloads; independent recovery keeps old cutoff but requires new versions',async()=>{
   member=await call('POST','/cocreation/members/'+member.id+'/withdraw',people[0].user,{reason:'Synthetic personal withdrawal'},member.object_version);let r=await getRoom();assert.equal(r.current_status,'PAUSED');assert.equal(r.cutoff.eligible_count,20);await credit.paused();await bad(call('GET','/cocreation/snippets/'+snippet.id+'/file',people[0].user),'COCREATION_PARTICIPATION_REQUIRED');await bad(file('FINAL'),'CUSTOMIZATION_PAUSED');
   const c=await call('POST','/cocreation/rooms/'+room.id+'/cases',buyer,{kind:'RESUME',reason:'Make new film without withdrawn person',new_deadline:null},r.object_version);await call('POST','/cocreation/cases/'+c.id+'/review',reviewer,{decision:'APPROVE',reason:'Synthetic independent review of remaining nineteen'},c.object_version);
   r=await getRoom();assert.equal(r.current_status,'READY');assert.equal(r.cutoff.eligible_count,20);const p=await getProject();assert.deepEqual(p.data.current,{});assert.deepEqual(p.data.accepted,{});await bad(call('GET','/cocreation/snippets/'+snippet.id+'/file',people[0].user),'COCREATION_PARTICIPATION_REQUIRED');const materials=await call('GET','/cocreation/rooms/'+room.id+'/materials?limit=30',producer);assert.equal(materials.items.length,19);assert(!materials.items.some(x=>x.id===member.id));const originalOrder=await call('GET','/trade/records/'+order.id,buyer);assert.equal(originalOrder.data.financial.received_minor,10000);assert.equal(originalOrder.data.financial.refunded_minor,0);assert.deepEqual(originalOrder.data.contract,order.data.contract);return {room_id:room.id,project_id:project.id,original_cutoff:20,current_production_members:19,received_minor:10000};
  });
  await credit.consume();
  await check('same paid room cancels through production review; three actual refunds revoke benefit and cannot revive old files',async()=>{
   let r=await getRoom();const c=await call('POST','/cocreation/rooms/'+room.id+'/cases',buyer,{kind:'CANCEL',reason:'Synthetic whole-package cancellation after authorization withdrawal',new_deadline:null},r.object_version);
   await bad(call('POST','/cocreation/cases/'+c.id+'/review',reviewer,{decision:'APPROVE',reason:'Wrong review route'},c.object_version),'USE_CUSTOMIZATION_CASE_REVIEW');
   await cmd('case-resolution',reviewer,{case_id:c.data.production_case_id,decision:'CANCEL',retained_minor:0,change_order_id:null,reason:'Independent synthetic full cancellation'});
   const sync=async()=>{const current=await getRoom();return call('POST','/cocreation/rooms/'+room.id+'/sync',buyer,{},current.object_version);};
   r=await sync();assert.equal(r.current_status,'REFUND_REQUIRED');
   const refundIds=[];
   for(const payment of payments){
    let refund=await call('POST','/trade/refunds',buyer,{payment_id:payment.id,allocations:[{line_id:'film',amount_minor:payment.data.amount_minor}],reason:'Synthetic reviewed full package refund'});
    refund=await reviewTrade(refund);await f.trade.claim(reviewer.ctx,refund.id,null,'REFUND');
    const proof={...refund.data,refund_id:refund.id,status:'SUCCEEDED'};await f.trade.applyRefund(refund.id,proof);await f.trade.applyRefund(refund.id,proof);refundIds.push(refund.id);
    r=await sync();assert.equal(r.current_status,refundIds.length===3?'REFUNDED':'REFUND_REQUIRED');
   }
   r=await sync();assert.equal(r.current_status,'REFUNDED');
   const current=await call('GET','/trade/records/'+order.id,buyer);assert.deepEqual(current.data.financial,{received_minor:10000,refunded_minor:10000,net_minor:0});assert.deepEqual(current.data.contract,order.data.contract);
   const benefits=await call('GET','/cocreation/benefits',buyer);assert.equal(benefits.items.find(b=>b.parent_id===room.id).current_status,'USED');
   await bad(call('POST','/cocreation/rooms/'+room.id+'/cases',buyer,{kind:'RESUME',reason:'Must not revive refunded film',new_deadline:null},r.object_version),'COCREATION_CANCELLED');
   await bad(call('GET','/production/versions/'+final.id+'/content?variant=final',buyer),'PRODUCTION_ORDER_BLOCKED');
   await bad(call('GET','/cocreation/snippets/'+snippet.id+'/file',people[0].user),'COCREATION_PARTICIPATION_REQUIRED');
   assert.equal((await db.execute("SELECT id FROM trade_journal WHERE order_id=? AND direction='REFUND'",[order.id]))[0].length,3);
   return {actors:{host:buyer.account_id,producer:producer.account_id,independent_reviewer:reviewer.account_id,withdrawn_member:people[0].user.account_id},room_id:room.id,order_id:order.id,project_id:project.id,case_id:c.id,refund_ids:refundIds,financial:current.data.financial,benefit_status:'USED',consumed_history_retained:true};
  });

  await credit.cancelled();
  // Distinct room branches: extension and cancellation cannot share one terminal outcome.
  const smallRooms=[];
  async function smallRoom(count){
   let r;const x=await f.newOrder({preview:'SCRIPT_BEFORE_INTERIM',calendar:require('./support/working-calendar.cjs')(),copyrightTerms:require('./support/copyright-terms.cjs')(),beforeQuote:async({story})=>{
    const at=await db.withTransaction(tx=>A.now(tx));r=await call('POST','/cocreation/rooms',buyer,{request_id:story.id,rule_id:rule.id,producer_party_id:f.org.party_id,title:'Synthetic unformed recovery',deadline:new Date(Date.parse(at)+60000).toISOString(),purpose:'PRIVATE',territory:'CN'});
   }});
   const rows=[];
   for(const p of people.slice(0,count)){
    r=await call('GET','/cocreation/rooms/'+r.id,buyer);const link=await call('POST','/cocreation/rooms/'+r.id+'/invite-links',buyer,{},r.object_version);
    await call('POST','/cocreation/invite-links/claim',p.user,{token:link.token,person_id:p.person.id});
    const body={person_id:p.person.id,cast:p.roster.cast,private_story:'Synthetic extension story',material_asset_ids:p.look.data.material_asset_ids,sharing_allowed:false,participation_sha256:r.participation_sha256,agreed:true};
    rows.push({p,body,member:await call('POST','/cocreation/rooms/'+r.id+'/members',p.user,body)});
   }
   const payment=await f.pay(x.order,'first');r=await call('GET','/cocreation/rooms/'+r.id,buyer);
   await db.execute('SET timestamp=?',[Math.floor(Date.parse(r.deadline)/1000)+1]);
   r=await call('POST','/cocreation/rooms/'+r.id+'/close',buyer,{},r.object_version);
   assert.equal(r.current_status,count>=10?'READY':'UNFORMED');assert.equal(r.cutoff.eligible_count,count);
   const branch={room:r,order:x.order,payment,rows};smallRooms.push(branch);return branch;
  }
  await check('nine-person unformed room extends only after independent review; old personal agreement cannot silently carry forward',async()=>{
   const x=await smallRoom(9),old=x.room;
   const c=await call('POST','/cocreation/rooms/'+old.id+'/cases',buyer,{kind:'EXTEND',reason:'Synthetic one more participant needed',new_deadline:new Date(Date.parse(old.deadline)+600000).toISOString()},old.object_version);
   await call('POST','/cocreation/cases/'+c.id+'/review',reviewer,{decision:'APPROVE',reason:'Synthetic independent extension'},c.object_version);
   const r=await call('GET','/cocreation/rooms/'+old.id,buyer);assert.equal(r.current_status,'OPEN');assert.equal(r.counts.eligible_count,0);assert.notEqual(r.participation_sha256,old.participation_sha256);
   const first=x.rows[0],{person_id,...stale}=first.body;
   await bad(call('POST','/cocreation/members/'+first.member.id,first.p.user,stale,first.member.object_version),'COCREATION_PARTICIPATION_REQUIRED');
   assert.equal((await call('GET','/cocreation/rooms/'+old.id,buyer)).counts.eligible_count,0);
   x.room=r;return {room_id:r.id,order_id:x.order.id,case_id:c.id,old_eligible:9,eligible_after_extension:0};
  });
  await check('same extended room requires nine renewed agreements and a tenth separate participant; ten qualifies without twenty-person reward',async()=>{
   const x=smallRooms[0],r=x.room;
   for(const row of x.rows){const {person_id,...body}=row.body;await call('POST','/cocreation/members/'+row.member.id,row.p.user,{...body,participation_sha256:r.participation_sha256},row.member.object_version);}
   let now=await call('GET','/cocreation/rooms/'+r.id,buyer);assert.equal(now.counts.eligible_count,9);
   const p=people[9],link=await call('POST','/cocreation/rooms/'+r.id+'/invite-links',buyer,{},now.object_version);
   await call('POST','/cocreation/invite-links/claim',p.user,{token:link.token,person_id:p.person.id});
   await call('POST','/cocreation/rooms/'+r.id+'/members',p.user,{person_id:p.person.id,cast:p.roster.cast,private_story:'Synthetic tenth participant',material_asset_ids:p.look.data.material_asset_ids,sharing_allowed:false,participation_sha256:r.participation_sha256,agreed:true});
   now=await call('GET','/cocreation/rooms/'+r.id,buyer);assert.equal(now.counts.eligible_count,10);
   await db.execute('SET timestamp=?',[Math.floor(Date.parse(now.deadline)/1000)+1]);
   const ready=await call('POST','/cocreation/rooms/'+r.id+'/close',buyer,{},now.object_version);
   assert.equal(ready.current_status,'READY');assert.equal(ready.cutoff.eligible_count,10);assert.equal(ready.cutoff.benefit_eligible,false);
   assert.equal((await call('GET','/cocreation/benefits',buyer)).items.filter(b=>b.parent_id===r.id).length,0);
   return {room_id:r.id,order_id:x.order.id,eligible:10,benefit_eligible:false};
  });
  await check('separate nine-person room cancels before production; review is not a refund and duplicate receipt credits only once',async()=>{
   const x=await smallRoom(9),r=x.room;
   const body={payment_id:x.payment.id,allocations:[{line_id:'film',amount_minor:3000}],reason:'Synthetic unformed cancellation'};
   await bad(call('POST','/trade/refunds',buyer,body),'COCREATION_CANCELLATION_REVIEW_REQUIRED');
   const c=await call('POST','/cocreation/rooms/'+r.id+'/cases',buyer,{kind:'CANCEL',reason:'Synthetic cannot form',new_deadline:null},r.object_version);
   await call('POST','/cocreation/cases/'+c.id+'/review',reviewer,{decision:'APPROVE',reason:'Synthetic independent before-start cancellation'},c.object_version);
   const sync=async()=>{const now=await call('GET','/cocreation/rooms/'+r.id,buyer);return call('POST','/cocreation/rooms/'+r.id+'/sync',buyer,{},now.object_version);};
   assert.equal((await sync()).current_status,'REFUND_REQUIRED');
   let refund=await reviewTrade(await call('POST','/trade/refunds',buyer,body));assert.equal((await sync()).current_status,'REFUND_REQUIRED');
   await f.trade.claim(reviewer.ctx,refund.id,null,'REFUND');const proof={...refund.data,refund_id:refund.id,status:'SUCCEEDED'};
   await f.trade.applyRefund(refund.id,proof);await f.trade.applyRefund(refund.id,proof);
   const done=await sync();assert.equal(done.current_status,'REFUNDED');
   const actual=await call('GET','/trade/records/'+x.order.id,buyer);assert.deepEqual(actual.data.financial,{received_minor:3000,refunded_minor:3000,net_minor:0});
   assert.deepEqual(actual.data.contract,x.order.data.contract);
   assert.equal((await db.execute("SELECT id FROM trade_journal WHERE order_id=? AND direction='REFUND'",[x.order.id]))[0].length,1);
   await bad(call('POST','/cocreation/rooms/'+r.id+'/cases',buyer,{kind:'EXTEND',reason:'Synthetic rejected revival',new_deadline:new Date(Date.parse(r.deadline)+600000).toISOString()},done.object_version),'COCREATION_CANCELLED');
   return {room_id:r.id,order_id:x.order.id,case_id:c.id,refund_id:refund.id,financial:actual.data.financial};
  });
  await check('unformed room cannot mark refund complete while original payment requires review',async()=>{
   const x=await smallRoom(9),r=x.room;
   const c=await call('POST','/cocreation/rooms/'+r.id+'/cases',buyer,{kind:'CANCEL',reason:'Synthetic unformed refund reconciliation',new_deadline:null},r.object_version);
   await call('POST','/cocreation/cases/'+c.id+'/review',reviewer,{decision:'APPROVE',reason:'Independent cancellation'},c.object_version);
   const refund=await reviewTrade(await call('POST','/trade/refunds',buyer,{payment_id:x.payment.id,allocations:[{line_id:'film',amount_minor:3000}],reason:'Unformed full refund'}));
   await f.trade.claim(reviewer.ctx,refund.id,null,'REFUND');
   await f.trade.applyRefund(refund.id,{...refund.data,refund_id:refund.id,status:'SUCCEEDED'});
   const payment=await f.trade.read(buyer.ctx,{record_id:x.payment.id,party_id:buyer.acting_party_id});
   await f.trade.applyPayment({...payment.data.proof,status:'REVIEW_REQUIRED'});
   const order=await call('GET','/trade/records/'+x.order.id,buyer);
   assert.equal(order.current_status,'PAYMENT_REVIEW_REQUIRED');
   const before=await call('GET','/cocreation/rooms/'+r.id,buyer);
   await bad(call('POST','/cocreation/rooms/'+r.id+'/sync',buyer,{},before.object_version),'COCREATION_REFUND_REVIEW_REQUIRED');
   const after=await call('GET','/cocreation/rooms/'+r.id,buyer);
   assert.equal(after.current_status,'REFUND_REQUIRED');assert.equal(after.object_version,before.object_version);
   return {room_id:r.id,order_id:x.order.id,case_id:c.id,refund_id:refund.id,order_status:order.current_status,room_status:after.current_status};
  });
  await credit.expire(smallRoom);
 }catch(e){failed=true;throw e;}
 finally{
  if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}if(db)await db.close();if(created)await control.query('DROP DATABASE '+mysql.escapeId(database));await control.end();
  const root=path.resolve(__dirname,'../../../..'),out=path.join(root,'.local');await fs.mkdir(out,{recursive:true});
  await fs.writeFile(path.join(out,'cocreation-modern-journey-fixtures.json'),JSON.stringify({synthetic_only:true,cases:fixtures},null,2));
  await fs.writeFile(path.join(out,'cocreation-modern-journey-result.json'),JSON.stringify({result:failed?'FAIL':'PASS',database,checks,requests,cleanup:{server_stopped:true,database_removed:created},limits:['API composition only; no new invitation UI or native App','Identity/materials preseeded; provider payment receipts simulated through repository, not real money','Media protocol bytes only; not playable video quality or markings verification','Only isolated connection clock advanced to cutoff and benefit expiry, no business row status edits']},null,2));
 }
});
