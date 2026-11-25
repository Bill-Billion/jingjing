import assert from 'node:assert/strict'
import {createServer} from 'vite'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('..',import.meta.url)),server=await createServer({root,configFile:false,resolve:{alias:{'@':`${root}/src`}},server:{middlewareMode:true,ws:false},appType:'custom'})
try{
 const {sourceFor,referenceOptions,readReferences}=await server.ssrLoadModule('/src/business/references.ts'),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,party=id(1),source=sourceFor('spec_ids',{},'redemption',party),good={id:id(2),kind:'SPEC',current_status:'PUBLISHED',merchant_party_id:party,object_version:1,data:{title:'Synthetic reviewed private production',product_profile:{type:'PRIVATE_CUSTOMIZATION'}}}
 assert.equal(source.path,'/trade/records?kind=SPEC');assert.equal(source.party,'required');assert(source.filter(good))
 for(const bad of [{...good,current_status:'IN_REVIEW'},{...good,merchant_party_id:id(9)},{...good,kind:'QUOTE'},{...good,data:{product_profile:{type:'STOCK_VIDEO'}}},{...good,data:{}}])assert(!source.filter(bad))
 const old=globalThis.fetch;let sent
 try{globalThis.fetch=async(url,o)=>{sent={url,o};return new Response(JSON.stringify({data:{items:[good,{...good,id:id(3),merchant_party_id:id(9)}]},meta:{request_id:id(4),actor:{account_id:id(5)},acting_party:party}}),{status:200,headers:{'Content-Type':'application/json'}})};const response=await readReferences(source,{token:'synthetic-test',accountId:id(5),partyId:party});assert.equal(sent.o.headers['X-Acting-Party'],party);assert.deepEqual(referenceOptions(response.items,'spec_ids').map(o=>o.value),[good.id]);}finally{globalThis.fetch=old}
 console.log('PASS redemption spec selection: acting-party request; only published own private-customization specs; no unrelated/stock/draft records')
}finally{await server.close()}
