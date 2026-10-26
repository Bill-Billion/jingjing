// Only imported by the explicitly isolated, marked acceptance runtime.
const path=require('node:path'),crypto=require('node:crypto');
const backend=path.resolve(__dirname,'../../晶晶日上工程交接包/01_源码/backend_server');
const load=p=>require(path.join(backend,p));
async function create({db,env,secret,merchant}){
 const auth=load('src/modules/auth/repository').createAuthRepository(db,{secret});
 const principal=async req=>{const a=await auth.resolve((req.headers.authorization||'').replace(/^Bearer /,''));return a?{subject_ref:a.subject_ref}:null;};
 const context=new (require('node:async_hooks').AsyncLocalStorage)(),sims=new Map();
 const sim=await load('src/testing/payment-simulator').createPaymentSimulator(db,{...env,JX_PAYMENT_SIMULATOR_ENABLED:'true'},{merchant_party_id:merchant,resolvePrincipal:principal});
 sims.set(merchant,sim);
 // Reuse only the older, explicitly synthetic sandbox payment fixtures. No real configuration is accepted.
 const [payments]=await db.execute("SELECT id,current_status,data_json FROM trade_records WHERE kind='PAYMENT'");
 for(const row of payments){const d=typeof row.data_json==='string'?JSON.parse(row.data_json):row.data_json;if(d.environment==='SANDBOX'&&d.app_id==='synthetic.app'&&d.merchant_id==='synthetic.merchant'&&['SUCCEEDED','PENDING','CLOSED'].includes(row.current_status))await db.execute('INSERT IGNORE INTO test_payment_simulator(id,kind,state,data_json) VALUES (?,?,?,?)',[row.id,'PAYMENT',row.current_status,JSON.stringify({...d,id:row.id})]);}
 function provider(code){const binding=context.getStore()||{merchant,legacy:false},base=sims.get(binding.merchant).get(code);if(!binding.legacy)return base;
  const config={...base.config,app_id:'synthetic.app',merchant_id:'synthetic.merchant'};
  return {...base,config,async call(op,p){const r=await base.call(op,p);return op==='query'?{...r,app_id:config.app_id,merchant_id:config.merchant_id,transaction_id:p.transaction_id||r.transaction_id}:r;},async refundQuery(p){return {...await base.refundQuery(p),app_id:config.app_id,merchant_id:config.merchant_id};}};
 }

 async function forMerchant(id){if(!sims.has(id))sims.set(id,await load('src/testing/payment-simulator').createPaymentSimulator(db,{...env,JX_PAYMENT_SIMULATOR_ENABLED:'true'},{merchant_party_id:id,resolvePrincipal:principal}));return sims.get(id);}
 await db.execute('CREATE TABLE IF NOT EXISTS test_identity_simulator (id CHAR(64) PRIMARY KEY, state VARCHAR(16) NOT NULL)');
 const identityKey=(person,session)=>crypto.createHash('sha256').update(person+'|'+session).digest('hex');
 const identity={async readiness(){return {current_status:'SERVICE_READY',reason_code:null,simulation:true};},async assertReady(){},async verify(i){
  const [[person]]=await db.execute('SELECT age_band FROM artist_people WHERE id=?',[i.person_id]);if(person?.age_band==='MINOR')throw Object.assign(Error(),{status:403,code:'MINOR_PROCESSING_DISABLED'});
  const [[selected]]=await db.execute('SELECT state FROM test_identity_simulator WHERE id=?',[identityKey(i.person_id,i.session_ref)]);const choice='synthetic:'+selected?.state;if(!['synthetic:SUCCEEDED','synthetic:FAILED','synthetic:UNKNOWN'].includes(choice))throw Object.assign(Error('SIMULATION_CHOICE_REQUIRED'),{status:400,code:'SIMULATION_CHOICE_REQUIRED'});
  if(choice==='synthetic:UNKNOWN')throw Object.assign(Error('SIMULATED_OUTCOME_UNKNOWN'),{status:503,code:'SIMULATED_OUTCOME_UNKNOWN'});
  return {request_key:i.request_key,person_id:i.person_id,status:choice==='synthetic:SUCCEEDED'?'VERIFIED':'REJECTED',issuer:'SIMULATED_ONLY',subject_fingerprint:crypto.createHash('sha256').update('synthetic:'+i.person_id).digest('hex'),age_band:'ADULT',valid_until:'2099-01-01T00:00:00.000Z',evidence_ref:'synthetic:no-camera-no-real-identity',liveness_verified:choice==='synthetic:SUCCEEDED',phone_verified:choice==='synthetic:SUCCEEDED'};
 }};
 async function handle(req,res){try{
  if(req.method!=='POST'||!await principal(req))throw Object.assign(Error(),{status:403,code:'LOCAL_TEST_AUTH_REQUIRED'});
  let bytes=0,chunks=[];for await(const c of req){bytes+=c.length;if(bytes>8192)throw Object.assign(Error(),{status:413});chunks.push(c);}const input=JSON.parse(Buffer.concat(chunks));const party_id=req.headers['x-acting-party'],{shape}=load('src/modules/party/policy');let data;
  if(req.url==='/api/v1/testing/identity/outcome'){
   shape(input,['person_id','session_ref','state']);if(!['SUCCEEDED','FAILED','UNKNOWN'].includes(input.state)||typeof input.session_ref!=='string'||!/^synthetic:[A-Za-z0-9_-]{16,100}$/.test(input.session_ref))throw Object.assign(Error(),{status:400,code:'SIMULATION_CHOICE_INVALID'});
   const account=await auth.resolve((req.headers.authorization||'').replace(/^Bearer /,''));const [[p]]=await db.execute("SELECT p.id,p.age_band FROM artist_people p JOIN party_memberships m ON m.party_id=p.owner_party_id AND m.account_id=? AND m.role_code='OWNER' AND m.current_status='ACTIVE' WHERE p.id=? AND p.owner_party_id=?",[account.id,input.person_id,party_id]);
   if(!p||p.age_band==='MINOR')throw Object.assign(Error(),{status:403,code:'OWN_ADULT_TEST_PERSON_REQUIRED'});
   const id=identityKey(input.person_id,input.session_ref);await db.execute('INSERT IGNORE INTO test_identity_simulator(id,state) VALUES (?,?)',[id,input.state]);
   const [changed]=await db.execute("UPDATE test_identity_simulator SET state=? WHERE id=? AND (state='UNKNOWN' OR state=?)",[input.state,id,input.state]);if(!changed.affectedRows)throw Object.assign(Error(),{status:409,code:'SIMULATOR_RESULT_FINAL'});data={simulation:true,state:input.state};
  }
  else if(req.url==='/api/v1/testing/payments/outcome'){shape(input,['record_id','state']);data=await sim.choose(req,{...input,party_id});}
  else if(req.url==='/api/v1/testing/wallet/topup'){shape(input,['amount_minor']);data=await sim.topup(req,{...input,party_id,operation_key:req.headers['idempotency-key']});}
  else throw Object.assign(Error(),{status:404,code:'TEST_ROUTE_NOT_FOUND'});
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({simulation:true,real_money:false,data}));
 }catch(e){res.writeHead(e.status||400,{'Content-Type':'application/json'});res.end(JSON.stringify({simulation:true,real_money:false,error:{code:e.code||'INVALID_TEST_REQUEST'}}));}}
 function wrap(app){const outer=require(path.join(backend,'node_modules/express'))();outer.use('/api/v1/trade',require(path.join(backend,'node_modules/express')).json({limit:'64kb',strict:true}));outer.use(async(req,res,next)=>{try{
   let id=req.method==='POST'&&req.path==='/api/v1/trade/payments'?req.body?.order_id:/^\/api\/v1\/trade\/(?:payments|refunds)\/([a-f0-9-]{36})\//.exec(req.path)?.[1];let target=merchant,legacy=false;
   if(id&&/^[a-f0-9-]{36}$/.test(id)){const [[r]]=await db.execute('SELECT merchant_party_id,data_json FROM trade_records WHERE id=?',[id]);if(r){target=r.merchant_party_id;const d=typeof r.data_json==='string'?JSON.parse(r.data_json):r.data_json;legacy=d.environment==='SANDBOX'&&d.app_id==='synthetic.app'&&d.merchant_id==='synthetic.merchant';}}
   await forMerchant(target);context.run({merchant:target,legacy},()=>app(req,res));
  }catch(e){next(e);}});return outer;}
 return {factories:{tradeProvidersFactory:()=>({get:provider}),artistIdentityProviderFactory:()=>identity},handle,wrap};
}
module.exports={create};
