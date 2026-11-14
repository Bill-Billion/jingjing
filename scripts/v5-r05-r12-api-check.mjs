#!/usr/bin/env node
// Assertions against an explicitly disposable real database/HTTP fixture.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,join,basename} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
const access=resolve(process.env.V5_ACCESS_FILE||join(process.argv[2]||'', 'access.json')),f=JSON.parse(await readFile(access,'utf8'));
assert(f.synthetic_only&&new URL(f.base_url).hostname==='127.0.0.1'&&/^jx_test_r05r12_[0-9]+_[a-f0-9]{12}$/.test(basename(dirname(access))));
const out=resolve('output/playwright/v5-r05-r12/api');await mkdir(out,{recursive:true});
const checks=[],requests=[],blockers=[];
async function call(route,role,{body,party=true,version,status=200,binary=false}={}){
 const a=f.accounts[role],res=await fetch(f.base_url+route,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+a.bearer_token,...party?{'X-Acting-Party':a.party_id}:{},...body===undefined?{}:{'Content-Type':'application/json','Idempotency-Key':randomUUID()},...version?{'If-Match':'"'+version+'"'}:{}},...body===undefined?{}:{body:JSON.stringify(body)},signal:AbortSignal.timeout(15000)});
 const value=binary&&res.ok?Buffer.from(await res.arrayBuffer()):await res.json();requests.push({method:body===undefined?'GET':'POST',path:route,role,status:res.status,error:value.error?.code});
 assert.equal(res.status,status,role+' '+route+': '+value.error?.code);return res.ok?(binary?value:value.data):value.error;
}
const check=(name,test)=>{assert(test,name);checks.push({name,result:'PASS'});};
let failure;
try{
 const s=f.scenarios;
 const listing=await call('/stock/catalog/'+s.stock_paid.listing_id,'stock_buyer',{party:false});
 const publicBytes=await call('/stock/catalog/'+s.stock_paid.listing_id+'/preview','stock_buyer',{party:false,binary:true});
 check('已审现货预览是真实受控MP4，不先创建本人数字人',publicBytes.toString('ascii',4,8)==='ftyp'&&listing.id===s.stock_paid.listing_id);
 const paid=await call('/stock/purchases/'+s.stock_paid.order_id,'stock_buyer');
 check('已购内容保留本人非商业个人许可',paid.data.license.scope==='PERSONAL_NONCOMMERCIAL'&&paid.data.license.limited_to_buyer===true);
 const file=await call('/stock/purchases/'+s.stock_paid.order_id+'/content','stock_buyer',{binary:true});
 check('明确读取已购内容返回合成MP4',file.toString('ascii',4,8)==='ftyp');
 const alien=await call('/stock/purchases/'+s.stock_paid.order_id+'/content','outsider',{status:404});
 check('无关主体不能下载他人已购内容',!!alien.code);
 await call('/stock/purchases/'+s.stock_unpaid.order_id+'/content','stock_buyer',{status:409});
 await call('/stock/purchases/'+s.stock_dispute.order_id+'/content','stock_buyer',{status:409});
 check('未付款和争议作品均不能读取私有内容',true);
 const unopened=await call('/wallet/summary','outsider',{status:404});check('首次开户缺账本有独立状态',unopened.code==='WALLET_NOT_FOUND');
 const walletBefore=await call('/wallet/summary','buyer');
 const denied=await call('/wallet/recharges','buyer',{body:{amount_minor:100},status:503});
 const walletAfter=await call('/wallet/summary','buyer');
 for(const k of ['recorded_balance_minor','reserved_balance_minor','available_balance_minor'])assert.equal(walletBefore[k],walletAfter[k]);
 check('托管充值明确未接通且未改余额',denied.code==='CUSTODY_PROVIDER_NOT_CONNECTED');blockers.push({id:'R05R12-CORE-CUSTODY',status:503,code:denied.code});
 const boards=await call('/engagement/rankings/'+s.ranking.snapshot_id,'stock_buyer',{party:false});
 check('六类地域榜及综合分来自实际已发布快照',['sales','reviews','repeat','popularity','levels','newcomers','composite'].every(k=>Array.isArray(boards.boards[k]))&&boards.evidence===undefined);
 const mcn=await call('/engagement/mcn/dashboard','mcn_staff');
 check('MCN员工已派单读取当前真实账号',mcn.assignments.every(a=>a.data.account_id===f.accounts.mcn_staff.account_id));
 await call('/engagement/mcn/staff','mcn_staff',{status:403});check('员工不能管理机构授权',true);
 const room=await call('/cocreation/rooms/'+s.cocreation_ready.room_id,'buyer');
 check('20个独立真人均满足适用条件，原主单保持一笔',room.cutoff.eligible_count===20&&room.cutoff.benefit_eligible===true&&room.order_id===s.cocreation_ready.order_id);
 check('房间摘要不泄漏个人私密故事',!JSON.stringify(room).includes('仅本人可读的第'));
 const member=await call('/cocreation/members/'+s.cocreation_ready.member_id,'participant');
 check('参与者读取自己单独确认的故事',member.data.private_story==='仅本人可读的第0份隔离故事');
 await call('/cocreation/members/'+s.cocreation_ready.member_id,'buyer',{status:404});
 const snippet=await call('/cocreation/snippets/'+s.cocreation_ready.snippet_id+'/file','participant',{binary:true});
 check('主单交付后本人可领取独审个人片段',snippet.toString('ascii',4,8)==='ftyp');
 await call('/cocreation/snippets/'+s.cocreation_ready.snippet_id+'/file','buyer',{status:404});
 check('发起人不能领取参与者个人片段',true);
 const benefits=await call('/cocreation/benefits','buyer');
 check('20人服务额度有实际权益记录并非全单免付',benefits.items.some(v=>v.id===s.cocreation_ready.benefit_id)&&room.order_id!=null);
 const grant=await call('/redemption/grants/'+s.full_coupon.grant_id,'buyer');
 check('全额制作权益仍是AVAILABLE真实券，尚未伪装现金',grant.current_status==='AVAILABLE'&&grant.data.template.kind==='PRODUCTION_FREE');
 const pool=await call('/redemption/pools/'+s.lottery.pool_id,'buyer',{party:false});
 check('奖池显示实际固定规则与概率，不暴露独审私料',!!pool.rules_sha256&&!!pool.distribution&&pool.evidence_asset_ids===undefined);
 const p=await call('/privacy/requests/'+s.privacy.request_id,'buyer',{party:false});
 await call('/privacy/requests/'+s.privacy.request_id,'outsider',{party:false,status:404});
 check('本人权益申请不能被其他账号读取',p.request?.type==='COPY'||p.type==='COPY');
 const participation=await call('/projects/records/'+s.participation.agreement_id,'buyer');
 check('参演原款项与权利完整保留等候各方会签',participation.kind==='PARTICIPATION'&&participation.data.fee_minor===10000&&participation.data.terms.revenue.shares.reduce((n,x)=>n+x.bps,0)===10000);
}catch(e){failure=e.message;process.exitCode=1;}
const report={result:failure?'FAIL':'PASS',synthetic_only:true,checks,requests,blockers,failure,limits:['真实托管未接通是本次预期边界，通过不代表资金服务已启用','只验证可播放合成色条，不认定真实影像、水印、声音或AI标识质量','人工注入隔离可信回执不证明真实支付渠道已启用','MCN单人零商单资料不能证明后台跨人收入隔离已修复']};
const json=JSON.stringify(report,null,2);for(const a of Object.values(f.accounts))assert(!json.includes(a.bearer_token));await writeFile(join(out,'API_RESULTS.json'),json+'\n');console.log(JSON.stringify({result:report.result,checks:checks.length,failure}));
