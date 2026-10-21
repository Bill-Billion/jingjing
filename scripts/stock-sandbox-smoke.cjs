"use strict";
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'..');require(path.join(root,'晶晶日上工程交接包/01_源码/backend_server/scripts/test-network-guard.cjs'));
async function main(){
 if(process.argv.length!==3)throw Error('Usage: node scripts/stock-sandbox-smoke.cjs .local/stock-sandbox/<instance>');const dir=path.resolve(root,process.argv[2]),parent=path.join(root,'.local/stock-sandbox');if(path.dirname(dir)!==parent||!/^jx_test_stock_[0-9]+_[a-f0-9]{12}$/.test(path.basename(dir)))throw Error('Only a generated stock sandbox is allowed');
 const a=JSON.parse(await fs.readFile(path.join(dir,'access.json'),'utf8')),url=new URL(a.base_url);assert.equal(a.synthetic_only,true);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.protocol,'http:');assert.equal(url.pathname,'/api/v1');const results=[];
 const check=(name,ok)=>{assert.ok(ok,name);results.push(name);};
 async function call(method,route,role='buyer',body,version,party=a.accounts[role].party_id){const r=await fetch(a.base_url+route,{method,headers:{Authorization:'Bearer '+a.accounts[role].bearer_token,...(party?{'X-Acting-Party':party}:{}),...(body===undefined?{}:{'Content-Type':'application/json','Idempotency-Key':randomUUID()}),...(version?{'If-Match':'"'+version+'"'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,json:(r.headers.get('content-type')||'').includes('application/json')?await r.json():null};}
 const get=id=>call('GET','/stock/purchases/'+id),s=a.scenarios;
 try{
 let r=await call('GET','/stock/purchases');check('买家能找到五类合成订单',r.status===200&&r.json.data.items.length===5);
 r=await get(s.unpaid.order_id);check('未付款不发放许可',r.json.data.data.status==='AWAITING_PAYMENT');r=await call('GET','/stock/purchases/'+s.unpaid.order_id+'/content');check('未付款不能下载',r.status===409);
 r=await get(s.paid.order_id);let p=r.json.data;check('付款核实后发个人非商用许可',p.data.status==='ACTIVE'&&p.data.license.scope==='PERSONAL_NONCOMMERCIAL');check('仅付款不开始验收计时',p.data.deadline_at===null);
 r=await call('GET','/stock/purchases/'+s.paid.order_id+'/content','outsider');check('无关用户不能下载',r.status===404);
 r=await call('GET','/stock/purchases/'+s.unlisted.order_id+'/content');check('普通下架后已购用户仍可下载',r.status===200);
 r=await call('GET','/stock/purchases/'+s.dispute.order_id+'/content');check('售后争议时暂停下载',r.status===409);
 r=await get(s.refunded.order_id);check('核实全额退款后撤销许可',r.json.data.data.status==='REVOKED');r=await call('GET','/stock/purchases/'+s.refunded.order_id+'/content');check('退款后不能下载',r.status===409);
 r=await call('GET','/stock/catalog/'+s.pending_review.listing_id,'buyer',undefined,undefined,null);check('未审核视频不能公开销售',r.status===409);
 r=await call('GET','/stock/purchases/'+s.paid.order_id+'/content');check('已付款用户能取得合成文件',r.status===200);r=await call('POST','/operations/notifications/'+p.data.notification_event_id+'/read','buyer',{});check('买家能确认收到交付通知',r.status===200);
 p=(await get(s.paid.order_id)).json.data;r=await call('POST','/stock/purchases/'+s.paid.order_id+'/receipt','buyer',{},p.object_version);check('取到文件且收到通知后起算',r.status===200&&!!r.json.data.data.deadline_at);
 p=r.json.data;r=await call('POST','/stock/purchases/'+s.paid.order_id+'/cases','buyer',{kind:'EXTENSION',reason:'合成延期测试'},p.object_version);check('延期申请暂停验收',r.status===200&&r.json.data.data.deadline_at===null);
 r=await call('POST','/trade/payments','buyer',{order_id:s.unpaid.order_id,installment_key:'stock'});check('联调入口不开放真实付款',r.status===403&&r.json.error.code==='LOCAL_FIXTURE_ROUTE_DISABLED');
 await fs.writeFile(path.join(dir,'smoke.json'),JSON.stringify({status:'PASS',synthetic_only:true,checks:results.length,results,limits:['无页面或真机验收','合成字节不能播放，不证明真实水印','无真实收退款、实名或OSS']},null,2));console.log(JSON.stringify({status:'PASS',checks:results.length,synthetic_only:true}));
 }finally{await fs.writeFile(path.join(dir,'stop'),'stop\n');}
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
