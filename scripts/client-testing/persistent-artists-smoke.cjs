const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {start}=require('./persistent-story.cjs');
(async()=>{let run;const checks=[];const name=process.argv[2];
async function call(a,role,route,{method='GET',body,raw,party=true}={}){const x=a.accounts[role];const r=await fetch(a.base_url+route,{method,headers:{Authorization:'Bearer '+x.bearer_token,...(party?{'X-Acting-Party':x.party_id}:{}),'Idempotency-Key':randomUUID(),'Content-Type':raw?'application/octet-stream':'application/json'},...(raw?{body:raw}:body?{body:JSON.stringify(body)}:{})});const buffer=Buffer.from(await r.arrayBuffer());let data;try{data=JSON.parse(buffer);}catch{}return {status:r.status,data,buffer};}
try{
 run=await start(name,{hours:1});const a=run.access;
 const created=await call(a,'artist','/artists/people/'+a.person_id+'/avatars',{method:'POST',body:{display_name:'重启验证用合成形象'}});assert.equal(created.status,200,JSON.stringify(created.data));const id=created.data.data.id;checks.push('本人可以新增数字人档案，未假报模型完成');
 const content=Buffer.from('Synthetic evidence retained across restart, no real identity.');
 const upload=await call(a,'artist','/artists/people/'+a.person_id+'/assets?purpose=CONSENT_EVIDENCE&media_type=text/plain',{method:'POST',raw:content});assert.equal(upload.status,200,JSON.stringify(upload.data));const asset=upload.data.data.id;checks.push('本人通过真实上传接口保存合成附件');
 assert.equal((await call(a,'outsider','/artists/people/'+a.person_id)).status,404);assert.equal((await call(a,'outsider','/artists/assets/'+asset+'/content')).status,404);checks.push('其他账号不能读取私人档案或附件');
 assert.equal(a.accounts.agency.party_id,a.agency_party_id);assert.equal((await call(a,'agency','/artists/people/'+a.person_id)).status,200);checks.push('机构邀请绑定机构身份，只读取受托艺人');
 const consent={features:['FACE'],purposes:['PRIVATE_ARCHIVE'],grantee_party_id:a.accounts.artist.party_id,territories:['CN'],valid_from:new Date(Date.now()-60000).toISOString(),valid_until:new Date(Date.now()+86400000).toISOString(),terms:'合成测试，不是真实本人授权',evidence_asset_ids:[asset]};
 const denied=await call(a,'agency','/artists/people/'+a.person_id+'/consents',{method:'POST',body:{avatar_id:id,consent}});assert.equal(denied.status,404,JSON.stringify(denied.data));checks.push('机构不能代本人提交形象授权');
 assert.equal((await call(a,'artist','/artists/people/'+a.person_id+'/identity',{method:'POST',body:{session_ref:'synthetic'}})).status,403);assert.equal((await call(a,'artist','/auth/sms-challenges',{method:'POST',body:{}})).status,403);checks.push('实际实名和短信接口没有打开');
 await run.stop();run=null;run=await start(name,{hours:1});const fresh=run.access;
 assert.equal((await call({...fresh,accounts:a.accounts},'artist','/me')).status,401);checks.push('重启撤销旧会话');
 const profile=await call(fresh,'artist','/artists/people/'+fresh.person_id);assert.equal(profile.status,200);assert(profile.data.data.avatars.some(x=>x.id===id),'原形象档案应在本人档案下');const file=await call(fresh,'artist','/artists/assets/'+asset+'/content');assert.equal(file.status,200);assert.deepEqual(file.buffer,content);checks.push('原档案和新上传附件重启后均可读取且字节一致');
 const seeded=await call(fresh,'artist','/artists/assets/'+fresh.material_id+'/content');assert.equal(seeded.status,200);assert.equal(seeded.buffer[0],137);checks.push('初始化的模拟预览附件重启后保留');
 const out=path.resolve('docs/testing/evidence/client-routes-20261026');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'ARTISTS_PERSISTENCE.json'),JSON.stringify({result:'PASS',checks,scope:'Isolated synthetic records and files; no real identity or model service.'},null,2)+'\n');console.log(JSON.stringify({result:'PASS',checks:checks.length}));
}finally{if(run)await run.stop();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
