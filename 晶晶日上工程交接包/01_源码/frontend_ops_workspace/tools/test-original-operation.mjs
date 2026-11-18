import assert from 'node:assert/strict'
import {fileURLToPath} from 'node:url'
import {createServer} from 'vite'
import {effectScope,reactive} from 'vue'
const root=fileURLToPath(new URL('..',import.meta.url))
const server=await createServer({root,configFile:false,resolve:{alias:{'@':`${root}/src`}},server:{middlewareMode:true,hmr:false},appType:'custom'})
const storage=new Map(),saved=globalThis.fetch
Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}})
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const response=data=>new Response(JSON.stringify({meta:{request_id:'synthetic',actor:{account_id:id(1)},acting_party:id(2)},data}),{status:200,headers:{'Content-Type':'application/json'}})
const fail=status=>new Response(JSON.stringify({error:{code:status===503?'PROVIDER_OUTCOME_UNKNOWN':'DEADLINE_PASSED',message:'synthetic'}}),{status,headers:{'Content-Type':'application/json'}})
let passed=0
try{
 const {useBusiness}=await server.ssrLoadModule('/src/composables/useBusiness.ts'),{originalDigest}=await server.ssrLoadModule('/src/api/modules/originalOperation.ts')
 for(const [path,operation,kind]of [['/notices/submissions','SUBMIT','SUBMISSION'],['/engagement/candidates','NOMINATE','CANDIDATE'],['/engagement/votes','VOTE','VOTE'],['/engagement/appeals','APPEAL','APPEAL']]){
  for(const mode of ['committed','absent409','wrongDigest','context']){
   storage.clear();const scope=effectScope(),context=reactive({token:'synthetic',accountId:id(1),partyId:id(2),sessionTag:'synthetic',domain:operation}),ui=scope.run(()=>useBusiness(()=>context))
   let writes=0,key;const body={event_id:id(3),nested:{z:1,a:['原内容']}}
   const data={current:true},record={id:id(4),kind,object_version:5,current_status:'APPROVED',data,content_sha256:await originalDigest(data)}
   globalThis.fetch=async(url,options)=>{
    const u=new URL(url,'http://localhost');if(options?.method==='POST'){writes++;const next=new Headers(options.headers).get('Idempotency-Key');if(key)assert.equal(next,key);key=next;return fail(writes===1?503:409)}
    if(u.pathname.includes('/operations/'))return response({operation,operation_key:key,outcome:mode==='absent409'?'NOT_OBSERVED':'COMMITTED',request_sha256:mode==='absent409'?null:mode==='wrongDigest'?'0'.repeat(64):await originalDigest({...body,party_id:id(2),operation_key:key}),record_id:mode==='absent409'?null:id(4),record_kind:mode==='absent409'?null:kind,original_object_version:mode==='absent409'?null:1,original_status:mode==='absent409'?null:'IN_REVIEW'})
    return response(record)
   }
   await ui.execute({path,method:'POST',party:'required',body,label:'synthetic'})
   assert(ui.pending.value)
   if(mode==='context'){context.partyId=id(5);assert.equal(ui.pending.value,null)}
   else {await ui.check('/not-used','required')
    if(mode==='committed'){assert.equal(ui.pending.value,null);assert.equal(ui.data.value.object_version,5);assert.equal(writes,1)}
    if(mode==='wrongDigest'){assert(ui.pending.value);assert.equal(ui.data.value,null);assert.equal(writes,1)}
    if(mode==='absent409'){assert(ui.pending.value.checked);await ui.execute();assert.equal(ui.pending.value.key,key);assert.equal(writes,2)}
   }
   scope.stop();console.log('PASS',operation,mode);passed++
  }
 }
 console.log(JSON.stringify({passed,failed:0}))
}finally{globalThis.fetch=saved;await server.close()}
