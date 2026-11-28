'use strict';
// Consume only a real credit returned by the existing ten-draw S2 scenario.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID,createHash}=require('node:crypto');
async function main(){
 const run=path.resolve(process.env.QA18_OUTPUT_DIR||'');
 assert(run.startsWith(path.join(process.cwd(),'.local','qa18')+path.sep));
 const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
 const file=path.resolve(process.env.V5_ACCESS_FILE||'');
 const f=await read(file), p=await read(path.join(path.dirname(file),'prepared.json')), prior=await read(path.join(run,'browser','checkpoint.json'));
 assert(f.synthetic_only&&new URL(f.base_url).hostname==='127.0.0.1'&&Date.parse(f.expires_at)>Date.now());
 assert(f.database===p.environment&&prior.environment===f.database&&prior.complete);
 const award=prior.draw.data.results.find(x=>x.kind==='PRODUCTION_CREDIT'&&x.grant_id);
 assert(award,'The original ten draw did not award a production credit');
 const output=path.join(run,'credit-private.json');
 let s;
 try{s=await read(output);}catch(e){if(e.code!=='ENOENT')throw e;s={database:f.database,draw_id:prior.draw.id,grant_id:award.grant_id,checks:[],commands:{}};}
 assert.equal(s.database,f.database);assert.equal(s.draw_id,prior.draw.id);assert.equal(s.grant_id,award.grant_id);assert(!s.complete);
 const save=()=>fs.writeFile(output,JSON.stringify(s,null,2),{mode:0o600});
 async function call(role,route,{body,version,allowed=200,slot=route}={}){
  const a=f.accounts[role],headers={Authorization:'Bearer '+a.bearer_token,'X-Acting-Party':a.party_id};
  if(body!==undefined){
   const cmd=s.commands[slot]??={key:randomUUID(),body,version};assert.deepEqual(cmd.body,body);assert.equal(cmd.version,version);await save();
   Object.assign(headers,{'Content-Type':'application/json','Idempotency-Key':cmd.key,...(version?{'If-Match':'"'+version+'"'}:{})});
  }
  const r=await fetch(f.base_url+route,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
  const raw=Buffer.from(await r.arrayBuffer()),j=JSON.parse(raw);
  s.checks.push({role,route,status:r.status,code:j.error?.code,sha256:createHash('sha256').update(raw).digest('hex')});await save();
  assert.equal(r.status,allowed,route+' '+j.error?.code);return j.data;
 }
 try{
  const buy='/redemption/grants/'+s.grant_id;
  if(!s.wallet_before){s.wallet_before=await call('buyer','/wallet/summary');await save();}
  if(!s.quote){s.quote=await call('buyer','/trade/records/'+p.offer.quote.id);await save();}
  if(!s.hold){
   const grant=await call('buyer',buy);assert.equal(grant.current_status,'AVAILABLE');assert.equal(grant.data.template.production.face_minor,5000);
   s.hold=await call('buyer',buy+'/checkout',{body:{quote_id:s.quote.id},version:grant.object_version});assert.equal(s.hold.data.adjusted_quote.total_minor,45000);await save();
  }
  await call('outsider','/redemption/holds/'+s.hold.id,{allowed:404});
  if(!s.order){
   s.order=await call('buyer','/trade/quotes/'+s.quote.id+'/acceptance',{version:s.quote.object_version,body:{quote_sha256:s.quote.content_sha256,reward_selection:{hold_id:s.hold.id,adjusted_quote_sha256:s.hold.data.adjusted_quote_sha256}}});
   assert.equal(s.order.data.quote.discount.grant_id,s.grant_id);assert.equal(s.order.data.contract.commitments.quote.total_minor,45000);await save();
  }
  if(!s.payment){s.payment=await call('buyer','/trade/payments',{body:{order_id:s.order.id,installment_key:'first'}});assert.equal(s.payment.data.amount_minor,13500);await save();}
  if(!s.paid){
   if(!s.checks.some(r=>r.route==='/testing/payments/outcome'&&r.status===200))await call('buyer','/testing/payments/outcome',{body:{record_id:s.payment.id,state:'SUCCEEDED'}});
   s.paid=await call('buyer','/trade/payments/'+s.payment.id+'/reconciliation',{body:{transaction_id:null},slot:'reconciliation-with-explicit-alipay-reference'});assert.equal(s.paid.current_status,'SUCCEEDED');await save();
  }
  const used=await call('buyer',buy),order=await call('buyer','/trade/records/'+s.order.id);
  assert.equal(used.current_status,'USED');assert.deepEqual(order.data.contract,s.order.data.contract);
  assert.deepEqual(order.data.financial,{received_minor:13500,refunded_minor:0,net_minor:13500});
  assert.deepEqual(await call('buyer','/redemption/draws/'+prior.draw.id),prior.draw);
  assert.equal((await call('buyer','/wallet/summary')).available_points,s.wallet_before.available_points);
  s.complete=true;await save(); const result={result:'PASS',draw_id:s.draw_id,grant_id:s.grant_id,hold_id:s.hold.id,order_id:s.order.id,payment_id:s.payment.id,grant_status:used.current_status,financial:order.data.financial,requests:s.checks};
  await fs.writeFile(path.join(run,'credit-result.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({result:result.result,draw_id:s.draw_id,grant_id:s.grant_id,order_id:s.order.id,grant_status:used.current_status,financial:order.data.financial}));
 }catch(e){s.error=e.message;await save();throw e;}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
