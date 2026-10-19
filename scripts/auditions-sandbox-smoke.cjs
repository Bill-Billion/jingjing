"use strict";
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'..');require(path.join(root,'晶晶日上工程交接包/01_源码/backend_server/scripts/test-network-guard.cjs'));
async function main(){
 if(process.argv.length!==3)throw Error('Usage: node scripts/auditions-sandbox-smoke.cjs .local/auditions-sandbox/<instance>');const dir=path.resolve(root,process.argv[2]),parent=path.join(root,'.local/auditions-sandbox');if(path.dirname(dir)!==parent||!/^jx_test_auditions_[0-9]+_[a-f0-9]{12}$/.test(path.basename(dir)))throw Error('Only a generated auditions sandbox is allowed');
 const a=JSON.parse(await fs.readFile(path.join(dir,'access.json'),'utf8')),url=new URL(a.base_url);assert.equal(a.synthetic_only,true);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.protocol,'http:');assert.equal(url.pathname,'/api/v1');const results=[];
 const check=(name,ok)=>{assert.ok(ok,name);results.push(name);};
 async function call(method,route,role='buyer',body,version,party=a.accounts[role].party_id){const r=await fetch(a.base_url+route,{method,headers:{Authorization:'Bearer '+a.accounts[role].bearer_token,...(party?{'X-Acting-Party':party}:{}),...(body===undefined?{}:{'Content-Type':'application/json','Idempotency-Key':randomUUID()}),...(version?{'If-Match':'"'+version+'"'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,json:(r.headers.get('content-type')||'').includes('application/json')?await r.json():null};}

 const get=(id,role='buyer')=>call('GET','/auditions/records/'+id,role),s=a.scenarios;
 try{
 for(const [name,scenario] of Object.entries(s)){
   const r=await get(scenario.booking_id);check(name+'订单状态可读',r.status===200&&r.json.data.current_status===scenario.status);
   check(name+'不泄露联系方式',!Object.hasOwn(r.json.data.data,'contacts'));
 }
 let r=await get(s.accepted.booking_id,'outsider');check('无关账号不可读预约',r.status===403||r.status===404);
 r=await call('GET','/auditions/bookings/'+s.awaiting_acceptance.booking_id+'/contacts');check('未接受不开放联系卡',r.status===409);
 r=await call('POST','/auditions/bookings/'+s.accepted.booking_id+'/messages','buyer',{body:'确认约定时间'});check('已接单可写订单消息',r.status===200);
 r=await call('POST','/auditions/bookings/'+s.fulfilled.booking_id+'/messages','buyer',{body:'不能继续发送'});check('完成后会话只读',r.status===409);
 r=await call('GET','/auditions/bookings/'+s.disputed.booking_id+'/contacts');check('争议冻结联系卡',r.status===409);
 r=await call('POST','/trade/payments','buyer',{order_id:s.accepted.order_id});check('禁止调用真实付款接口',r.status===403&&r.json.error.code==='LOCAL_FIXTURE_ROUTE_DISABLED');
 await fs.writeFile(path.join(dir,'smoke.json'),JSON.stringify({status:'PASS',synthetic_only:true,checks:results.length,results,limits:['无页面或真机验收','全部资格、订单和资料为合成材料；样例文件不可用于媒体播放验收','无真实收退款、实名或OSS']},null,2));console.log(JSON.stringify({status:'PASS',checks:results.length,synthetic_only:true}));
 }finally{await fs.writeFile(path.join(dir,'stop'),'stop\n');}
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
