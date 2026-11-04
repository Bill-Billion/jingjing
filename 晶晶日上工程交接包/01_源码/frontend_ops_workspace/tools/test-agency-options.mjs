import assert from 'node:assert/strict'
import {fileURLToPath} from 'node:url'
import {createServer} from 'vite'
const root=fileURLToPath(new URL('..',import.meta.url)),saved=globalThis.fetch,server=await createServer({root,configFile:false,resolve:{alias:{'@':`${root}/src`}},server:{middlewareMode:true},appType:'custom'})
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,i={token:'synthetic',accountId:id(1),partyId:id(2)}
try{
 const {agencyOptions}=await server.ssrLoadModule('/src/api/modules/agency-options.ts');let mode='normal',calls=0
 const item={listing_id:id(3),person_id:id(4),avatar_id:id(5),artist_party_id:id(6),display_name:'公开艺人',city:'合成城市'}
 globalThis.fetch=async(url,o)=>{calls++;assert.equal(o.headers['X-Acting-Party'],i.partyId);return new Response(JSON.stringify({meta:{request_id:'synthetic',actor:{account_id:mode==='account'?id(7):i.accountId},acting_party:i.partyId},data:{party_id:mode==='party'?id(7):i.partyId,items:mode==='duplicate'?[item,item]:mode==='empty'&&calls===1?[]:[item],next_cursor:mode==='loop'||mode==='empty'&&calls===1?id(3):null}}),{headers:{'Content-Type':'application/json'}})}
 assert.equal((await agencyOptions(i,'ARTIST'))[0].display_name,'公开艺人')
 for(mode of ['account','party','duplicate','loop'])await assert.rejects(agencyOptions(i,'ARTIST'),e=>e.code==='UNEXPECTED_RESPONSE_SHAPE')
 mode='empty';calls=0;assert.equal((await agencyOptions(i,'ARTIST')).length,1);assert.equal(calls,2)
 globalThis.fetch=async()=>new Response(JSON.stringify({meta:{request_id:'synthetic',actor:{account_id:i.accountId},acting_party:i.partyId},data:{person_id:id(4),kind:'RELATION',items:[{id:id(8),organization_party_id:id(9),display_name:'已接受机构',valid_from:'2020-01-01T00:00:00Z',valid_until:'2099-01-01T00:00:00Z'}],next_cursor:null}}),{headers:{'Content-Type':'application/json'}})
 assert.equal((await agencyOptions(i,'RELATION',id(4)))[0].display_name,'已接受机构');await assert.rejects(agencyOptions(i,'RELATION',id(5)));await assert.rejects(agencyOptions(i,'EVIDENCE',id(4)))
 console.log('agency options: 9 identity, cursor, minimal selection and context checks passed')
}finally{globalThis.fetch=saved;await server.close()}
