'use strict';
// Disposable, loopback-only synthetic data for invoice and phone-change browser acceptance.
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

async function main() {
  if (process.argv.length !== 2 || !process.env.JX_MYSQL_TEST_ENV_FILE) throw Error('Use JX_MYSQL_TEST_ENV_FILE with this local fixture');
  const env = JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE, 'utf8'));
  for (const [k,v] of Object.entries({ NODE_ENV:'test', DB_CLIENT:'mysql', MYSQL_HOST:'127.0.0.1', MYSQL_PORT:'33316', MYSQL_USER:'jx_local', MYSQL_DATABASE:'jx_dev' })) assert.equal(env[k],v,'Refusing non-isolated database configuration');
  const suffix = process.pid+'_'+randomBytes(6).toString('hex');
  const name = 'jx_test_explore_'+suffix;
  const out = path.join(root,'.local/pr39-invoice-phone-'+suffix);
  await fs.mkdir(out,{ recursive:false, mode:0o700 });
  let control, db, server, upstream, phoneSimulation, created=false, starting=true, stopping=false, cleanupPromise, watcher, timer, commandBusy=false;
  const requests=[], losses=[];let lossPlan=null;
  const write = (file,value) => fs.writeFile(path.join(out,file),JSON.stringify(value,null,2)+'\n');
  const cleanup = () => cleanupPromise ??= (async () => {
    clearInterval(watcher); clearTimeout(timer); process.stdin.pause();
    const failed_steps=[];
    const step=async(label,action)=>{try {await action();return true;} catch {failed_steps.push(label);return false;}};
    const credentials_removed=await step('credentials',()=>fs.unlink(path.join(out,'access.json')).catch(e=>{if(e.code!=='ENOENT')throw e;}));
    if(phoneSimulation)await step('codes',()=>phoneSimulation.cleanup());
    if(server)await step('http',async()=>{server.closeAllConnections();await new Promise((ok,no)=>server.close(e=>e&&e.code!=='ERR_SERVER_NOT_RUNNING'?no(e):ok()));});
    if(upstream)await step('upstream',async()=>{upstream.closeAllConnections();await new Promise(ok=>upstream.close(ok));});
    if(db)await step('pool',()=>db.close());
    const database_removed=!created||/^jx_test_explore_[0-9]+_[a-f0-9]{12}$/.test(name)&&await step('database',()=>control.query('DROP DATABASE '+mysql.escapeId(name)));
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
    const {buyer,seller,reviewer:handler,outsider:verifier,buyer2:other}=S;
    const grant=async(user,action,enabled=true)=>{
      const [[old]]=await db.execute('SELECT object_version FROM governance_operator_grants WHERE account_id=? AND action_code=?',[user.account_id,action]);
      return from('src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:user.account_id,action,enabled,expected_version:old?.object_version||0,expires_at:null,authority_ref:'synthetic:invoice-phone-ui',reason:'Local synthetic acceptance only'});
    };
    for(const [user,action] of [[handler,'INVOICE_HANDLE'],[handler,'SUPPORT_HANDLE'],[verifier,'INVOICE_VERIFY']])await grant(user,action);
    await db.execute('UPDATE auth_sessions SET expires_ms=ROUND(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000)+14400000');
    const parties=from('src/modules/party/repository').createPartyRepository(db,{resolvePrincipal:S.resolvePrincipal});
    const org=await parties.createOrganization(buyer.ctx,{display_name:'合成开票身份隔离机构',operation_key:key()});
    const storage=require('./client-testing/synthetic-files.cjs').openFiles(path.join(out,'assets'));
    for(const [key,body] of S.bytes)await storage.put({key,body:Buffer.from(body)});
    const storageFactory=()=>storage;
    const assets=from('src/modules/works/assets').createSupplyAssets({db,repository:from('src/modules/works/repository').createSupplyRepository(db,{resolvePrincipal:S.resolvePrincipal}),storageFactory});
    const upload=(user,body,type='text/plain',purpose='REVIEW_EVIDENCE')=>assets.upload(user.ctx,{party_id:user.personal_party_id,purpose,media_type:type,body:Buffer.from(body),operation_key:key()});
    for(const [file,seconds] of [['full.mp4',3],['preview.mp4',1]]){
      await from('src/modules/media/marking').run('/opt/homebrew/bin/ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','color=c=0x294F68:s=320x180:r=10','-t',String(seconds),'-c:v','libx264','-pix_fmt','yuv420p','-threads','1','-movflags','+faststart','-y',file],{cwd:out});
      const asset=await upload(seller,await fs.readFile(path.join(out,file)),'video/mp4','WORK_CONTENT');S.listingInput[file==='full.mp4'?'file_id':'preview_file_id']=asset.id;
    }
    const orders={};
    for(const label of ['seeded','fresh','unpaid']){
      const listing=await S.listing(),order=await S.checkout(listing),paid=label==='unpaid'?null:await S.payment(order);
      orders[label]={listing,order,paid};
    }
    const invoiceEnv={NODE_ENV:'test',INVOICE_SANDBOX_ENABLED:'true'};
    const invoices=from('src/modules/invoices/repository').createInvoiceRepository(db,{resolvePrincipal:S.resolvePrincipal,env:invoiceEnv});
    const support=from('src/modules/support/repository').createSupportRepository(db,{resolvePrincipal:S.resolvePrincipal});
    const material=await upload(buyer,'Synthetic original invoice material. No real tax information.');
    const supplement=await upload(buyer,'Synthetic supplemental invoice material.');
    await fs.writeFile(path.join(out,'invoice-supplement.txt'),'Synthetic supplemental invoice material.\n');
    const header={kind:'PERSON',title:'合成客户小林',tax_id:null},seededInvoices={};
    async function actInvoice(row,action,extra={}){
      const user=['VERIFY_DOCUMENT','REJECT_DOCUMENT'].includes(action)?verifier:handler;
      return invoices.act(user.ctx,{invoice_id:row.id,operations:true,action,text:'仅本机模拟办理，非真实发票',expected_version:row.object_version,operation_key:key(),...extra});
    }
    for(const state of ['REQUESTED','NEEDS_INFO','ISSUED']){
      let row=await invoices.create(buyer.ctx,{party_id:buyer.personal_party_id,order_id:orders.seeded.order.id,amount_minor:20,header,text:'合成开票申请 '+state,asset_ids:[material.id],operation_key:key()});
      if(state==='NEEDS_INFO')row=await actInvoice(row,'REQUEST_INFO');
      if(state==='ISSUED'){
        row=await actInvoice(row,'APPROVE');
        row=await actInvoice(row,'RECORD_DOCUMENT',{document:{amount_minor:20,reference:'SYNTHETIC-'+key(),issued_at:new Date(Date.now()-1000).toISOString(),asset_id:null,header}});
        row=await actInvoice(row,'VERIFY_DOCUMENT');
      }
      seededInvoices[state]={id:row.id,order_id:row.order_id,document_id:row.issued_document_id};
    }
    let ticket=await support.create(buyer.ctx,{party_id:buyer.personal_party_id,kind:'FEEDBACK',title:'合成换号后保留的客服记录',target:null,text:'账号登录号码更改后，原工单仍应保留。仅测试。',asset_ids:[material.id],operation_key:key()});
    for(const action of ['START','REQUEST_INFO'])ticket=await support.act(handler.ctx,{ticket_id:ticket.id,operations:true,action,text:'合成补资料说明',asset_ids:[],expected_version:ticket.object_version,operation_key:key()});
    const oldPhone='13900009801',newPhone='13900009802';
    const authBase=from('src/modules/auth/repository').createAuthRepository(db,{secret:S.secret});
    await db.execute('INSERT INTO auth_subjects(phone_hash,account_id) VALUES (?,?)',[authBase.secure.digest('phone',oldPhone),buyer.account_id]);
    const environmentId=key();
    await db.execute('CREATE TABLE client_test_environment (id VARCHAR(36) PRIMARY KEY, synthetic_only TINYINT NOT NULL) ENGINE=InnoDB');
    await db.execute('INSERT INTO client_test_environment(id,synthetic_only) VALUES (?,1)',[environmentId]);
    // The official local SMS adapter validates this marker, test DB, file store and fixed pair.
    const manifest={format:1,synthetic_only:true,database:name,database_env:{...env,MYSQL_DATABASE:name},environment_id:environmentId,secret:S.secret,file_store:true,access:{synthetic_only:true,payment_simulation:true,accounts:{buyer:{account_id:buyer.account_id}},scenarios:{complete:{phone:{old_phone:oldPhone,new_phone:newPhone}}}},rules:[{method:'GET',pattern:'^/api/v1/me$'}]};
    phoneSimulation=await require('./client-testing/phone-simulation.cjs').create(db,manifest,out);
    alive();
    const app=from('src/http/account-api').createAccountApi({db,secret:S.secret,sms:phoneSimulation.sms,authSettings:phoneSimulation.authSettings,supplyEnv:{...invoiceEnv,MEDIA_FFMPEG:'/opt/homebrew/bin/ffmpeg',MEDIA_FFPROBE:'/opt/homebrew/bin/ffprobe'},supplyStorageFactory:storageFactory,allowedOrigins:['http://127.0.0.1:5173','http://localhost:5173','http://127.0.0.1:5500','http://localhost:5500']});
    upstream=http.createServer(app);upstream.listen(0,'127.0.0.1');await new Promise((ok,no)=>{upstream.once('listening',ok);upstream.once('error',no);});
    server=http.createServer((req,res)=>{
      const requestPath=req.url,requestMethod=req.method;
      const proxy=http.request({hostname:'127.0.0.1',port:upstream.address().port,path:requestPath,method:requestMethod,headers:{...req.headers,host:'127.0.0.1:'+upstream.address().port}},reply=>{
        const drop=lossPlan&&lossPlan.path===requestPath&&requestMethod==='POST'&&reply.statusCode>=200&&reply.statusCode<300;
        if(drop)lossPlan=null;
        const event={at:new Date().toISOString(),method:requestMethod,path:requestPath,status:reply.statusCode,delivered:!drop};
        if(drop){
          reply.resume();reply.on('end',()=>{losses.push({...event,meaning:'REAL_BACKEND_SUCCESS_RESPONSE_DISCARDED'});requests.push(event);if(requests.length>1500)requests.shift();void write('response-loss.json',{synthetic_only:true,losses});res.destroy();});
        }else{
          requests.push(event);if(requests.length>1500)requests.shift();res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);
        }
      });
      proxy.on('error',()=>{if(!res.headersSent)res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{code:'LOCAL_PROXY_UNAVAILABLE'}}));});
      req.pipe(proxy);
    });
    server.listen(0,'127.0.0.1');await new Promise((ok,no)=>{server.once('listening',ok);server.once('error',no);});
    const base_url='http://127.0.0.1:'+server.address().port+'/api/v1';
    const account=(u,party=u.personal_party_id)=>({account_id:u.account_id,party_id:party,personal_party_id:u.personal_party_id,bearer_token:u.token});
    const accounts={viewer:account(buyer),buyer:account(buyer),owner:account(buyer,org.party_id),handler:account(handler),verifier:account(verifier),other:account(other),seller:account(seller)};
    const scenarios={orders:Object.fromEntries(Object.entries(orders).map(([k,v])=>[k,{order_id:v.order.id,listing_id:v.listing.id,paid:!!v.paid}])),invoices:seededInvoices,ticket_id:ticket.id,asset_ids:{initial:material.id,supplement:supplement.id},organization_party_id:org.party_id,phone:{old_phone:oldPhone,new_phone:newPhone,initial_login_recent:false}};
    const saveAccess=()=>fs.writeFile(path.join(out,'access.json'),JSON.stringify({synthetic_only:true,base_url,accounts,scenarios},null,2)+'\n',{mode:0o600});
    async function call(method,url,{actor=accounts.viewer,acting=true,body,version,op=key(),binary=false}={}){
      const response=await fetch(base_url+url,{method,headers:{...(actor?{Authorization:'Bearer '+actor.bearer_token}:{}),...(actor&&acting?{'X-Acting-Party':actor.party_id}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...(method==='POST'?{'Idempotency-Key':op}:{}),...(version?{'If-Match':'"'+version+'"'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
      return {status:response.status,body:binary&&response.ok?Buffer.from(await response.arrayBuffer()):await response.json()};
    }
    const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body.data;};
    const refunds=new Map();
    async function refund(label){
      assert.ok(['seeded','fresh'].includes(label));if(refunds.has(label))return {refund_id:refunds.get(label),already_applied:true};
      const target=orders[label];let purchase=await S.stock.purchased(buyer.ctx,{party_id:buyer.personal_party_id,order_id:target.order.id});
      purchase=await S.stock.openCase(buyer.ctx,{party_id:buyer.personal_party_id,order_id:target.order.id,expected_version:purchase.object_version,kind:'RIGHTS_DISPUTE',reason:'Synthetic invoice correction test',operation_key:key()});
      await S.stock.resolveCase(handler.ctx,{order_id:target.order.id,expected_version:purchase.object_version,case_id:purchase.data.current_case_id,decision:'REFUND',reason:'Synthetic isolated refund approval',operation_key:key()});
      let r=await S.trade.requestRefund(buyer.ctx,{party_id:buyer.personal_party_id,payment_id:target.paid.payment.id,allocations:[{line_id:'stock',amount_minor:100}],reason:'Synthetic correction test',operation_key:key()});
      r=await S.trade.review(handler.ctx,{record_id:r.id,expected_version:r.object_version,decision:'APPROVED',reason:'Synthetic independent refund review',operation_key:key()});
      await S.trade.claim(handler.ctx,r.id,null,'REFUND');await S.trade.applyRefund(r.id,{...r.data,refund_id:r.id,status:'SUCCEEDED'});refunds.set(label,r.id);return {refund_id:r.id,order_id:target.order.id};
    }
    const readCode=async phone=>{const inbox=JSON.parse(await fs.readFile(path.join(out,'phone-codes.json'),'utf8'));assert.equal(inbox.synthetic_only,true);return inbox.codes[phone];};
    async function refreshLogin(side){
      assert.ok(['old','new'].includes(side));const phone=side==='old'?oldPhone:newPhone;
      const [[binding]]=await db.execute('SELECT account_id FROM auth_subjects WHERE phone_hash=?',[authBase.secure.digest('phone',phone)]);assert.equal(binding?.account_id,buyer.account_id,'Only the original buyer binding may refresh fixture access');
      const challenge=ok(await call('POST','/auth/sms-challenges',{actor:null,acting:false,body:{phone,purpose:'LOGIN'}}));
      const login=ok(await call('POST','/auth/sessions',{actor:null,acting:false,body:{phone,challenge_id:challenge.challenge_id,code:await readCode(phone)}}));assert.equal(login.account.id,buyer.account_id);
      for(const role of ['viewer','buyer','owner'])accounts[role].bearer_token=login.access_token;await saveAccess();
      const checks=[];
      for(const url of ['/trade/records/'+orders.seeded.order.id,'/support/tickets/'+ticket.id,'/invoices/requests/'+seededInvoices.ISSUED.id]){const value=ok(await call('GET',url));checks.push({path:url,ok:true,record_id:value.id});}
      const current=ok(await call('GET','/me/phone-changes/current',{acting:false}));
      await write('continuity.json',{synthetic_only:true,account_id:login.account.id,phone_side:side,checks,change_id:current.request?.id||null,status:current.request?.current_status||null,requires_relogin:current.request?.requires_relogin||false});
      return {account_id:login.account.id,phone_side:side,checks:checks.length,change_status:current.request?.current_status||null,access_file_updated:true};
    }
    async function command(input){
      assert.match(input.id,/^[a-zA-Z0-9_-]{1,80}$/);let extra={};
      if(input.action==='response-loss'){
        if(input.enabled===false)lossPlan=null;
        else{assert.equal(typeof input.path,'string');assert.ok(/^\/api\/v1\/(?:invoices\/requests(?:\/[a-f0-9-]{36}\/actions)?|me\/phone-changes(?:\/[a-f0-9-]{36}\/(?:challenges|verifications|confirmation|cancellation))?|auth\/sms-challenges)$/.test(input.path));assert.equal(lossPlan,null,'A loss is already armed');lossPlan={path:input.path};}
      }else if(input.action==='refund')extra=await refund(input.order||'seeded');
      else if(input.action==='permission'){
        assert.ok(['handler','verifier'].includes(input.role));assert.equal(typeof input.enabled,'boolean');await grant(input.role==='handler'?handler:verifier,input.role==='handler'?'INVOICE_HANDLE':'INVOICE_VERIFY',input.enabled);
      }else if(input.action==='membership'){
        assert.equal(typeof input.enabled,'boolean');await db.execute('UPDATE party_memberships SET current_status=? WHERE account_id=? AND party_id=?',[input.enabled?'ACTIVE':'REVOKED',buyer.account_id,buyer.personal_party_id]);
      }else if(input.action==='invoice-action'){
        assert.match(input.invoice_id,/^[a-f0-9-]{36}$/);assert.ok(['REQUEST_INFO','APPROVE','REJECT','REQUEST_CORRECTION','RECORD_DOCUMENT','VERIFY_DOCUMENT','REJECT_DOCUMENT'].includes(input.operation));
        let row=await invoices.read(handler.ctx,{invoice_id:input.invoice_id,operations:true});assert.equal(row.buyer_party_id,buyer.personal_party_id);
        const body=input.operation==='RECORD_DOCUMENT'?{document:{amount_minor:input.amount_minor??row.requested_minor,reference:'SYNTHETIC-'+key(),issued_at:new Date(Date.now()-1000).toISOString(),asset_id:null,header:row.header}}:{};
        row=await actInvoice(row,input.operation,body);extra={invoice_id:row.id,status:row.current_status,object_version:row.object_version,issued_document_id:row.issued_document_id,pending_document_id:row.pending_document_id};
      }else if(input.action==='refresh-login')extra=await refreshLogin(input.phone);
      else if(input.action!=='inspect')throw Error('Unknown fixture action');
      await write('requests.json',{synthetic_only:true,requests});return {...extra,armed_loss:lossPlan,loss_count:losses.length,scenarios};
    }
    async function watch(){
      if(commandBusy||stopping)return;
      try{await fs.access(path.join(out,'stop'));stop();return;}catch(e){if(e.code!=='ENOENT'){stop();return;}}
      commandBusy=true;
      try{let input;try{input=JSON.parse(await fs.readFile(path.join(out,'command.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return;throw e;}await fs.unlink(path.join(out,'command.json'));let result;try{result={id:input.id,ok:true,result:await command(input)};}catch(e){result={id:input.id,ok:false,error:e.code||e.message};}await write('command-result.json',result);}catch(e){console.error('ISOLATED_COMMAND_FAILED',e.code||e.message);}finally{commandBusy=false;}
    }
    alive();await saveAccess();
    await write('fixture.json',{synthetic_only:true,scenarios,notes:['All media, accounts, payments and invoices are synthetic; no real invoice or SMS provider is enabled.','SMS uses the existing client-testing phone-simulation adapter and writes only ignored phone-codes.json, removed on stop.','viewer starts with a seed session that must reauthenticate through SMS before phone replacement.','handler and verifier are distinct accounts with separately granted capabilities.','The proxy can discard one successful backend response. response-loss.json distinguishes committed backend success from transport failure.'],commands:['inspect','response-loss {path,enabled:true|false}','refund {order:seeded|fresh}','permission {role:handler|verifier,enabled}','membership {enabled}','invoice-action {invoice_id,operation,amount_minor?}','refresh-login {phone:old|new}']});
    await write('status.json',{status:'RUNNING',synthetic_only:true,database:name,base_url,created_at:new Date().toISOString(),expires_in_minutes:240});
    starting=false;watcher=setInterval(watch,200);timer=setTimeout(stop,240*60*1000);
    console.log(JSON.stringify({status:'READY',synthetic_only:true,base_url,folder:out,access_file:path.join(out,'access.json'),ttl_minutes:240,self_check:'RUNNING'}));
    const checks=[],check=(label,details={})=>checks.push({label,ok:true,...details});
    assert.equal(ok(await call('GET','/invoices/orders/'+orders.unpaid.order.id+'/eligibility')).available_minor,0);check('unpaid order has zero invoice eligibility');
    assert.equal(ok(await call('GET','/invoices/orders/'+orders.fresh.order.id+'/eligibility')).available_minor,100);assert.equal(ok(await call('GET','/invoices/orders/'+orders.seeded.order.id+'/eligibility')).available_minor,40);check('paid and reserved cash eligibility');
    const rows=ok(await call('GET','/invoices/requests')).items;assert.deepEqual(new Set(rows.map(r=>r.current_status)),new Set(['REQUESTED','NEEDS_INFO','ISSUED']));check('three real invoice states readable');
    const issued=seededInvoices.ISSUED,document=await call('GET','/invoices/requests/'+issued.id+'/documents/'+issued.document_id+'/content',{binary:true});assert.equal(document.status,200);assert.match(document.body.toString(),/模拟凭证，非真实发票/);check('controlled download has simulation label');
    assert.equal((await call('GET','/invoices/requests/'+issued.id,{actor:accounts.other})).status,404);assert.equal((await call('GET','/invoices/operations/requests',{actor:accounts.other,acting:false})).status,403);assert.equal(ok(await call('GET','/invoices/requests',{actor:accounts.owner})).items.length,0);check('other account, unauthorized operator and alternate identity isolated');
    for(const actor of [accounts.handler,accounts.verifier])assert.ok(ok(await call('GET','/invoices/operations/requests',{actor,acting:false})).items.length>=3);check('independent handling and verification roles readable');
    const before=await call('POST','/me/phone-changes',{acting:false,body:{old_phone:oldPhone,new_phone:newPhone}});assert.equal(before.status,409);assert.equal(before.body.error.code,'RECENT_LOGIN_REQUIRED');assert.equal(ok(await call('GET','/me/phone-changes/current',{acting:false})).request,null);check('seed login requires real recent SMS proof before changing phone');
    assert.equal(ok(await call('GET','/support/tickets/'+ticket.id)).id,ticket.id);const bytes=await call('GET','/stock/purchases/'+orders.seeded.order.id+'/content',{binary:true});assert.equal(bytes.status,200);assert.equal(bytes.body.toString('ascii',4,8),'ftyp');check('original ticket and playable paid order file readable',{content_sha256:sha(bytes.body)});
    await write('verified.json',{synthetic_only:true,transport:'real loopback HTTP',checks,limits:['Phone replacement and refund remain untouched for browser acceptance.','No real tax invoice, payment, or SMS provider was used.']});
    console.log(JSON.stringify({status:'VERIFIED',checks:checks.length,folder:out}));
  }catch(e){starting=false;await cleanup();if(e.code!=='LOCAL_STOP_REQUESTED')throw e;}
}
main().catch(e=>{console.error(e.code||e.message||'INVOICE_PHONE_SANDBOX_FAILED');process.exitCode=1;});
