'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../../..');
require(path.join(root,'晶晶日上工程交接包/01_源码/backend_server/scripts/test-network-guard.cjs'));
async function main(){
  const input=process.argv[2];if(!input)throw Error('Usage: joint-http-check.cjs <this run sandbox directory>');
  const dir=path.resolve(root,input);assert.equal(path.dirname(dir),path.join(root,'.local/plaza-dense-sandbox'));assert.match(path.basename(dir),/^jx_test_plaza_[0-9]+_[a-f0-9]{12}$/);
  const a=JSON.parse(await fs.readFile(path.join(dir,'access.json'),'utf8')),u=new URL(a.base_url);assert.equal(a.synthetic_only,true);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.protocol,'http:');assert.equal(u.pathname,'/api/v1');
  const checks=[],requests=[];const check=(name,pass)=>checks.push({name,status:pass?'PASS':'FAIL'});
  async function get(route,role='stock_buyer',party=false){const user=a.accounts[role];const r=await fetch(a.base_url+route,{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+user.bearer_token,...party?{'X-Acting-Party':user.party_id}:{}}});const bytes=Buffer.from(await r.arrayBuffer()),type=r.headers.get('content-type')||'',json=type.includes('application/json')?JSON.parse(bytes.toString()):null;requests.push({route:route.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/g,'{id}'),role,status:r.status,bytes:bytes.length,content_type:type,error_code:json?.error?.code||null});return {status:r.status,data:json?.data,bytes,type};}
  const city=encodeURIComponent(a.scenarios.city),counts={};
  for(const [domain,minimum]of [['artists',8],['stock',6],['notices',6],['auditions',1]]){const r=await get('/'+domain+'/catalog?city='+city);counts[domain]=r.data?.items.length||0;check(domain+'同一郑州目录真实可读',r.status===200&&counts[domain]>=minimum&&r.data.items.every(x=>(domain==='notices'?x.notice.city:x.city)===a.scenarios.city));}
  for(const item of a.scenarios.artists){const r=await get('/artists/catalog/'+item.listing_id+'/assets/'+item.preview_asset_id+'/content');check('艺人合成PNG '+item.role,r.status===200&&r.bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')));}
  for(let i=0;i<a.scenarios.stock.length;i++){const item=a.scenarios.stock[i],r=await get('/stock/catalog/'+item.listing_id);check('作品详情个人许可 '+(i+1),r.status===200&&r.data.license.scope==='PERSONAL_NONCOMMERCIAL');const p=await get('/stock/catalog/'+item.listing_id+'/preview');check('作品预览为实际MP4 '+(i+1),p.status===200&&p.bytes.toString('ascii',4,8)==='ftyp');}
  for(const item of a.scenarios.notices){const r=await get('/notices/catalog/'+item.notice_id);check('六类通告正文 '+item.type,r.status===200&&r.data.notice.type===item.type&&r.data.notice.accept_submissions===['DRAMA','RECRUITMENT'].includes(item.type)&&r.data.chat_enabled===false);}
  const next={PENDING:'WAIT_REVIEW',SENT:'WAIT_RECIPIENT',INTERESTED:'WAIT_SUPPORT'};
  for(const item of a.scenarios.submissions){const r=await get('/notices/records/'+item.submission_id,'notices_seller',true);check('本人投稿状态 '+item.stage,r.status===200&&r.data.next_action===next[item.stage]);}
  const b=await get('/auditions/records/'+a.scenarios.audition_booking.booking_id,'auditions_buyer',true);check('新预约仍是安全审阅状态',b.status===200&&b.data.current_status==='SAFETY_REVIEW');
  const paid=a.scenarios.stock.find(x=>x.status==='PAID');const p=await get('/stock/purchases/'+paid.order_id,'stock_buyer',true);check('本人已购个人许可',p.status===200&&p.data.data.status==='ACTIVE');
  const failed=checks.filter(x=>x.status==='FAIL');
  const result={status:failed.length?'FAIL':'PASS',checked_at:new Date().toISOString(),synthetic_only:true,checks:checks.length,passed:checks.length-failed.length,counts,results:checks,requests,limitations:['Pictogram PNGs are synthetic; no real actor likeness or star status','MP4 color bars are playable test media, not real works or watermark approval','Identities, rights and payment facts are synthetic','Browser UI, device geolocation and real providers are not tested by this GET-only script']};
  await fs.writeFile(path.join(__dirname,'joint-http.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,checks:result.checks,counts,failed:failed.map(x=>x.name)}));if(failed.length)process.exitCode=1;
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
