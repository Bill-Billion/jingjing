import assert from 'node:assert/strict'
import {createServer} from 'vite'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('..',import.meta.url)),server=await createServer({root,configFile:false,resolve:{alias:{'@':`${root}/src`}},server:{middlewareMode:true,ws:false},appType:'custom'})
try{
 const {cocreationProductionContext:read}=await server.ssrLoadModule('/src/business/cocreationProduction.ts')
 const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,scope={projectId:id(1),roomId:id(2),partyId:id(3),accountId:id(4)},project={id:id(1),kind:'PROJECT',order_id:id(5),data:{producer_party_id:id(3),assignee_account_id:id(4)}},flow={project_id:id(1),order_id:id(5),cocreation:{room_id:id(2)}}
 assert.deepEqual(read(project,flow,scope),{record_id:id(2),project_id:id(1),order_id:id(5)})
 for(const changed of [{...scope,accountId:id(9)},{...scope,partyId:id(9)},{...scope,roomId:id(9)},{...scope,projectId:id(9)}])assert.throws(()=>read(project,flow,changed),e=>e.code==='COCREATION_ASSIGNED_PROJECT_REQUIRED')
 for(const changed of [{...flow,project_id:id(9)},{...flow,order_id:id(9)},{...flow,cocreation:null},{...flow,cocreation:{room_id:'invalid'}}])assert.throws(()=>read(project,changed,scope))
 assert.throws(()=>read({...project,kind:'VERSION'},flow,scope))
 console.log('PASS assigned producer context: exact project/order/room/account/party; mismatches and non-cocreation rejected')
}finally{await server.close()}
