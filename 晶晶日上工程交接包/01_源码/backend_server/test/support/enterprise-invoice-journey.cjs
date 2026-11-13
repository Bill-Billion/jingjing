'use strict';
const assert=require('node:assert/strict'),{randomUUID:key}=require('node:crypto');
module.exports=async function enterpriseInvoices({t,db,S,parties,org,order,base,fixtures}){
 const {buyer,buyer2,reviewer,outsider}=S,records=[],header={kind:'ORGANIZATION',title:'Synthetic brand buyer',tax_id:'SYNTHETIC-NOT-A-TAX-ID'};
 const grant=require('../../src/modules/governance/operator-access').maintainOperatorGrant;
 for(const [u,actions] of [[reviewer,['INVOICE_HANDLE','INVOICE_VERIFY']],[outsider,['INVOICE_VERIFY']],[buyer,['INVOICE_HANDLE','INVOICE_VERIFY']]])for(const action of actions)await grant(db,{account_id:u.account_id,action,enabled:true,expires_at:null,expected_version:0,authority_ref:'synthetic:enterprise-invoice',reason:'isolated permission prerequisite'});
 async function call(method,url,{user=buyer,party=org.party_id,body,version,op=key()}={}){
  const r=await fetch(base+'/invoices'+url,{method,headers:{Authorization:'Bearer '+user.token,...(party?{'X-Acting-Party':party}:{}),...(body?{'Content-Type':'application/json'}:{}),...(method==='POST'?{'Idempotency-Key':op}:{}),...(version?{'If-Match':'"'+version+'"'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  if(!r.headers.get('content-type')?.includes('application/json'))return {status:r.status,bytes:Buffer.from(await r.arrayBuffer())};
  const value=await r.json(),p=url.split('?')[0],schema=r.ok?(p.includes('/command-results/')?'InvoiceCommandResultResponse':p.endsWith('/eligibility')?'InvoiceEligibilityResponse':p.endsWith('/history')?'InvoiceHistoryResponse':p.endsWith('/documents')?'InvoiceDocumentsResponse':p.endsWith('/requests')&&method==='GET'?'InvoiceListResponse':'InvoiceResponse'):'ErrorResponse';
  fixtures.push({method,path:new URL(base+'/invoices'+url).pathname,schema,value});return {status:r.status,...value};
 }
 const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.data;};
 const sub=async(name,fn)=>t.test(name,async()=>{const proof=await fn();records.push({name,result:'PASS',records:proof});});
 let invoice,second,document,originalSha;const op=key(),create={order_id:order.id,amount_minor:50000,header,text:'Synthetic organization invoice',asset_ids:[]};
 const action=(name,options={})=>call('POST',(options.party===null?'/operations':'')+'/requests/'+invoice.id+'/actions',{...options,version:invoice.object_version,body:{action:name,text:'Synthetic independent handling',...options.body}});
 await sub('same organization order permits its owner without scout membership; ordinary employee cannot apply or read',async()=>{
  assert.equal(Number((await db.execute("SELECT COUNT(*) n FROM wallet_records WHERE owner_party_id=? AND kind='RECHARGE'",[buyer.personal_party_id]))[0][0].n),0);
  const invite=await parties.inviteMember(buyer.ctx,{party_id:org.party_id,invitee_account_id:buyer2.account_id,expires_at:new Date(Date.now()+86400000).toISOString(),operation_key:key()});
  await parties.respondInvitation(buyer2.ctx,{party_id:org.party_id,invitation_id:invite.invitation_id,decision:'ACCEPT',expected_version:invite.object_version,operation_key:key()});
  assert.equal((await call('POST','/requests',{user:buyer2,body:create})).status,403);
  invoice=ok(await call('POST','/requests',{body:create,op}));assert.equal(invoice.buyer_party_id,org.party_id);assert.equal(invoice.order_id,order.id);assert.equal(ok(await call('POST','/requests',{body:create,op})).id,invoice.id);
  assert.equal((await call('GET','/requests/'+invoice.id,{user:buyer2})).status,403);
  originalSha=(await db.execute('SELECT data_sha256 FROM trade_records WHERE id=?',[order.id]))[0][0].data_sha256;
  return {order_id:order.id,party_id:org.party_id,invoice_id:invoice.id,employee_account_id:buyer2.account_id,scout_membership_required:false};
 });
 await sub('switching to another owned company cannot inherit the original company order, invoice or command result',async()=>{
  second=await parties.createOrganization(buyer.ctx,{display_name:'Synthetic second company',operation_key:key()});
  for(const url of ['/orders/'+order.id+'/eligibility','/requests/'+invoice.id,'/requests/'+invoice.id+'/history','/command-results/'+op+'?operation=CREATE&order_id='+order.id])assert.equal((await call('GET',url,{party:second.party_id})).status,404,url);
  assert.equal((await call('POST','/requests',{party:second.party_id,body:create})).status,404);
  assert.equal(ok(await call('GET','/requests',{party:second.party_id})).items.length,0);
  const r=await fetch(base+'/stock/purchases/'+order.id,{headers:{Authorization:'Bearer '+buyer.token,'X-Acting-Party':second.party_id}});assert.equal(r.status,404);fixtures.push({method:'GET',path:'/api/v1/stock/purchases/'+order.id,schema:'ErrorResponse',value:await r.json()});
  return {original_party_id:org.party_id,second_party_id:second.party_id,order_id:order.id,invoice_id:invoice.id};
 });
 await sub('organization applicant cannot self-approve with operator grants or a second company; independent handlers issue the same simulated document',async()=>{
  assert.equal((await action('APPROVE',{party:null})).error.code,'SELF_REVIEW_FORBIDDEN');
  assert.equal((await call('POST','/operations/requests/'+invoice.id+'/actions',{party:second.party_id,version:invoice.object_version,body:{action:'APPROVE',text:'Synthetic forbidden self review'}})).status,400);
  invoice=ok(await action('APPROVE',{user:reviewer,party:null}));
  invoice=ok(await action('RECORD_DOCUMENT',{user:reviewer,party:null,body:{document:{amount_minor:50000,reference:'SYNTHETIC-'+key(),issued_at:'2026-01-01T00:00:00.000Z',asset_id:null,header}}}));
  assert.equal((await action('VERIFY_DOCUMENT',{user:reviewer,party:null})).error.code,'SELF_REVIEW_FORBIDDEN');
  invoice=ok(await action('VERIFY_DOCUMENT',{user:outsider,party:null}));assert.equal(invoice.current_status,'ISSUED');document=invoice.issued_document_id;
  const r=await call('GET','/requests/'+invoice.id+'/documents/'+document+'/content');assert.equal(r.status,200);assert.match(r.bytes.toString(),/模拟凭证，非真实发票/);assert.match(r.bytes.toString(),/Synthetic brand buyer/);
  assert.equal((await call('GET','/requests/'+invoice.id+'/documents/'+document+'/content',{party:second.party_id})).status,404);
  return {order_id:order.id,invoice_id:invoice.id,document_id:document,simulated:true,independent_handler:reviewer.account_id,independent_verifier:outsider.account_id};
 });
 await sub('original owner authority withdrawal blocks old reads, document and idempotent recovery without changing company facts',async()=>{
  // Trusted membership revocation is a synthetic authority prerequisite, not a newly implemented owner-transfer workflow.
  await db.execute("UPDATE party_memberships SET current_status='REVOKED' WHERE party_id=? AND account_id=?",[org.party_id,buyer.account_id]);
  try{
   for(const url of ['/requests/'+invoice.id,'/requests/'+invoice.id+'/documents/'+document+'/content','/command-results/'+op+'?operation=CREATE&order_id='+order.id])assert.equal((await call('GET',url)).status,403,url);
   assert.equal((await call('POST','/requests',{body:create,op})).status,403);
   assert.equal((await call('GET','/operations/requests/'+invoice.id,{party:null})).error.code,'SELF_REVIEW_FORBIDDEN');
   assert.equal((await db.execute('SELECT data_sha256 FROM trade_records WHERE id=?',[order.id]))[0][0].data_sha256,originalSha);
  }finally{await db.execute("UPDATE party_memberships SET current_status='ACTIVE' WHERE party_id=? AND account_id=?",[org.party_id,buyer.account_id]);}
  assert.equal(ok(await call('GET','/requests/'+invoice.id)).issued_document_id,document);
  return {order_id:order.id,invoice_id:invoice.id,document_id:document,contract_unchanged:true,authority_change:'SYNTHETIC_ADMIN_PREREQUISITE'};
 });
 assert.equal(records.length,4);return records;
};
