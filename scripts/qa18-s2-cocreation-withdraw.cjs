'use strict';
// Confirm that withdrawing a participant affects the retained room, not settled money.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID,createHash}=require('node:crypto');
async function main(){
 const dir=path.resolve(process.env.QA18_OUTPUT_DIR||'');
 assert(dir.startsWith(path.join(process.cwd(),'.local','qa18')+path.sep));
 const accessPath=path.resolve(process.env.V5_ACCESS_FILE||'');
 const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
 const f=await read(accessPath), prior=await read(path.join(dir,'checkpoint.json'));
 assert(f.synthetic_only&&new URL(f.base_url).hostname==='127.0.0.1'&&Date.parse(f.expires_at)>Date.now());
 assert(prior.complete&&prior.final_fulfillment.state==='DELIVERED'&&prior.final_room.id===prior.room.id);
 assert.equal(path.basename(path.dirname(accessPath)),prior.environment);
 const order=prior.final_order, memberId=prior.snippet.data.member_id;
 assert.equal(prior.snippet.parent_id,prior.room.id);
 const trace=[], secret=path.join(dir,'withdraw-private.json');
 let saved;
 try{saved=await read(secret);}catch(e){if(e.code!=='ENOENT')throw e;}
 async function call(role,route,{body,version,key,allowed=200}={}){
  const u=f.accounts[role],headers={Authorization:'Bearer '+u.bearer_token,'X-Acting-Party':u.party_id};
  if(body!==undefined)Object.assign(headers,{'Content-Type':'application/json','Idempotency-Key':key,'If-Match':'"'+version+'"'});
  const r=await fetch(f.base_url+route,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
  const bytes=Buffer.from(await r.arrayBuffer()); let j;
  if(r.headers.get('content-type')?.includes('json'))j=JSON.parse(bytes);
  trace.push({role,path:route,status:r.status,code:j?.error?.code,sha256:createHash('sha256').update(bytes).digest('hex')});
  assert.equal(r.status,allowed,route+' '+j?.error?.code);
  return j?.data??bytes;
 }
 let report={result:'FAIL',room_id:prior.room.id,order_id:order.id,member_id:memberId,snippet_id:prior.snippet.id,trace};
 try{
  const member='/cocreation/members/'+memberId, file='/cocreation/snippets/'+prior.snippet.id+'/file';
  if(!saved){
   const m=await call('participant',member);assert.equal(m.current_status,'ACTIVE');assert.equal(m.parent_id,prior.room.id);
   const bytes=await call('participant',file);assert.equal(createHash('sha256').update(bytes).digest('hex'),prior.downloads.snippet_sha256);
   saved={key:randomUUID(),version:m.object_version,body:{reason:'同一房间合成参与人确认退出，检查原交付访问及费用保全'},member_id:memberId};
   await fs.writeFile(secret,JSON.stringify(saved,null,2),{flag:'wx',mode:0o600});
  }
  assert.equal(saved.member_id,memberId);
  const withdrew=await call('participant',member+'/withdraw',saved);
  assert.equal(withdrew.current_status,'WITHDRAWN');
  await call('participant',file,{allowed:409});assert.equal(trace.at(-1).code,'COCREATION_PARTICIPATION_REQUIRED');
  const room=await call('buyer','/cocreation/rooms/'+prior.room.id);assert.equal(room.current_status,'PAUSED');
  const current=await call('buyer','/trade/records/'+order.id);
  assert.deepEqual(current.data.contract,order.data.contract);assert.deepEqual(current.data.financial,order.data.financial);
  report={...report,result:'PASS',room_status:room.current_status,member_status:withdrew.current_status,financial:current.data.financial};
  console.log(JSON.stringify({result:'PASS',room_id:room.id,member_id:memberId,room_status:room.current_status,financial:current.data.financial}));
 }catch(e){report.error=e.message;throw e;}
 finally{await fs.writeFile(path.join(dir,'withdraw-result.json'),JSON.stringify(report,null,2));}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
