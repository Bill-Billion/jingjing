#!/usr/bin/env node
// Read real synthetic DTOs through the frontend API guards; no writes.
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
const f=JSON.parse(await readFile(process.env.ARTISTS_ACCESS_FILE,'utf8'));assert(f.synthetic_only&&new URL(f.base_url).hostname==='127.0.0.1')
const web=resolve('晶晶日上工程交接包/01_源码/frontend_ops_workspace'),require=createRequire(web+'/package.json'),{createServer}=require('vite'),server=await createServer({root:web,configFile:false,resolve:{alias:{'@':web+'/src'}},optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'}),original=globalThis.fetch
const out=resolve(process.env.ARTISTS_EVIDENCE_DIR||'output/playwright/v5-r03');await mkdir(out,{recursive:true});const results=[];let failure
try {
 globalThis.fetch=(input,options)=>original(new URL(input,new URL(f.base_url).origin),options)
 const api=await server.ssrLoadModule('/src/api/modules/artists.ts'),identity=(role,party=null)=>({token:f.accounts[role].bearer_token,accountId:f.accounts[role].account_id,partyId:party}),owner=identity('artist',f.accounts.artist.party_id),agency=identity('agency',f.agency_party_id),reviewer=identity('reviewer')
 async function check(label,run){try{await run();results.push({label,result:'PASS'})}catch(e){failure=label+': '+(e.code||e.message);throw e}}
 await check('actual services DTO',()=>api.getArtistServices(identity('artist')))
 await check('actual owner person list',()=>api.listArtistPeople(owner))
 await check('actual person+avatars+halo',()=>api.getArtistPerson(owner,f.person_id))
 for(const kind of ['IDENTITY','CONSENT','DELEGATION','LOOK','VOICE','HALO','APPEAL','SERVICE','LISTING'])await check('actual owner '+kind,()=>api.listArtistRecords(owner,f.person_id,kind))
 await check('actual hosting plus original order',()=>api.getArtistService(owner,f.person_id,f.hosting_id))
 await check('actual private asset metadata',()=>api.getArtistAsset(owner,f.material_id))
 await check('actual approved catalog',()=>api.listArtistCatalog(identity('outsider'),{city:'',tag:'',audition:''}))
 await check('actual delegated person list',()=>api.listArtistPeople(agency))
 for(const kind of ['LOOK','VOICE','DELEGATION','LISTING'])await check('actual delegated '+kind,()=>api.listArtistRecords(agency,f.person_id,kind))
 for(const kind of ['CONSENT','HALO','APPEAL','LISTING','SERVICE'])await check('actual independent review queue '+kind,()=>api.listArtistReviews(reviewer,kind))
 await check('actual scoped reviewer consent detail',()=>api.getArtistRecord(reviewer,f.person_id,f.consent_id))
 console.log(JSON.stringify({result:'PASS',checks:results.length}))
}catch(e){console.error(failure||e.code||e.message);process.exitCode=1}finally{globalThis.fetch=original;await writeFile(out+'/API_DTO_RESULTS.json',JSON.stringify({result:failure?'FAIL':'PASS',synthetic_only:true,results,failure},null,2)+'\n');await server.close()}
