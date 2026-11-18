import {readFile,writeFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {resolve} from 'node:path'
import assert from 'node:assert/strict'
const root=process.cwd(),access=JSON.parse(await readFile(process.env.V5_ACCESS_FILE,'utf8')),file=resolve(root,'.local/pr39-audition/setup.json'),setup=JSON.parse(await readFile(file,'utf8')),api=new URL(access.base_url)
assert(access.synthetic_only&&setup.synthetic_only&&api.hostname==='127.0.0.1')
async function call(actor,path,{method='GET',body,version}={}){const r=await fetch(access.base_url+path,{method,headers:{Authorization:'Bearer '+actor.bearer_token,'X-Acting-Party':actor.party_id,...method==='POST'?{'Idempotency-Key':randomUUID(),'Content-Type':'application/json'}:{},...version?{'If-Match':`"${version}"`}:{}},...body?{body:JSON.stringify(body)}:{}});const j=await r.json();return{status:r.status,data:j.data,error:j.error?.code}}
const booking=access.scenarios.audition_awaiting.booking_id,owner=access.accounts.mcn_owner,staff=access.accounts.mcn_staff
const assignment=await call(owner,'/engagement/mcn/assignments',{method:'POST',body:{booking_id:booking,order_id:null,account_id:staff.account_id}});assert.equal(assignment.status,200,assignment.error)
let record=await call(staff,'/auditions/records/'+booking);assert.equal(record.status,200);assert.equal(record.data.current_status,'AWAITING_ACCEPTANCE')
record=await call(staff,`/auditions/bookings/${booking}/decision`,{method:'POST',version:record.data.object_version,body:{decision:'ACCEPT',reason:'隔离测试：明确接受合成预约'}});assert.equal(record.status,200,record.error);assert.equal(record.data.current_status,'ACCEPTED')
await writeFile(resolve(root,'.local/pr39-audition/setup-first.json'),JSON.stringify(setup,null,2));setup.booking_id=booking;setup.order_id=access.scenarios.audition_awaiting.order_id;setup.assignment_id=assignment.data.id;await writeFile(file,JSON.stringify(setup,null,2));console.log(JSON.stringify({status:'READY',booking_id:booking,order_id:setup.order_id,synthetic_only:true}))
