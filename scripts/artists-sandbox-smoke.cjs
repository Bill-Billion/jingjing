"use strict";
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'..');
require(path.join(root,'晶晶日上工程交接包/01_源码/backend_server/scripts/test-network-guard.cjs'));
async function main(){
 if(process.argv.length!==3)throw Error('Usage: node scripts/artists-sandbox-smoke.cjs .local/artists-sandbox/<instance>');
 const dir=path.resolve(root,process.argv[2]),parent=path.join(root,'.local/artists-sandbox'),relative=path.relative(parent,dir);
 if(!/^jx_test_artists_[0-9]+_[a-f0-9]{12}$/.test(relative)||path.dirname(dir)!==parent)throw Error('Only a generated artist sandbox directory is allowed');
 const a=JSON.parse(await fs.readFile(path.join(dir,'access.json'),'utf8')),url=new URL(a.base_url);assert.equal(a.synthetic_only,true);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.protocol,'http:');assert.equal(url.pathname,'/api/v1');
 const results=[];
 async function request(method,route,role='artist',body,party=a.accounts[role].party_id,version){const res=await fetch(a.base_url+route,{method,headers:{Authorization:'Bearer '+a.accounts[role].bearer_token,...(party?{'X-Acting-Party':party}:{}),...(body===undefined?{}:{'Content-Type':'application/json','Idempotency-Key':randomUUID()}),...(version?{'If-Match':'"'+version+'"'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:res.status,json:await res.json()};}
 const check=(name,condition)=>{assert.ok(condition,name);results.push(name);};
 try{
 let r=await request('GET','/artists/services','artist',undefined,null);check('外部实名未启用但合成商品可查看',r.status===200&&r.json.data.identity.current_status==='NOT_ENABLED'&&r.json.data.offers.items.length===3);
 r=await request('GET','/artists/people/'+a.person_id);check('本人可找回真人和数字人',r.status===200&&r.json.data.avatars.some(x=>x.id===a.avatar_id));
 r=await request('GET','/artists/people','agency',undefined,a.agency_party_id);check('机构看到实际获托艺人',r.status===200&&r.json.data.items.some(x=>x.id===a.person_id));
 r=await request('GET','/artists/people/'+a.person_id,'outsider');check('无关用户不能读取私有档案',r.status===404);
 r=await request('GET','/artists/assets/'+a.evidence_id,'agency',undefined,a.agency_party_id);check('机构管理权限不包含本人证据文件',r.status===403);
 r=await request('GET','/artists/catalog','outsider',undefined,null);check('已审核并有授权托管的资料可见',r.status===200&&r.json.data.items.length===1);
 r=await request('GET','/artists/catalog?audition=true','outsider',undefined,null);check('关闭试镜展示不误删一般公开资料',r.status===200&&r.json.data.items.length===0);
 r=await request('POST','/artists/people/'+a.accounts.minor.person_id+'/avatars','minor',{display_name:'blocked child'});check('儿童实际处理已按决定关闭',r.status===409&&r.json.error.code==='MINOR_OPERATION_RESTRICTED');
 r=await request('POST','/artists/people/'+a.person_id+'/identity','artist',{session_ref:'synthetic:not-enabled'});check('未接通实名服务不能假核验',r.status===503);
 r=await request('POST','/artists/people/'+a.person_id+'/services','artist',{avatar_id:a.avatar_id,spec_id:a.specs.AVATAR_CREATION,renewal_reminder:false});check('创建服务绑定本人和具体数字人',r.status===200&&r.json.data.current_status==='REQUESTED');const service=r.json.data;
 r=await request('POST','/artists/people/'+a.person_id+'/services/'+service.id+'/sync','artist',{});check('未付款服务不假交付',r.status===200&&r.json.data.current_status==='REQUESTED');
 r=await request('POST','/trade/payments','artist',{order_id:randomUUID(),installment_key:'all'});check('联调实例不开放付款接口',r.status===403&&r.json.error.code==='LOCAL_FIXTURE_ROUTE_DISABLED');
 r=await request('GET','/artists/people/'+a.person_id+'/records/'+a.delegation_id);const delegation=r.json.data;
 r=await request('POST','/artists/people/'+a.person_id+'/records/'+a.delegation_id+'/withdrawals','artist',{reason:'合成测试结束委托'},undefined,delegation.object_version);check('本人撤回机构委托',r.status===200);
 r=await request('GET','/artists/people/'+a.person_id,'agency',undefined,a.agency_party_id);check('撤回后机构立即失去新操作权限',r.status===403);
 r=await request('GET','/artists/people/'+a.person_id+'/records/'+a.consent_id);const consent=r.json.data;
 r=await request('POST','/artists/people/'+a.person_id+'/records/'+a.consent_id+'/withdrawals','artist',{reason:'合成测试结束公开授权'},undefined,consent.object_version);check('本人撤回公开使用同意',r.status===200);
 r=await request('GET','/artists/catalog','outsider',undefined,null);check('撤回后公开目录立即隐藏',r.status===200&&r.json.data.items.length===0);
 r=await request('GET','/artists/assets/'+a.material_id);check('旧文件保留本人可读',r.status===200);
 await fs.writeFile(path.join(dir,'smoke.json'),JSON.stringify({status:'PASS',synthetic_only:true,checks:results.length,results,not_tested:['浏览器页面','手机安装包','真实实名支付与建模']},null,2));console.log(JSON.stringify({status:'PASS',checks:results.length,synthetic_only:true}));
 }finally{await fs.writeFile(path.join(dir,'stop'),'stop\n');}
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
