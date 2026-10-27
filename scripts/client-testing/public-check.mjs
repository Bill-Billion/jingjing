// Explicitly authorized synthetic HTTPS deployment check. Does not send SMS or pay.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const root=resolve('.'),session=resolve(process.env.CLIENT_TEST_SESSION||'');
assert(session.startsWith(resolve('.local')+sep));
const config=JSON.parse(await readFile(resolve(session,'config.json'),'utf8'));
const invites=JSON.parse(await readFile(resolve(session,'invitations.json'),'utf8'));
const base=config.origin,u=new URL(base);
assert.equal(process.env.CLIENT_TEST_PUBLIC_ORIGIN,base);
assert.equal(config.synthetic_only,true);assert.equal(config.port,3490);
assert.equal(u.protocol,'https:');assert(/^[a-z0-9-]+\.trycloudflare\.com$/.test(u.hostname));assert(Date.parse(config.expires_at)>Date.now());
const require=createRequire(resolve('晶晶日上工程交接包/01_源码/frontend_ops_workspace/package.json'));
const {request}=require('playwright-core');const checks=[],contexts=[];
async function client(){const c=await request.newContext({baseURL:base,extraHTTPHeaders:{Origin:base},timeout:30000});contexts.push(c);return c;}
async function status(c,p,expected,options){const r=await c.get(p,options);assert.equal(r.status(),expected,p);return r;}
async function login(c,role){const r=await c.post('/__test/login',{data:{code:invites.invites.find(i=>i.account===role).code}});assert.equal(r.status(),200);return r;}
let failure;
try{
 const c=await client();await status(c,'/',200);checks.push('公网HTTPS首页可访问');
 for(const p of ['/__test/bootstrap','/__test/issues','/app/','/workspace/','/.local/client-public-connected-20261026/config.json'])await status(c,p,401);
 checks.push('未邀请访问不能读取业务页面、反馈或私有文件');
 const logged=await login(c,'story-buyer');const cookie=logged.headers()['set-cookie'];assert(cookie.includes('Secure')&&cookie.includes('HttpOnly')&&cookie.includes('SameSite=Strict'));checks.push('公网登录使用HTTPS专属、脚本不可读的会话Cookie');
 const b=await(await status(c,'/__test/bootstrap',200)).json();const auth={Authorization:'Bearer '+b.bearer_token,'X-Acting-Party':b.party_id};
 const me=await(await status(c,'/api/v1/me',200,{headers:auth})).json();assert.equal(me.data.id,config.accounts['story-buyer'].account_id);checks.push('邀请绑定原模拟账号，公网读取本人资料正常');
 await status(c,'/api/v1/me',401);checks.push('业务请求缺少会话凭据时拒绝');
 await status(c,'/api/v1/me',403,{headers:{...auth,'X-Acting-Party':'00000000-0000-4000-8000-000000000000'}});checks.push('不能通过改身份参数冒用其他角色');
 const sms=await c.post('/api/v1/auth/sms/send',{headers:auth,data:{}});assert.equal(sms.status(),403);checks.push('短信与正式登录接口没有公开');
 for(const p of ['/.local/client-public-connected-20261026/config.json','/app/.env','/app/main.dart.js.map','/api/v1/nonexistent-route'])await status(c,p,[ '/api/v1/nonexistent-route' ].includes(p)?403:404,{headers:auth});
 checks.push('私有配置、源码映射与未开放业务路径拒绝访问');
 const csrf=await c.post('/__test/issues',{headers:{Origin:'https://example.invalid'},data:{}});assert.equal(csrf.status(),403);checks.push('外站不能借用登录身份写入反馈');
 const reviewer=await client();await login(reviewer,'feedback-reviewer');await status(reviewer,'/__test/issues',200);await status(reviewer,'/__test/bootstrap',403);await status(reviewer,'/app/',403);checks.push('问题负责人可看反馈但没有业务权限');
 if(config.accounts['artists-artist']){
 const a=JSON.parse(await readFile(config.fixture_files.find(f=>f.includes('jx_test_artists_')),'utf8'));
 const merchant=await client();await login(merchant,'story-merchant');const mb=await(await status(merchant,'/__test/bootstrap',200)).json();
 const story=JSON.parse(await readFile(config.fixture_files.find(f=>f.includes('jx_test_story_')),'utf8'));assert.equal(mb.party_id,story.trade.merchant_party_id);
 const quotes=await(await status(merchant,'/api/v1/trade/records?kind=QUOTE&limit=20',200,{headers:{Authorization:'Bearer '+mb.bearer_token,'X-Acting-Party':mb.party_id}})).json();assert(quotes.data.items.some(q=>q.id===story.trade.quote_id));checks.push('平台报价邀请绑定机构并读取原报价，不用个人身份代替');
 const owner=await client();await login(owner,'artists-artist');const ob=await(await status(owner,'/__test/bootstrap',200)).json();const oh={Authorization:'Bearer '+ob.bearer_token,'X-Acting-Party':ob.party_id};
 const image=await status(owner,'/api/v1/artists/assets/'+a.material_id+'/content',200,{headers:oh});assert.equal((await image.body())[0],137);checks.push('本人可经公网读取保留的模拟附件');
 const agency=await client();await login(agency,'artists-agency');const ab=await(await status(agency,'/__test/bootstrap',200)).json();assert.equal(ab.party_id,a.agency_party_id);const ah={Authorization:'Bearer '+ab.bearer_token,'X-Acting-Party':ab.party_id};await status(agency,'/api/v1/artists/people/'+a.person_id,200,{headers:ah});await status(agency,'/api/v1/artists/people/'+a.person_id,403,{headers:{...ah,'X-Acting-Party':ob.party_id}});checks.push('机构按受托关系访问，同一邀请不能改成本人身份');
 const pending=await owner.post('/api/v1/artists/people/'+a.person_id+'/consents',{headers:{...oh,'Idempotency-Key':'public-artist-consent-'+config.version},data:{avatar_id:a.avatar_id,consent:{features:['FACE'],purposes:['PRIVATE_ARCHIVE'],grantee_party_id:ob.party_id,territories:['CN'],valid_from:new Date(Date.parse(config.expires_at)-72*3600000).toISOString(),valid_until:config.expires_at,terms:'公网模拟授权待独立审核；没有真实肖像或授权效力。',evidence_asset_ids:[a.evidence_id]}}});assert.equal(pending.status(),200);const pid=(await pending.json()).data.id;
 const ar=await client();await login(ar,'artists-reviewer');const rb=await(await status(ar,'/__test/bootstrap',200)).json();const inbox=await(await status(ar,'/api/v1/artists/reviews?kind=CONSENT',200,{headers:{Authorization:'Bearer '+rb.bearer_token}})).json();assert(inbox.data.items.some(x=>x.id===pid));checks.push('本人提交的同意记录进入独立审核人待办，未自动批准');
 }
 const logout=await c.post('/__test/logout',{data:{}});assert.equal(logout.status(),200);await status(c,'/__test/bootstrap',401);checks.push('退出后旧会话不可继续使用');
}catch(e){failure=e.message;process.exitCode=1;}finally{
 await Promise.all(contexts.map(c=>c.dispose()));
 const out=resolve(process.env.CLIENT_TEST_EVIDENCE||'docs/testing/evidence/client-local-hosting-20261026');await mkdir(out,{recursive:true});
 await writeFile(resolve(out,'PUBLIC_HTTPS.json'),JSON.stringify({result:failure?'FAIL':'PASS',checked_at:new Date().toISOString(),checks,failure,scope:'Public HTTPS via this machine; not client mobile network or all business acceptance.'},null,2)+'\n');
 console.log(JSON.stringify({result:failure?'FAIL':'PASS',checks:checks.length,failure}));
}
