// Isolated acceptance tooling. Not mounted in the production application.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {openStore,fault,sha}=require('./store.cjs');
const ui=__dirname;
function safeRoute(value){
  if(typeof value!=='string'||value.length>600||!value.startsWith('/')||value.startsWith('//')||/[\\<>\r\n]/.test(value))return '/';
  const u=new URL(value,'http://local');const clean=p=>/^[A-Za-z0-9_/.%-]*$/.test(p)?p:'/';
  const keys=new Set(['recordId','id','requestId','projectId','section','installmentKey','view','kind','personId','agreementId','orderId']);
  const filter=q=>{const out=new URLSearchParams();for(const [k,v]of q)if(keys.has(k)&&/^[A-Za-z0-9_-]{1,80}$/.test(v))out.set(k,v);return out.size?'?'+out:'';};
  const h=u.hash?new URL(u.hash.slice(1),'http://local'):null;
  return clean(u.pathname)+filter(u.searchParams)+(h?'#'+clean(h.pathname)+filter(h.searchParams):'');
}
function text(v,min,max){if(typeof v!=='string'||v.trim().length<min||v.length>max)throw fault(400,'请检查必填内容和字数限制');return v.trim();}
async function body(req,max=3*1024*1024){let size=0,chunks=[];if(req.headers['content-encoding'])throw fault(415,'不接受压缩请求');for await(const c of req){size+=c.length;if(size>max)throw fault(413,'内容太大，请缩小截图');chunks.push(c);}try{return JSON.parse(Buffer.concat(chunks));}catch{throw fault(400,'请求格式有误');}}
function image(value){
  if(!value)return null;if(typeof value!=='string')throw fault(400,'截图格式有误');
  const m=/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(value);if(!m)throw fault(415,'只接受PNG或JPEG截图');
  const b=Buffer.from(m[2],'base64');if(b.length>2*1024*1024||b.length<20)throw fault(413,'截图需小于2MB');
  if(m[1]==='png'?!b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):!(b[0]===255&&b[1]===216&&b[2]===255))throw fault(415,'截图内容与格式不符');
  return {type:'image/'+m[1],data:b.toString('base64')};
}
function createPortal(config,{current=()=>true}={}){
  assert(config.synthetic_only===true);assert(/^[a-f0-9]{7,40}$/.test(config.version));
  const origin=new URL(config.origin);assert(origin.origin===config.origin&&!origin.username&&!origin.password);
  assert(origin.protocol==='https:'||(origin.protocol==='http:'&&origin.hostname==='127.0.0.1'));
  const expires=Date.parse(config.expires_at);assert(expires>Date.now()&&expires<=Date.now()+7*86400000);
  assert(Array.isArray(config.invites)&&config.invites.length>0&&config.invites.length<=40);
  assert(new Set(config.invites.map(i=>i.id)).size===config.invites.length);
  for(const i of config.invites){assert(/^[a-f0-9]{64}$/.test(i.code_hash));assert(i.name&&typeof i.reviewer==='boolean');if(!i.reviewer){const a=config.accounts[i.account];assert(a&&/^http:\/\/127\.0\.0\.1:\d+\/api\/v1$/.test(a.base_url));assert(a.bearer_token&&a.party_id);}}
  const store=openStore(config.data_dir),sessions=new Map(),limits=new Map();
  function limited(key,max){const now=Math.floor(Date.now()/60000);const old=limits.get(key);const n=old?.minute===now?old.count+1:1;limits.set(key,{minute:now,count:n});if(n>max)throw fault(429,'操作频繁，请稍后再试。');}
  const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','SAMEORIGIN');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; frame-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'");
    try{
      if(req.headers.host!==origin.host)throw fault(403,'访问地址不匹配');
      if(Date.now()>=expires||!current())throw fault(503,'本轮测试已结束或资料已失效，请联系测试负责人。');
      if(!req.url.startsWith('/')||req.url.startsWith('//')||/[\\%]/.test(req.url.split('?')[0])||req.url.split('?')[0].split('/').some(s=>s==='.'||s==='..'))throw fault(404,'地址不存在');
      const u=new URL(req.url,config.origin),p=u.pathname;
      const mutating=!['GET','HEAD'].includes(req.method);
      if((mutating&&req.headers.origin!==config.origin)||(req.headers.origin&&req.headers.origin!==config.origin)||req.headers['sec-fetch-site']==='cross-site')throw fault(403,'仅允许本测试页面提交');
      if(req.method==='GET'&&['/','/__test/client.js','/__test/style.css'].includes(p)){
        const f=p==='/'?'index.html':p.split('/').pop();res.setHeader('Content-Type',f.endsWith('html')?'text/html; charset=utf-8':f.endsWith('js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8');return res.end(fs.readFileSync(path.join(ui,f)));
      }
      if(req.method==='POST'&&p==='/__test/login'){
        limited('login',30);const b=await body(req,4096);const code=typeof b.code==='string'?b.code:'';const who=config.invites.find(i=>i.code_hash===sha(code));if(!who)throw fault(401,'邀请码无效');
        if(sessions.size>=200)throw fault(429,'会话已达上限，请联系测试负责人');
        const sid=crypto.randomBytes(32).toString('hex'),alias=crypto.randomBytes(32).toString('hex');sessions.set(sid,{actor:who,alias});
        res.setHeader('Set-Cookie',`jx_test=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor((expires-Date.now())/1000)}${origin.protocol==='https:'?'; Secure':''}`);return json(res,200,{ok:true});
      }
      const sid=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('jx_test='))?.slice(8),session=sessions.get(sid);
      if(!session)throw fault(401,'请先输入专属测试邀请码');const actor=session.actor;limited(actor.id,300);
      if(req.method==='POST'&&p==='/__test/logout'){sessions.delete(sid);res.setHeader('Set-Cookie','jx_test=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json(res,200,{ok:true});}
      if(req.method==='GET'&&p==='/__test/me')return json(res,200,{id:actor.id,name:actor.name,reviewer:actor.reviewer,version:config.version,expires_at:config.expires_at,routes:actor.reviewer?[]:config.routes.filter(r=>r.accounts.includes(actor.account)).map(({accounts,...r})=>r)});
      if(req.method==='GET'&&p==='/__test/bootstrap'){
        if(actor.reviewer)throw fault(403,'问题处理身份没有业务操作权限');const a=config.accounts[actor.account];
        return json(res,200,{synthetic_only:true,version:config.version,expires_at:config.expires_at,base_url:config.origin+'/api/v1',bearer_token:session.alias,account_id:a.account_id,party_id:a.party_id,role:a.label||actor.account});
      }
      if(req.method==='GET'&&p==='/__test/issues')return json(res,200,store.list(actor));
      if(req.method==='GET'&&p==='/__test/export')return json(res,200,store.export(actor));
      if(req.method==='POST'&&p==='/__test/issues'){
        const b=await body(req);if(!['BUG','CONFUSING','REQUIREMENT','SUGGESTION'].includes(b.category))throw fault(400,'请选择问题类型');
        if(b.image&&b.image_confirmed!==true)throw fault(400,'请先确认截图内容');
        const payload={category:b.category,description:text(b.description,3,3000),expected:text(b.expected,0,2000),context:{route:safeRoute(b.context?.route||'/'),reference:text(b.context?.reference||'',0,100),scenario:config.routes.find(r=>r.id===b.context?.scenario&&r.accounts.includes(actor.account))?.id||null,version:config.version,role:config.accounts[actor.account]?.label||'测试负责人',device:text(b.context?.device||'',0,160)},image:image(b.image)};
        return json(res,201,store.create(actor,req.headers['idempotency-key'],payload));
      }
      let match=/^\/__test\/issues\/([a-f0-9-]{36})(\/image)?$/.exec(p);
      if(match&&req.method==='GET'&&match[2]){const im=store.image(actor,match[1]);res.setHeader('Content-Type',im.type);res.setHeader('Content-Disposition','attachment; filename="feedback-image.'+(im.type.endsWith('png')?'png':'jpg')+'"');return res.end(Buffer.from(im.data,'base64'));}
      if(match&&!match[2]&&req.method==='PATCH'){const b=await body(req,8192),v=Number((req.headers['if-match']||'').replaceAll('"',''));if(!Number.isSafeInteger(v)||v<1)throw fault(400,'缺少问题版本');return json(res,200,store.update(actor,match[1],v,{status:b.status,note:text(b.note,2,2000)}));}
      if(p==='/__test/results'&&req.method==='POST'){
        const b=await body(req,8192);if(!config.routes.some(r=>r.id===b.scenario&&r.accounts.includes(actor.account))||!['PASSED','BLOCKED','NEEDS_CHANGE'].includes(b.outcome))throw fault(400,'请选择本账号可测流程和结果');
        return json(res,201,store.result(actor,req.headers['idempotency-key'],{scenario:b.scenario,scenario_title:config.routes.find(r=>r.id===b.scenario).title,outcome:b.outcome,note:text(b.note||'',b.outcome==='PASSED'?0:2,2000),version:config.version}));
      }
      if(p.startsWith('/api/v1/')){
        if(actor.reviewer||p.startsWith('/api/v1/auth/')||p==='/api/v1/auth'||!['GET','POST','PATCH','DELETE','PUT','HEAD'].includes(req.method))throw fault(403,'此测试入口不开放该操作');
        if(req.headers.authorization!=='Bearer '+session.alias)throw fault(401,'业务会话已失效');const a=config.accounts[actor.account];
        if(req.headers['x-acting-party']&&req.headers['x-acting-party']!==a.party_id)throw fault(403,'此邀请仅用于指定测试身份，请用对应邀请进入其他身份');
        let chunks=[],size=0;for await(const c of req){size+=c.length;if(size>16*1024*1024)throw fault(413,'测试文件请小于16MB');chunks.push(c);}
        const headers={authorization:'Bearer '+a.bearer_token};for(const h of ['content-type','if-match','idempotency-key','range','x-acting-party'])if(req.headers[h])headers[h]=req.headers[h];
        const upstream=new URL(a.base_url);const out=http.request({hostname:'127.0.0.1',port:upstream.port,path:req.url,method:req.method,headers},incoming=>{
          if(incoming.statusCode>=300&&incoming.statusCode<400){incoming.resume();return json(res,502,{message:'测试服务不接受外部跳转'});}
          for(const h of ['content-type','content-disposition','content-range','accept-ranges','etag','retry-after'])if(incoming.headers[h])res.setHeader(h,incoming.headers[h]);res.writeHead(incoming.statusCode);incoming.on('error',()=>res.destroy());incoming.pipe(res);
        });out.setTimeout(20000,()=>out.destroy());out.on('error',()=>{if(!res.headersSent)json(res,502,{message:'隔离业务服务暂不可用'});else res.destroy();});res.on('close',()=>out.destroy());out.end(Buffer.concat(chunks));return;
      }
      if(req.method==='GET'&&(['/__test/bridge.js','/__test/workspace-bootstrap.js'].includes(p))){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(ui,p.split('/').pop())));}
      if(['GET','HEAD'].includes(req.method)&&(p.startsWith('/app/')||p.startsWith('/workspace/'))){
        if(actor.reviewer)throw fault(403,'请使用业务测试邀请');const kind=p.startsWith('/app/')?'app':'workspace';const dir=config.builds[kind];if(!dir)throw fault(503,'此端尚未准备');
        const relative=p.slice(kind==='app'?5:11);if(relative.split('/').some(s=>s.startsWith('.'))||/\.(map|json)$/i.test(relative)&&!['manifest.json','version.json','assets/FontManifest.json','assets/AssetManifest.json','assets/AssetManifest.bin.json'].includes(relative))throw fault(404,'文件未开放');
        let file=path.resolve(dir,relative||'index.html');const root=fs.realpathSync(dir);
        if(!fs.existsSync(file)){if(!path.extname(relative))file=path.join(dir,'index.html');else throw fault(404,'文件不存在');}
        const real=fs.realpathSync(file);if(!real.startsWith(root+path.sep)||!fs.statSync(real).isFile())throw fault(404,'文件未开放');
        const ext=path.extname(file),types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.ttf':'font/ttf','.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.bin':'application/octet-stream'};
        res.setHeader('Content-Type',types[ext]||'application/octet-stream');if(['.ttf','.woff2','.woff'].includes(ext))res.setHeader('Cache-Control','private, max-age=86400');if(req.method==='HEAD')return res.end();
        if(ext==='.html'){let html=fs.readFileSync(file,'utf8');if(kind==='workspace')html=html.replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/,(_,entry)=>`<script type="module" src="/__test/workspace-bootstrap.js" data-test-entry="${entry}"></script>`);return res.end(html.replace('</head>','<script src="/__test/bridge.js"></script></head>'));}
        return fs.createReadStream(file).pipe(res);
      }
      throw fault(404,'地址不存在');
    }catch(e){if(!res.headersSent)json(res,e.status||500,{message:e.status?e.message:'测试服务处理失败，请保留原页面联系负责人'});else res.destroy();}
  });
  server.requestTimeout=30000;server.headersTimeout=10000;server.on('close',()=>store.close());
  return server;
}
module.exports={createPortal,safeRoute};
if(require.main===module){
  (async()=>{const file=path.resolve(process.argv[2]||'');assert(file.includes(path.sep+'.local'+path.sep));const config=JSON.parse(fs.readFileSync(file,'utf8'));assert(config.fixture_files?.length||config.review_only===true);if(config.review_only)assert(config.invites.every(i=>i.reviewer)&&Object.keys(config.accounts).length===0&&config.routes.length===0);const workspace=fs.realpathSync(path.resolve(__dirname,'../..','.local'));
    const dataParent=fs.realpathSync(path.dirname(config.data_dir));assert(dataParent===workspace||dataParent.startsWith(workspace+path.sep));
    if(!config.review_only){const source=path.resolve(__dirname,'../../晶晶日上工程交接包/01_源码');for(const [kind,folder]of Object.entries({app:'frontend_jingjingshangri_app',workspace:'frontend_ops_workspace'}))assert(fs.realpathSync(config.builds[kind])===fs.realpathSync(path.join(source,folder,'.local/client-web')));}
    const allowedAccounts=[],proofs=[];
    for(const input of config.fixture_files){const p=fs.realpathSync(input);assert(p.startsWith(workspace+path.sep)&&path.basename(p)==='access.json');const name=path.basename(path.dirname(p));assert(/^jx_test_(story|artists|delivery|r05r12)_\d+_[0-9a-f]{12}$/.test(name));const stateFile=path.join(path.dirname(p),'status.json'),state=JSON.parse(fs.readFileSync(stateFile)),fixture=JSON.parse(fs.readFileSync(p));assert(state.status==='RUNNING'&&state.synthetic_only===true&&fixture.synthetic_only===true&&state.database===name);assert(fixture.base_url===`http://127.0.0.1:${state.port}/api/v1`);assert(Date.parse(config.expires_at)<=fs.statSync(stateFile).mtimeMs+state.expires_in_minutes*60000);for(const a of Object.values(fixture.accounts))allowedAccounts.push({...a,base_url:fixture.base_url});proofs.push({p,hash:sha(fs.readFileSync(p))},{p:stateFile,hash:sha(fs.readFileSync(stateFile))});}
    for(const a of Object.values(config.accounts))assert(allowedAccounts.some(x=>['base_url','account_id','party_id','bearer_token'].every(k=>a[k]===x[k])));
    for(const a of Object.values(config.accounts)){const r=await fetch(a.base_url+'/me',{headers:{Authorization:'Bearer '+a.bearer_token},signal:AbortSignal.timeout(5000)});const b=await r.json();assert(r.ok&&b.data.id===a.account_id);}
    const server=createPortal(config,{current:()=>proofs.every(v=>{try{return sha(fs.readFileSync(v.p))===v.hash;}catch{return false;}})});
    server.listen(config.port,'127.0.0.1',()=>console.log(JSON.stringify({local:true,port:config.port,version:config.version,expires_at:config.expires_at})));
    const stop=()=>{server.closeAllConnections();server.close();};const stopFile=path.join(path.dirname(file),'stop');const watcher=setInterval(()=>{if(fs.existsSync(stopFile))stop();},500);watcher.unref();server.on('close',()=>clearInterval(watcher));setTimeout(stop,Date.parse(config.expires_at)-Date.now()).unref();process.on('SIGINT',stop);process.on('SIGTERM',stop);
  })().catch(()=>{console.error('无法启动：请核对隔离资料、配置、记录目录锁和有效期。私有配置不会输出。');process.exitCode=1;});
}
