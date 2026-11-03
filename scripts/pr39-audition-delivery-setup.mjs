import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {resolve} from 'node:path'
const root=process.cwd(),access=JSON.parse(await readFile(process.env.V5_ACCESS_FILE,'utf8')),api=new URL(access.base_url)
assert(access.synthetic_only&&api.hostname==='127.0.0.1'&&api.pathname==='/api/v1')
const {auditions_seller:seller,mcn_staff:staff}=access.accounts,{mcn}=access.scenarios,out=resolve(root,'.local/pr39-audition');await mkdir(out,{recursive:true})
async function call(actor,path,{method='GET',body,version,raw=false}={}){const headers={Authorization:'Bearer '+actor.bearer_token,'X-Acting-Party':actor.party_id,...method==='POST'?{'Idempotency-Key':randomUUID(),'Content-Type':raw?'application/octet-stream':'application/json'}:{},...version?{'If-Match':`"${version}"`}:{}};const r=await fetch(access.base_url+path,{method,headers,...body!==undefined?{body:raw?body:JSON.stringify(body)}:{}});const j=await r.json();return{status:r.status,data:j.data,error:j.error?.code}}
const options=`/auditions/bookings/${mcn.booking_id}/delivery-options?kind=PHOTO&limit=20`
const before=await call(staff,options);assert.equal(before.status,403);assert.equal(before.error,'MCN_EMPLOYEE_SCOPE_REQUIRED')
const records=await call(seller,`/artists/people/${mcn.person_id}/records?kind=DELEGATION`);assert.equal(records.status,200)
const old=records.data.items.find(r=>r.current_status==='ACTIVE'&&r.data.organization_party_id===mcn.party_id);assert(old)
const withdrawn=await call(seller,`/artists/people/${mcn.person_id}/records/${old.id}/withdrawals`,{method:'POST',version:old.object_version,body:{reason:'仅隔离模拟：为材料权限测试重新确认逐人委托'}});assert.equal(withdrawn.status,200)
const d=old.data,grant=await call(seller,`/artists/people/${mcn.person_id}/delegations`,{method:'POST',body:{delegation:{organization_party_id:mcn.party_id,relation_id:d.relation_id,actions:['READ_PROFILE','MANAGE_AUDITIONS','MANAGE_MATERIALS'],valid_from:d.valid_from,valid_until:d.valid_until,evidence_asset_ids:d.evidence_asset_ids,terms:'仅隔离模拟：明确本人试镜及材料管理委托'}}});assert.equal(grant.status,200,grant.error)
const still=await call(staff,options);assert.equal(still.status,403);assert.equal(still.error,'MCN_EMPLOYEE_SCOPE_REQUIRED')
const image=await readFile(resolve(out,'media/synthetic.jpg')),video=await readFile(resolve(out,'media/synthetic.mp4')),photos=[]
for(let i=0;i<6;i++){const bytes=Buffer.concat([image,Buffer.from(`\nsynthetic-${i}`)]),r=await call(seller,`/artists/people/${mcn.person_id}/assets?purpose=AVATAR_MATERIAL&media_type=image%2Fjpeg`,{method:'POST',body:bytes,raw:true});assert.equal(r.status,200,r.error);photos.push(r.data.id)}
const clip=await call(seller,`/artists/people/${mcn.person_id}/assets?purpose=AVATAR_MATERIAL&media_type=video%2Fmp4`,{method:'POST',body:video,raw:true});assert.equal(clip.status,200,clip.error)
const sellerOptions=await call(seller,options);assert.equal(sellerOptions.status,200);assert(photos.every(id=>sellerOptions.data.items.some(x=>x.id===id)))
const result={synthetic_only:true,booking_id:mcn.booking_id,order_id:access.scenarios.audition_accepted.order_id,person_id:mcn.person_id,organization_id:mcn.party_id,delegation_id:grant.data.id,photo_ids:photos,video_id:clip.data.id,checks:[{id:'AUD-SETUP-01',result:'PASS',scenario:'员工缺材料权限被拒绝；艺人明确委托机构后，仍须员工逐人授权'},{id:'AUD-SETUP-02',result:'PASS',scenario:'本人上传并关联可播放合成材料，原预约可读选项'}],limits:'随机隔离数据库与模拟支付；合成材料，无真实账户或服务。'}
await writeFile(resolve(out,'setup.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({result:'PASS',booking_id:result.booking_id,checks:result.checks.length}))
