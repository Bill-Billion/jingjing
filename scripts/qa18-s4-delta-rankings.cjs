'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const {cloneRecords,load,root,hash}=require('./test-fixtures/qa18-s4-delta-clone.cjs');

const source='jx_test_qa18_champion_97e283b8d5ca06c23b5d';
const competition='6ef13076-75a9-4961-94db-f0be7ad2dcc7';
const output=path.resolve(process.argv[2]||'');

async function main(){
  assert(output.startsWith(path.join(root,'.local/qa18')+path.sep));
  const evidence={product:'053168fb6e06b80680101702a733357309368809',competition,started_at:new Date().toISOString(),
    checks:[],requests:[]};
  await fs.mkdir(output,{recursive:true});
  let server,clone;
  try {
    clone=await cloneRecords({source,directory:path.join(root,'.local/qa18/s2-20261127/09/env'),out:output,
      actors:['buyer','artist'],proof:evidence,restoreFiles:false});
    const {db,roles,secret}=clone;
    const [snapshots]=await db.execute("SELECT id,data_json,data_sha256 FROM engagement_records WHERE kind='RANK_SNAPSHOT' AND current_status='PUBLISHED' ORDER BY id");
    assert(snapshots.length>=1);
    const serverApi=load('src/http/account-api').createAccountApi({db,secret});
    server=http.createServer((req,res)=>{
      if(req.method!=='GET'){res.writeHead(405).end();return;}
      serverApi(req,res);
    });
    await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
    const base='http://127.0.0.1:'+server.address().port+'/api/v1';
    async function get(endpoint,role='buyer'){
      const actor=roles[role];
      const response=await fetch(base+endpoint,{headers:{Authorization:'Bearer '+actor.bearer_token},signal:AbortSignal.timeout(10000)});
      const bytes=Buffer.from(await response.arrayBuffer());
      const parsed=JSON.parse(bytes);
      evidence.requests.push({endpoint,role,status:response.status,error:parsed.error?.code,sha256:hash(bytes)});
      assert.equal(response.status,200,endpoint+' '+parsed.error?.code);
      return parsed.data;
    }
    const boards=['composite','levels','newcomers','popularity','repeat','reviews','sales'];
    for(const saved of snapshots){
      const dto=await get('/engagement/rankings/'+saved.id);
      const stored=typeof saved.data_json==='string'?JSON.parse(saved.data_json):saved.data_json;
      assert.equal(dto.id,saved.id);
      for(const field of ['city','district','category'])assert.equal(dto[field],stored[field]);
      assert.deepEqual(Object.keys(dto.boards).sort(),boards);
      assert.equal(dto.paid_advertising,false);
      assert.equal(dto.personalized,false);
      assert.equal(stored.paid_advertising,false);
      assert.deepEqual(stored.boards,dto.boards);
      assert(dto.boards.reviews.length===0||dto.boards.reviews.every(x=>x.review_count>0));
      assert(dto.boards.repeat.length===0||dto.boards.repeat.every(x=>x.buyers>0));
      const explanation=await get('/engagement/rankings/'+saved.id+'/explanation');
      assert.equal(explanation.paid_advertising,false);
      assert.equal(explanation.snapshot_id,saved.id);
      evidence.checks.push({id:saved.id,city:dto.city,rows:Object.fromEntries(boards.map(key=>[key,dto.boards[key].length])),
        explanation:explanation.formula_scope,paid_advertising:false,unchanged_source_sha256:saved.data_sha256});
    }
    const final=await get('/engagement/competitions/'+competition);
    assert.equal(final.id,competition);
    const [[reward]]=await db.execute("SELECT id,current_status,data_json FROM engagement_records WHERE id='2ac012c9-04f0-476b-a1af-380dc8acf94f' AND kind='REWARD_GRANT'");
    assert.equal(reward.current_status,'REDEEMED');
    evidence.competition_status=final.current_status;
    evidence.earned_reward={id:reward.id,state:reward.current_status};
    assert.equal((await fetch(base+'/engagement/rankings',{method:'POST'})).status,405);
    assert.deepEqual((await db.execute("SELECT id,data_json,data_sha256 FROM engagement_records WHERE kind='RANK_SNAPSHOT' AND current_status='PUBLISHED' ORDER BY id"))[0],snapshots);
    evidence.result='PASS';
    console.log('PASS original six public board sources plus composite, no paid ranking, and separate redeemed earned reward');
  }catch(error){evidence.result='FAIL';evidence.failure=error.message;throw error;}
  finally{
    try{
      if(server){server.closeAllConnections();await new Promise(ok=>server.close(ok));}
      await clone?.close();
    }catch(error){evidence.result='FAIL';evidence.cleanup_failure=error.message;throw error;}
    finally {evidence.finished_at=new Date().toISOString();await fs.writeFile(path.join(output,'RESULT.json'),JSON.stringify(evidence,null,2)+'\n');}
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
