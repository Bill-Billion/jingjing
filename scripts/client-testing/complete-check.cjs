'use strict';
// Starts only an explicitly selected, newly prepared synthetic fixture. No public listener.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID:key,createHash}=require('node:crypto');
const root=path.resolve(__dirname,'../..');
async function main(){
 const name=process.argv[2];assert(/^jx_test_explore_[0-9]+_[a-f0-9]{12}$/.test(name));
 const dir=path.join(root,'.local/client-persistent',name),marker=path.join(dir,'complete-check.json');
 assert(!fs.existsSync(marker),'This fixture has already been tested; prepare a fresh one to repeat.');
 const runtime=await require('./persistent-story.cjs').start(name,{hours:1}),f=runtime.access,c=f.scenarios.complete;
 assert(c?.synthetic_only);const requests=[],checks=[];let failure;
 const account=role=>f.accounts[role];
 async function call(method,url,role,{body,version,party=true,status=200,token,op=key(),binary=false}={}){
  const a=account(role),res=await fetch(f.base_url+url,{method,headers:{Authorization:'Bearer '+(token||a.bearer_token),...(party?{'X-Acting-Party':a.party_id}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...(method!=='GET'?{'Idempotency-Key':op}:{}),...(version?{'If-Match':'"'+version+'"'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  const v=binary&&res.ok?Buffer.from(await res.arrayBuffer()):await res.json();
  requests.push({method,path:url,role,status:res.status,error:v.error?.code,record_id:v.data?.id||null});
  assert.equal(res.status,status,`${method} ${url}: ${v.error?.code}`);return res.ok?(binary?v:v.data):v.error;
 }
 const check=(name,ok,records={})=>{assert(ok,name);checks.push({name,result:'PASS',records});};
 try{
  const buyer=c.roles.applicant,handler=c.roles.handler,verifier=c.roles.verifier,order=c.order_id;
  const org=await call('GET','/directory/organizations/'+c.directory.party_id,buyer,{party:false});
  const cover=await call('GET','/directory/organizations/'+c.directory.party_id+'/cover',buyer,{party:false,binary:true});
  check('机构公开档案仍展示已审核版，新草稿不覆盖，主图能读取',org.record_id===c.directory.approved_id&&cover.length>100,c.directory);
  const featured=await call('GET','/directory/featured-artists',buyer,{party:false});
  check('精选艺人使用已审公开形象并标明编辑推荐',featured.items.some(i=>i.record_id===c.directory.featured_id&&i.selection_kind==='EDITORIAL_SELECTION'),c.directory);
  const original=await call('GET','/stock/purchases/'+order+'/content',buyer,{binary:true});const originalHash=createHash('sha256').update(original).digest('hex');
  check('样片订单已付款可读取私有成片，确为视频',original.toString('ascii',4,8)==='ftyp',{order_id:order,sha256:originalHash});
  await call('GET','/stock/purchases/'+order+'/content','outsider',{status:404});
  check('另一个身份不能读取原订单成片',true,{order_id:order});
  const favorites=await call('GET','/me/collections/favorites',buyer,{party:false});
  check('收藏中有真实可打开的测试作品',favorites.items.some(i=>i.target_id===c.collection.target_id&&i.availability==='AVAILABLE'),c.collection);
  let pref=await call('GET','/me/collections/preferences',buyer,{party:false});assert.equal(pref.history_enabled,false);
  pref=await call('POST','/me/collections/preferences',buyer,{party:false,version:pref.object_version,body:{history_enabled:true}});
  await call('POST','/me/collections/history',buyer,{party:false,version:pref.object_version,body:{kind:'STOCK',target_id:c.collection.target_id}});
  assert.equal((await call('GET','/me/collections/history',buyer,{party:false})).items.length,1);
  pref=await call('DELETE','/me/collections/history',buyer,{party:false,version:pref.object_version,body:{}});
  assert.equal((await call('GET','/me/collections/history',buyer,{party:false})).items.length,0);
  await call('POST','/me/collections/history',buyer,{party:false,version:pref.object_version-1,body:{kind:'STOCK',target_id:c.collection.target_id},status:412});
  check('开启足迹、记录、清空、旧请求不能写回',true);
  const ticketId=c.tickets.NEEDS_INFO.id;
  let ticket=await call('GET','/support/tickets/'+ticketId,buyer);
  const supportAct=async(action,role,operations=false)=>ticket=await call('POST','/support/'+(operations?'operations/':'')+'tickets/'+ticketId+'/actions',role,{party:!operations,version:ticket.object_version,body:{action,text:'模拟：按步骤处理并查看答复',asset_ids:[]}});
  await supportAct('SUPPLEMENT',buyer);await supportAct('START',handler,true);await supportAct('ANSWER',handler,true);await supportAct('CLOSE',buyer);await supportAct('REOPEN',buyer);
  const history=await call('GET','/support/tickets/'+ticketId+'/history',buyer);
  check('客服补件、处理、答复、关闭、重开保留同一工单记录',ticket.current_status==='SUBMITTED'&&history.items.length>=8,{ticket_id:ticketId});
  await call('GET','/support/tickets/'+ticketId,'outsider',{status:404});
  const feed=await call('GET','/operations/notifications/feed',buyer);
  check('客服处理后本人通知可读取',Array.isArray(feed.items),{ticket_id:ticketId});
  let invoice=await call('GET','/invoices/requests/'+c.invoices.NEEDS_INFO.id,buyer);
  const invoiceId=invoice.id,header={kind:'PERSON',title:'模拟客户小林（已补充）',tax_id:null};
  const invoiceAct=async(action,role,operations=false,extra={})=>invoice=await call('POST','/invoices/'+(operations?'operations/':'')+'requests/'+invoiceId+'/actions',role,{party:!operations,version:invoice.object_version,body:{action,text:'模拟发票处理，非真实税务凭证',...extra}});
  await invoiceAct('SUPPLEMENT',buyer,false,{header,asset_ids:[]});await invoiceAct('APPROVE',handler,true);
  await invoiceAct('RECORD_DOCUMENT',handler,true,{document:{amount_minor:invoice.requested_minor,reference:'SYNTHETIC-'+key(),issued_at:new Date(Date.now()-1000).toISOString(),asset_id:null,header}});
  await call('GET','/invoices/requests/'+invoiceId+'/documents/'+invoice.pending_document_id+'/content',buyer,{status:404});
  await invoiceAct('VERIFY_DOCUMENT',verifier,true);
  const bytes=await call('GET','/invoices/requests/'+invoiceId+'/documents/'+invoice.issued_document_id+'/content',buyer,{binary:true});
  check('同一订单补全抬头、审核、独立复核、下载明确标注的模拟凭证',bytes.toString().includes('模拟凭证，非真实发票'),{order_id:order,invoice_id:invoiceId,document_id:invoice.issued_document_id});
  await call('GET','/invoices/requests/'+invoiceId,'outsider',{status:404});
  const contracts=await call('GET','/me/business/contracts?source=TRADE_ORDERS',buyer);
  const works=await call('GET','/me/business/works?source=STOCK_PURCHASES',buyer);
  check('本人合同和作品能关联原现货订单',[contracts,works].every(v=>!v.partial&&v.sections.some(s=>s.items.some(i=>i.record_id===order))),{order_id:order});
  const p=c.phone,readCode=phone=>{const inbox=JSON.parse(fs.readFileSync(path.join(dir,'phone-codes.json'),'utf8'));assert(inbox.synthetic_only);return inbox.codes[phone];};
  async function login(phone){const ch=await call('POST','/auth/sms-challenges',buyer,{party:false,body:{phone,purpose:'LOGIN'}});return call('POST','/auth/sessions',buyer,{party:false,body:{phone,challenge_id:ch.challenge_id,code:readCode(phone)}});}
  await call('POST','/me/phone-changes',buyer,{party:false,body:{old_phone:p.old_phone,new_phone:p.new_phone},status:409});
  const loginBefore=await login(p.old_phone);assert.equal(loginBefore.account.id,account(buyer).account_id);
  let change=await call('POST','/me/phone-changes',buyer,{party:false,token:loginBefore.access_token,body:{old_phone:p.old_phone,new_phone:p.new_phone}});
  const changeId=change.id;
  for(const [side,phone] of [['OLD',p.old_phone],['NEW',p.new_phone]]){
   const sendOptions={party:false,token:loginBefore.access_token,version:change.object_version,body:{side},op:key()};
   change=await call('POST','/me/phone-changes/'+changeId+'/challenges',buyer,sendOptions);
   const replay=await call('POST','/me/phone-changes/'+changeId+'/challenges',buyer,sendOptions);
   assert.equal(replay.object_version,change.object_version);
   change=await call('POST','/me/phone-changes/'+changeId+'/verifications',buyer,{party:false,token:loginBefore.access_token,version:change.object_version,body:{side,challenge_id:change.challenges.find(x=>x.side===side).id,code:readCode(phone)}});
  }
  change=await call('POST','/me/phone-changes/'+changeId+'/confirmation',buyer,{party:false,token:loginBefore.access_token,version:change.object_version,body:{}});
  assert.equal(change.current_status,'COMPLETED');
  await call('GET','/me',buyer,{party:false,token:loginBefore.access_token,status:401});
  await call('GET','/me',buyer,{party:false,status:401});
  const loginAfter=await login(p.new_phone);assert.equal(loginAfter.account.id,loginBefore.account.id);
  const restored=await call('GET','/me/phone-changes/current',buyer,{party:false,token:loginAfter.access_token});
  assert.equal(restored.request.id,changeId);assert.equal(restored.request.requires_relogin,false);
  const content=await call('GET','/stock/purchases/'+order+'/content',buyer,{token:loginAfter.access_token,binary:true});
  assert.equal(createHash('sha256').update(content).digest('hex'),originalHash);
  assert.equal((await call('GET','/invoices/requests/'+invoiceId,buyer,{token:loginAfter.access_token})).issued_document_id,invoice.issued_document_id);
  assert.equal((await call('GET','/support/tickets/'+ticketId,buyer,{token:loginAfter.access_token})).id,ticketId);
  check('验证两号码、确认、重新登录后原订单文件、发票和工单均保留，旧登录全部失效',true,{account_id:loginAfter.account.id,change_id:changeId,order_id:order,invoice_id:invoiceId,ticket_id:ticketId});
  const recycled=await login(p.old_phone);assert.notEqual(recycled.account.id,loginAfter.account.id);
  await call('GET','/stock/purchases/'+order+'/content',buyer,{token:recycled.access_token,status:403});
  check('旧号码重新注册只能获得新账号，不能访问原订单',true,{original_account_id:loginAfter.account.id,new_account_id:recycled.account.id});
 }catch(e){failure=e.message;process.exitCode=1;}
 finally{await runtime.stop();}
 const report={result:failure?'FAIL':'PASS',synthetic_only:true,database:name,checks,requests,failure,cleanup:'SERVER_STOPPED_CODES_AND_TOKENS_REMOVED_DATA_RETAINED',limits:['接口完整办理检查，不代表前端页面或151条全部验收','内存短信、模拟付款和明确标记的凭证；真实服务均未调用']};
 fs.writeFileSync(marker,JSON.stringify(report,null,2));
 const out=path.join(root,'docs/testing/evidence/complete-flows-20261030');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'complete-flow.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({result:report.result,checks:checks.length,requests:requests.length,failure,database:name}));
}
main().catch(e=>{console.error(JSON.stringify({error:e.code||e.message,at:e.stack?.split('\n').slice(1,3)}));process.exitCode=1;});
