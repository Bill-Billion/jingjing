import assert from 'node:assert/strict'
import {fileURLToPath} from 'node:url'
import {createServer} from 'vite'
const root=fileURLToPath(new URL('..',import.meta.url)),saved=globalThis.fetch
const server=await createServer({root,configFile:false,resolve:{alias:{'@':root+'/src'}},server:{middlewareMode:true,hmr:false},appType:'custom'})
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
try{
 const {sourceFor,readReferences,referenceOptions}=await server.ssrLoadModule('/src/business/references.ts')
 const identity={token:'synthetic',accountId:id(1),partyId:id(2)},context={request_id:id(3),privacy_action:'response'}
 const source=sourceFor('evidence_asset_ids',context,'privacy',id(2))
 assert.equal(source?.path,`/privacy/operations/requests/${id(3)}/response-file-options?limit=20`);assert.equal(source.party,'none')
 for(const invalid of [{...context,request_id:'bad'},{...context,privacy_action:'response-review'}])assert.equal(sourceFor('evidence_asset_ids',invalid,'privacy',id(2)),null)
 const row={id:id(4),content_sha256:'a'.repeat(64),byte_size:12,media_type:'text/plain'},data={request_id:id(3),handler_account_id:id(1),items:[row],next_cursor:null}
 const reply=value=>new Response(JSON.stringify({meta:{request_id:'synthetic',actor:{account_id:id(1)},acting_party:null},data:value}),{headers:{'Content-Type':'application/json'}})
 let calls=0;globalThis.fetch=async(url,o)=>{calls++;assert.equal(String(url),'/api/v1'+source.path);assert(!o.headers['X-Acting-Party']);return reply(data)}
 const result=await readReferences(source,identity);assert.equal(calls,1);const options=referenceOptions(result.items,'evidence_asset_ids');assert.equal(options[0].value,row.id);assert(options[0].label.includes('12'));assert(options[0].label.includes('text/plain'))
 for(const bad of [{...data,request_id:id(8)},{...data,handler_account_id:id(8)},{...data,items:[row,row]},{...data,items:[{...row,content_sha256:'bad'}]},{...data,items:[{...row,byte_size:0}]},{...data,next_cursor:'invalid'}]){globalThis.fetch=async()=>reply(bad);await assert.rejects(readReferences(source,identity),e=>e.code==='UNEXPECTED_RESPONSE_SHAPE')}
 globalThis.fetch=async()=>reply({...data,next_cursor:id(4)});await assert.rejects(readReferences(source,identity,id(4)),e=>e.code==='UNEXPECTED_RESPONSE_SHAPE')
 globalThis.fetch=async()=>new Response(JSON.stringify({error:{code:'PRIVACY_FORBIDDEN',message:'Synthetic revocation'}}),{status:403,headers:{'Content-Type':'application/json'}});await assert.rejects(readReferences(source,identity),e=>e.status===403)
 console.log('privacy response file options: handler/request binding, metadata, pagination and denial checks passed')
}finally{globalThis.fetch=saved;await server.close()}
