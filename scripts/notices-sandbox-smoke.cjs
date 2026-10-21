"use strict";
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'..');require(path.join(root,'晶晶日上工程交接包/01_源码/backend_server/scripts/test-network-guard.cjs'));
async function main(){
 if(process.argv.length!==3)throw Error('Usage: node scripts/notices-sandbox-smoke.cjs .local/notices-sandbox/<instance>');const dir=path.resolve(root,process.argv[2]),parent=path.join(root,'.local/notices-sandbox');if(path.dirname(dir)!==parent||!/^jx_test_notices_[0-9]+_[a-f0-9]{12}$/.test(path.basename(dir)))throw Error('Only a generated notices sandbox is allowed');
 const a=JSON.parse(await fs.readFile(path.join(dir,'access.json'),'utf8')),url=new URL(a.base_url);assert.equal(a.synthetic_only,true);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.protocol,'http:');assert.equal(url.pathname,'/api/v1');const results=[];
 const check=(name,ok)=>{assert.ok(ok,name);results.push(name);};
 async function call(method,route,role='buyer',body,version,party=a.accounts[role].party_id){const r=await fetch(a.base_url+route,{method,headers:{Authorization:'Bearer '+a.accounts[role].bearer_token,...(party?{'X-Acting-Party':party}:{}),...(body===undefined?{}:{'Content-Type':'application/json','Idempotency-Key':randomUUID()}),...(version?{'If-Match':'"'+version+'"'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,json:(r.headers.get('content-type')||'').includes('application/json')?await r.json():null};}

 const get=(id,role='buyer')=>call('GET','/notices/records/'+id,role),s=a.scenarios;
 try{
 let r=await call('GET','/notices/catalog','buyer',undefined,undefined,null);check('能找到审核通过的通告',r.status===200&&r.json.data.items.some(x=>x.id===s.published.notice_id));
 r=await get(s.pending_review.submission_id);check('收件人看不到尚未审核的投稿',r.status===404);
 r=await get(s.pending_review.submission_id,'seller');check('投递人能查看待审核状态',r.status===200&&r.json.data.next_action==='WAIT_REVIEW');
 r=await get(s.sent.submission_id);check('已审投稿等待接收方决定',r.status===200&&r.json.data.next_action==='WAIT_RECIPIENT');
 r=await get(s.declined.submission_id);check('婉拒不生成订单',r.status===200&&r.json.data.current_status==='DECLINED'&&r.json.data.order_id===null);
 r=await get(s.interested.case_id);check('感兴趣只转入客服待办',r.status===200&&r.json.data.next_action==='WAIT_SUPPORT'&&r.json.data.chat_enabled===false);
 r=await get(s.withdrawn.submission_id);check('撤回结果可查',r.status===200&&r.json.data.current_status==='WITHDRAWN');
 r=await get(s.expired.submission_id);check('过期显示明确原因',r.status===200&&r.json.data.next_action==='EXPIRED');
 r=await get(s.quoted.case_id);check('关联报价仍需买家确认',r.status===200&&r.json.data.next_action==='CONFIRM_QUOTE'&&r.json.data.order_id===null);
 r=await get(s.sent.submission_id,'outsider');check('无关主体不能读取投稿',r.status===404);
 r=await call('GET','/operations/notifications','buyer');check('投稿相关通知进入既有消息中心',r.status===200&&r.json.data.items.some(x=>x.domain==='NOTICES'));
 r=await call('POST','/trade/payments','buyer',{order_id:s.quoted.quote_id});check('联调入口不开放真实付款',r.status===403&&r.json.error.code==='LOCAL_FIXTURE_ROUTE_DISABLED');
 await fs.writeFile(path.join(dir,'smoke.json'),JSON.stringify({status:'PASS',synthetic_only:true,checks:results.length,results,limits:['无页面或真机验收','全部资格与投稿为合成材料','无真实收退款、实名或OSS']},null,2));console.log(JSON.stringify({status:'PASS',checks:results.length,synthetic_only:true}));
 }finally{await fs.writeFile(path.join(dir,'stop'),'stop\n');}
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
