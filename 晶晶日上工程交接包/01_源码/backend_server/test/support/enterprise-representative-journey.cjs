'use strict';
const assert=require('node:assert/strict'),{randomUUID:key}=require('node:crypto');
module.exports=async function({t,db,S,parties,listing,base,fixtures}){
 const {buyer,buyer2,outsider,trade}=S,records=[];let org,grant,invoiceGrant,order,invoice,pay,second,checkoutKey=key(),invoiceKey=key(),acceptInput;
 const future=()=>new Date(Date.now()+86400000).toISOString();
 const sub=(name,fn)=>t.test(name,async()=>{await fn();records.push({name,result:'PASS'});});
 async function call(method,url,{user=buyer2,party=org?.party_id,body,version,op=key(),schema}={}){
  const r=await fetch(base+url,{method,headers:{Authorization:'Bearer '+user.token,...(party?{'X-Acting-Party':party}:{}),...(body?{'Content-Type':'application/json'}:{}),...(method==='POST'?{'Idempotency-Key':op}:{}),...(version?{'If-Match':'"'+version+'"'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  if(!r.headers.get('content-type')?.includes('json'))return {status:r.status,bytes:Buffer.from(await r.arrayBuffer())};
  const value=await r.json();fixtures.push({method,path:new URL(base+url).pathname,schema:r.ok?schema:'ErrorResponse',value});return {status:r.status,...value};
 }
 const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.data;};
 const prefix=()=>'/parties/'+org.party_id+'/representatives';
 const offer=(scope,extra={})=>call('POST',prefix(),{user:buyer,body:{account_id:buyer2.account_id,scope,expires_at:future(),...extra},schema:'RepresentativeResponse'});
 const act=(r,action,extra={})=>call('POST',prefix()+'/'+r.id+'/actions',{body:{action},version:r.object_version,schema:'RepresentativeResponse',...extra});
 const checkout=()=>({listing_id:listing.id,offer_sha256:listing.content_sha256,channel:'ALIPAY'});
 const invBody=()=>({order_id:order.id,amount_minor:50000,header:{kind:'ORGANIZATION',title:'Synthetic represented company',tax_id:'SYNTHETIC-NOT-A-TAX-ID'},text:'Synthetic delegated application',asset_ids:[]});
 await sub('explicit representative offer requires reviewed organization, existing member and owner; no authority before acceptance',async()=>{
  org=await parties.createOrganization(buyer.ctx,{display_name:'Synthetic represented company',operation_key:key()});
  const inv=await parties.inviteMember(buyer.ctx,{party_id:org.party_id,invitee_account_id:buyer2.account_id,expires_at:future(),operation_key:key()});await parties.respondInvitation(buyer2.ctx,{party_id:org.party_id,invitation_id:inv.invitation_id,decision:'ACCEPT',expected_version:1,operation_key:key()});
  assert.equal((await offer('TRADE')).error.code,'PARTY_NOT_ACTIVE');
  // Synthetic reviewed entity prerequisite, not a new organization verification service.
  await db.execute("UPDATE parties SET current_status='ACTIVE' WHERE id=?",[org.party_id]);await db.execute("INSERT INTO party_capabilities(party_id,code,current_status) VALUES (?,'BRAND_CLIENT','ACTIVE')",[org.party_id]);
  assert.equal((await call('POST',prefix(),{body:{account_id:outsider.account_id,scope:'TRADE',expires_at:future()}})).status,403);
  assert.equal((await offer('TRADE',{account_id:outsider.account_id})).error.code,'REPRESENTATIVE_MEMBER_REQUIRED');
  assert.equal((await offer('ADMIN')).error.code,'INVALID_REPRESENTATIVE_SCOPE');
  grant=ok(await offer('TRADE'));assert.equal(grant.effective,false);assert.equal(grant.current_status,'OFFERED');
  assert.equal((await call('POST','/stock/checkout',{body:checkout(),op:checkoutKey})).status,403);
  assert.equal((await act(grant,'ACCEPT',{user:outsider})).status,404);
  acceptInput={op:key(),version:grant.object_version};grant=ok(await act(grant,'ACCEPT',acceptInput));assert.equal(grant.effective,true);
  const replay=ok(await act(grant,'ACCEPT',acceptInput));assert.equal(replay.object_version,grant.object_version);
 });
 await sub('accepted trade representative buys and pays company stock without scout membership; invoice scope stays separate',async()=>{
  assert.equal(Number((await db.execute("SELECT COUNT(*) n FROM wallet_records WHERE owner_party_id=? AND kind='RECHARGE'",[buyer2.personal_party_id]))[0][0].n),0);
  order=ok(await call('POST','/stock/checkout',{body:checkout(),op:checkoutKey,schema:'TradeRecordResponse'}));assert.equal(order.buyer_party_id,org.party_id);assert.equal(order.created_by,buyer2.account_id);
  assert.equal(ok(await call('POST','/stock/checkout',{body:checkout(),op:checkoutKey,schema:'TradeRecordResponse'})).id,order.id);
  pay=await trade.preparePayment(buyer2.ctx,{party_id:org.party_id,order_id:order.id,installment_key:'stock',operation_key:key()},S.config);await trade.applyPayment({...S.config,payment_id:pay.id,currency:'CNY',amount_minor:50000,transaction_id:'synthetic.'+pay.id,status:'SUCCEEDED',product_id:null,app_account_token:null});
  assert.equal(ok(await call('GET','/stock/purchases/'+order.id,{schema:'StockResponse'})).data.status,'ACTIVE');
  const file=await call('GET','/stock/purchases/'+order.id+'/content');assert.equal(file.status,200);assert.equal(require('node:crypto').createHash('sha256').update(file.bytes).digest('hex'),S.file.content_sha256);
  assert.equal((await call('POST','/invoices/requests',{body:invBody(),op:invoiceKey})).status,403);
 });
 await sub('accepted invoice grant creates and recovers the same request; delegates cannot manage membership or self-review',async()=>{
  invoiceGrant=ok(await offer('INVOICES'));invoiceGrant=ok(await act(invoiceGrant,'ACCEPT'));
  invoice=ok(await call('POST','/invoices/requests',{body:invBody(),op:invoiceKey,schema:'InvoiceResponse'}));assert.equal(invoice.buyer_party_id,org.party_id);
  assert.equal(ok(await call('GET','/invoices/command-results/'+invoiceKey+'?operation=CREATE&order_id='+order.id,{schema:'InvoiceCommandResultResponse'})).invoice.id,invoice.id);
  await assert.rejects(parties.inviteMember(buyer2.ctx,{party_id:org.party_id,invitee_account_id:outsider.account_id,expires_at:future(),operation_key:key()}),{code:'PARTY_ACTION_FORBIDDEN'});
  await require('../../src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:buyer2.account_id,action:'INVOICE_HANDLE',enabled:true,expires_at:null,expected_version:0,authority_ref:'synthetic:representative',reason:'isolated self review denial'});
  assert.equal((await call('POST','/invoices/operations/requests/'+invoice.id+'/actions',{party:null,version:invoice.object_version,body:{action:'APPROVE',text:'Synthetic forbidden self review'}})).error.code,'SELF_REVIEW_FORBIDDEN');
 });
 await sub('another company and header mismatch cannot inherit order, invoice, grant or pagination authority',async()=>{
  second=await parties.createOrganization(buyer2.ctx,{display_name:'Synthetic separate subject',operation_key:key()});
  for(const url of ['/trade/records/'+order.id,'/stock/purchases/'+order.id,'/invoices/requests/'+invoice.id,'/invoices/command-results/'+invoiceKey+'?operation=CREATE&order_id='+order.id])assert.equal((await call('GET',url,{party:second.party_id})).status,404,url);
  assert.equal((await call('GET',prefix(),{party:second.party_id})).error.code,'ACTING_PARTY_MISMATCH');
  const page=ok(await call('GET',prefix()+'?limit=1',{schema:'RepresentativePageResponse'}));assert.equal(page.items.length,1);assert.ok(page.next_cursor);assert.equal(page.items[0].account_id,buyer2.account_id);
  assert.equal((await call('GET','/parties/'+second.party_id+'/representatives?cursor='+encodeURIComponent(page.next_cursor),{party:second.party_id})).error.code,'INVALID_CURSOR');
  assert.equal((await call('GET',prefix(),{user:outsider})).status,403);
 });
 await sub('scope revocation blocks reads, downloads and old checkout replay while retaining invoice authority and original contract',async()=>{
  const before=(await db.execute('SELECT data_json FROM trade_records WHERE id=?',[order.id]))[0][0].data_json;
  grant=ok(await act(grant,'REVOKE',{user:buyer}));assert.equal(grant.effective,false);
  assert.equal(ok(await act(grant,'ACCEPT',acceptInput)).effective,false);
  for(const url of ['/trade/records/'+order.id,'/stock/purchases/'+order.id,'/stock/purchases/'+order.id+'/content'])assert.equal((await call('GET',url)).status,403,url);
  assert.equal((await call('POST','/stock/checkout',{body:checkout(),op:checkoutKey})).status,403);
  assert.equal(ok(await call('GET','/invoices/requests/'+invoice.id,{schema:'InvoiceResponse'})).id,invoice.id);
  assert.deepEqual((await db.execute('SELECT data_json FROM trade_records WHERE id=?',[order.id]))[0][0].data_json,before);
 });
 await sub('expired, suspended and removed memberships stop grants; rejoining does not restore old authority',async()=>{
  await db.execute("UPDATE parties SET current_status='SUSPENDED' WHERE id=?",[org.party_id]);assert.notEqual((await call('GET','/invoices/requests/'+invoice.id)).status,200);await db.execute("UPDATE parties SET current_status='ACTIVE' WHERE id=?",[org.party_id]);
  await db.execute("UPDATE party_representations SET expires_at='2000-01-01' WHERE id=?",[invoiceGrant.id]);assert.equal((await call('GET','/invoices/requests/'+invoice.id)).status,403);await db.execute('UPDATE party_representations SET expires_at=? WHERE id=?',[future().slice(0,23).replace('T',' '),invoiceGrant.id]);
  await db.execute("UPDATE party_memberships SET current_status='SUSPENDED' WHERE party_id=? AND account_id=?",[org.party_id,buyer.account_id]);assert.equal((await call('GET','/invoices/requests/'+invoice.id)).status,403);await db.execute("UPDATE party_memberships SET current_status='ACTIVE' WHERE party_id=? AND account_id=?",[org.party_id,buyer.account_id]);
  const m=(await parties.listMembers(buyer.ctx,org.party_id)).find(x=>x.account_id===buyer2.account_id);await parties.removeMember(buyer.ctx,{party_id:org.party_id,account_id:buyer2.account_id,expected_version:m.object_version,operation_key:key()});
  assert.equal((await call('POST','/invoices/requests',{body:invBody(),op:invoiceKey})).status,403);
  const inv=await parties.inviteMember(buyer.ctx,{party_id:org.party_id,invitee_account_id:buyer2.account_id,expires_at:future(),operation_key:key()});await parties.respondInvitation(buyer2.ctx,{party_id:org.party_id,invitation_id:inv.invitation_id,decision:'ACCEPT',expected_version:1,operation_key:key()});
  assert.equal((await call('GET','/invoices/command-results/'+invoiceKey+'?operation=CREATE&order_id='+order.id)).status,403);
  assert.equal((await act(invoiceGrant,'ACCEPT',{version:1})).error.code,'REPRESENTATIVE_NO_LONGER_VALID');
  assert.ok(ok(await call('GET',prefix(),{schema:'RepresentativePageResponse'})).items.every(r=>!r.effective));
  invoiceGrant=ok(await offer('INVOICES'));invoiceGrant=ok(await act(invoiceGrant,'ACCEPT'));assert.equal(ok(await call('GET','/invoices/requests/'+invoice.id,{schema:'InvoiceResponse'})).id,invoice.id);
 });
 await sub('declined, revoked pending and stale authority changes cannot activate; replay cannot issue a duplicate grant',async()=>{
  const op=key(),expires_at=future(),pending=ok(await offer('TRADE',{expires_at}));
  const declined=ok(await act(pending,'DECLINE'));assert.equal(declined.current_status,'DECLINED');assert.equal((await act(declined,'ACCEPT')).error.code,'REPRESENTATIVE_TRANSITION_FORBIDDEN');
  const offered=ok(await call('POST',prefix(),{user:buyer,op,body:{account_id:buyer2.account_id,scope:'TRADE',expires_at},schema:'RepresentativeResponse'}));
  assert.equal(ok(await call('POST',prefix(),{user:buyer,op,body:{account_id:buyer2.account_id,scope:'TRADE',expires_at},schema:'RepresentativeResponse'})).id,offered.id);
  assert.equal((await call('POST',prefix(),{user:buyer,op,body:{account_id:buyer2.account_id,scope:'INVOICES',expires_at}})).error.code,'IDEMPOTENCY_CONFLICT');
  assert.equal((await act(offered,'REVOKE',{user:buyer,version:2})).error.code,'VERSION_CONFLICT');
  const revoked=ok(await act(offered,'REVOKE',{user:buyer}));assert.equal((await act(revoked,'ACCEPT')).error.code,'REPRESENTATIVE_TRANSITION_FORBIDDEN');
 });
 await sub('independent handlers issue the delegated request; invoice withdrawal blocks the file, old write and recovery',async()=>{
  const action=async(name,user,body={})=>ok(await call('POST','/invoices/operations/requests/'+invoice.id+'/actions',{user,party:null,version:invoice.object_version,body:{action:name,text:'Synthetic independent handling',...body},schema:'InvoiceResponse'}));
  invoice=await action('APPROVE',S.reviewer);invoice=await action('RECORD_DOCUMENT',S.reviewer,{document:{amount_minor:50000,reference:'SYNTHETIC-'+key(),issued_at:'2026-01-01T00:00:00.000Z',asset_id:null,header:invBody().header}});invoice=await action('VERIFY_DOCUMENT',outsider);
  const file='/invoices/requests/'+invoice.id+'/documents/'+invoice.issued_document_id+'/content';const result=await call('GET',file);assert.equal(result.status,200);assert.match(result.bytes.toString(),/模拟凭证，非真实发票/);
  invoiceGrant=ok(await act(invoiceGrant,'REVOKE',{user:buyer}));
  for(const url of [file,'/invoices/requests/'+invoice.id,'/invoices/command-results/'+invoiceKey+'?operation=CREATE&order_id='+order.id])assert.equal((await call('GET',url)).status,403,url);
  assert.equal((await call('POST','/invoices/requests',{body:invBody(),op:invoiceKey})).status,403);
  assert.equal((await call('GET',file,{user:buyer})).status,200);
 });
 assert.equal(records.length,8);return {checks:records,order_id:order?.id,invoice_id:invoice?.id,party_id:org.party_id,representative_account_id:buyer2.account_id,limits:['Synthetic organization qualification, identity and payment receipt; no real service, UI, legal representative replacement or independent acceptance.','Acceptance and grants are HTTP; payment preparation/receipt and membership transitions are repositories; expiry and suspensions are isolated administrative fixtures.']};
};
