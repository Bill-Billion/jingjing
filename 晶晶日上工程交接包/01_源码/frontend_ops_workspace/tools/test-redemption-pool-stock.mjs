import assert from 'node:assert/strict'
import {createServer} from 'vite'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('..',import.meta.url)),server=await createServer({root,configFile:false,resolve:{alias:{'@':`${root}/src`}},server:{middlewareMode:true,ws:false},appType:'custom'})
try{
 const {sourceFor,readReferences,referenceOptions}=await server.ssrLoadModule('/src/business/references.ts'),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,party=id(1),context={redemption_action:'pool',key:'free',config:{prizes:[{key:'free',kind:'PRODUCTION_FREE'}]}},source=sourceFor('stock_id',context,'redemption',party),good={id:id(2),kind:'STOCK',owner_party_id:party,current_status:'AVAILABLE',data:{template:{kind:'PRODUCTION_FREE',exchange_points:null,title:'Synthetic full production'}}}
 assert.equal(source.path,'/redemption/queue?kind=STOCK&limit=100');assert.equal(source.party,'none');assert(source.filter(good))
 const wrong=[{...good,id:id(3),owner_party_id:id(9)},{...good,id:id(4),current_status:'IN_REVIEW'},{...good,id:id(5),current_status:'RETIRED'},{...good,id:id(6),data:{template:{kind:'PRODUCTION_CREDIT'}}}]
 for(const r of wrong)assert(!source.filter(r))
 const old=globalThis.fetch;let calls=0
 try{globalThis.fetch=async(url,o)=>{calls++;assert(String(url).includes('/redemption/queue?kind=STOCK&limit=100'));assert(!o.headers['X-Acting-Party']);return new Response(JSON.stringify({data:{items:[good,...wrong],next_cursor:id(8)},meta:{request_id:id(7),actor:{account_id:id(10)},acting_party:null}}),{status:200,headers:{'Content-Type':'application/json'}})};const r=await readReferences(source,{token:'synthetic-test',accountId:id(10),partyId:party});assert.equal(calls,1);assert.deepEqual(referenceOptions(r.items,'stock_id').map(x=>x.value),[good.id]);assert.equal(r.data.next_cursor,id(8));}finally{globalThis.fetch=old}
 const interview=(kind,channel)=>sourceFor('stock_id',{...context,config:{prizes:[{key:'free',kind}]}},'redemption',party).filter({...good,data:{template:{kind:'INTERVIEW',interview:{channel}}}})
 assert(interview('INTERVIEW_OPEN','OPEN'));assert(!interview('INTERVIEW_OPEN','PRIORITY'));assert(interview('INTERVIEW_PRIORITY','PRIORITY'));assert(!interview('INTERVIEW_PRIORITY','OPEN'))
 assert(!sourceFor('stock_id',{...context,key:'missing'},'redemption',party).filter(good));assert.equal(sourceFor('stock_id',{redemption_action:'exchange'},'redemption',party).path,'/redemption/catalog')
 console.log('PASS pool stock: operator directory includes non-exchange free prize; own approved matching-kind inventory only; channels distinct; pagination retained; public exchange source unchanged')
}finally{await server.close()}
