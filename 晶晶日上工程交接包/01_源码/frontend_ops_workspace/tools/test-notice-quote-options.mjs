import assert from 'node:assert/strict'
import {fileURLToPath} from 'node:url'
import {readFileSync} from 'node:fs'
import {createServer} from 'vite'
const root=fileURLToPath(new URL('..',import.meta.url)),saved=globalThis.fetch
const server=await createServer({root,configFile:false,resolve:{alias:{'@':`${root}/src`}},server:{middlewareMode:true},appType:'custom'})
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,sha='a'.repeat(64)
try{
 const {sourceFor,readReferences,referenceOptions}=await server.ssrLoadModule('/src/business/references.ts')
 const source=sourceFor('quote_id',{record_id:id(1)},'notices',id(9));assert.equal(source.path,`/notices/cases/${id(1)}/quote-options`);assert.equal(source.party,'none');assert.equal(sourceFor('quote_id',{},'notices',id(9)),null)
 const identity={token:'synthetic',accountId:id(9),partyId:id(8)},item={id:id(3),object_version:1,current_status:'APPROVED',content_sha256:sha,total_minor:10001,currency:'CNY',expires_at:'2099-01-01T00:00:00.000Z',title:'本次已审报价'},data={case_id:id(1),submission_id:id(2),items:[item],next_cursor:null}
 let returned=data;globalThis.fetch=async(url,o)=>{assert.equal(o.headers['X-Acting-Party'],undefined);return new Response(JSON.stringify({meta:{request_id:'synthetic',actor:{account_id:id(9)},acting_party:null},data:returned}),{status:200,headers:{'Content-Type':'application/json'}})}
 const r=await readReferences(source,identity);assert.equal(referenceOptions(r.items,'quote_id')[0].record.content_sha256,sha)
 for(const bad of [{...data,case_id:id(4)},{...data,items:[{...item,content_sha256:'bad'}]},{...data,items:[item,item]},{...data,next_cursor:'bad'}]){returned=bad;await assert.rejects(readReferences(source,identity),e=>e.code==='UNEXPECTED_RESPONSE_SHAPE')}
 returned={...data,items:[],next_cursor:id(3)};assert.equal((await readReferences(source,identity)).data.next_cursor,id(3));await assert.rejects(readReferences(source,identity,id(3)),e=>e.code==='UNEXPECTED_RESPONSE_SHAPE')
 assert.match(readFileSync(`${root}/src/views/BusinessView.vue`,'utf8'),/quote_id:'quote_sha256'/)
 console.log('notice quote options: 8 source, shape, cursor and hash checks passed')
}finally{globalThis.fetch=saved;await server.close()}
