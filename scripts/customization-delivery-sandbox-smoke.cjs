"use strict";
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'..');require(path.join(root,'晶晶日上工程交接包/01_源码/backend_server/scripts/test-network-guard.cjs'));
async function main(){
 if(process.argv.length!==3)throw Error('Usage: node scripts/customization-delivery-sandbox-smoke.cjs .local/customization-delivery-sandbox/<instance>');const dir=path.resolve(root,process.argv[2]),parent=path.join(root,'.local/customization-delivery-sandbox');if(path.dirname(dir)!==parent||!/^jx_test_delivery_[0-9]+_[a-f0-9]{12}$/.test(path.basename(dir)))throw Error('Only a generated delivery sandbox is allowed');
 const a=JSON.parse(await fs.readFile(path.join(dir,'access.json'),'utf8')),url=new URL(a.base_url);assert.equal(a.synthetic_only,true);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.protocol,'http:');assert.equal(url.pathname,'/api/v1');const results=[];
 const check=(name,ok)=>{assert.ok(ok,name);results.push(name);};
 async function call(method,route,role='buyer',body,version,party=a.accounts[role].party_id){const r=await fetch(a.base_url+route,{method,headers:{Authorization:'Bearer '+a.accounts[role].bearer_token,...(party?{'X-Acting-Party':party}:{}),...(body===undefined?{}:{'Content-Type':'application/json','Idempotency-Key':randomUUID()}),...(version?{'If-Match':'"'+version+'"'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,json:(r.headers.get('content-type')||'').includes('application/json')?await r.json():null};}
 const flow=id=>call('GET','/production/projects/'+id+'/fulfillment'),s=a.scenarios;
 try{
 let r=await call('GET','/production/projects');check('买家能从列表找到六种合成定制订单',r.status===200&&r.json.data.items.length===6);
 r=await flow(s.unpaid.project_id);check('未付款订单仍待开工',r.json.data.state==='PLANNED');r=await call('POST','/production/projects/'+s.unpaid.project_id+'/start','producer',{},r.json.data.object_version);check('未付款不能开工',r.status===409&&r.json.error.code==='PRODUCTION_PAYMENT_REQUIRED');
 r=await call('GET','/production/projects/'+s.started.project_id+'/story','producer');check('平台受派人读取本订单故事',r.status===200&&!!r.json.data.answers.story);r=await call('GET','/production/projects/'+s.started.project_id+'/story','outsider');check('无关用户不能读取私人故事',r.status===404);
 r=await flow(s.started.project_id);let d=r.json.data;check('仅有正式交稿不自动起算',d.receipt.started_at===null);const v=d.receipt.version_id;
 r=await call('POST','/production/projects/'+s.started.project_id+'/delivery-receipt','buyer',{},d.object_version);check('未实际查看不能确认收件',r.status===409&&r.json.error.code==='CUSTOMIZATION_PREVIEW_NOT_VIEWED');
 r=await call('GET','/production/versions/'+v+'/content?variant=preview');check('买家能查看已审核正式版本',r.status===200);r=await call('POST','/operations/notifications/'+d.receipt.notification_event_id+'/read','buyer',{});check('原正式版本通知可以确认收到',r.status===200);
 d=(await flow(s.started.project_id)).json.data;r=await call('POST','/production/projects/'+s.started.project_id+'/delivery-receipt','buyer',{},d.object_version);check('查看且收到通知后才记录截止时间',r.status===200&&!!r.json.data.receipt.deadline_at);
 r=await call('GET','/production/versions/'+s.preview.version_id+'/content?variant=preview');check('样例采用先预览方案，可查看水印预览占位文件',r.status===200);r=await call('GET','/production/versions/'+s.preview.version_id+'/content?variant=final');check('预览阶段不能取正式文件',r.status===409);
 r=await call('GET','/production/versions/'+s.final_paid.version_id+'/content?variant=final');check('已确认且付清的合成订单可下载',r.status===200);r=await flow(s.final_paid.project_id);check('正式文件开放后有履约结果',r.json.data.state==='DELIVERED');
 r=await flow(s.dispute.project_id);check('权利争议有待处理记录并暂停',r.json.data.state==='PAUSED'&&r.json.data.cases.some(c=>c.current_status==='OPEN'));
 r=await flow(s.performer.project_id);check('真人、数字人、造型和授权版本绑定到本订单',r.status===200&&r.json.data.cast_snapshot.length===1);
 r=await call('POST','/trade/payments','buyer',{order_id:s.unpaid.order_id,installment_key:'first'});check('联调入口不开放实际收付款',r.status===403&&r.json.error.code==='LOCAL_FIXTURE_ROUTE_DISABLED');
 d=(await flow(s.started.project_id)).json.data;r=await call('POST','/production/projects/'+s.started.project_id+'/cases','buyer',{kind:'EXTENSION',reason:'合成延期场景',evidence_asset_ids:[]},d.object_version);check('延期申请暂停当前验收计时',r.status===200&&r.json.data.state==='PAUSED'&&r.json.data.receipt===null);
 await fs.writeFile(path.join(dir,'smoke.json'),JSON.stringify({status:'PASS',synthetic_only:true,checks:results.length,results,limits:['无浏览器或真机验收','视频为不可播放的合成字节，不作视觉验收','没有真实收退款、实名或制作']},null,2));console.log(JSON.stringify({status:'PASS',checks:results.length,synthetic_only:true}));
 }finally{await fs.writeFile(path.join(dir,'stop'),'stop\n');}
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
