'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { cloneRecords, load, root, read, hash } = require('./test-fixtures/qa18-s4-delta-clone.cjs');

const source='jx_test_stock_pm03_bc0dc2acab3d0887a8f10285';
const bookingId='d5c18e8c-ec4a-434c-857e-694757e95316';
const orderId='1ca81699-247e-446a-883a-0bb54441f8b9';
const matureAt='2026-11-28T02:57:32.167Z';
const product='053168fb6e06b80680101702a733357309368809';
const participants=['auditions_seller','auditions_buyer','auditions_outsider','mcn_owner'];
const seller=participants[0],buyer=participants[1],reviewer='auditions_reviewer',foreign='auditions_buyer2';
const output=path.resolve(process.argv[2]||'');

async function main(){
  assert(Date.now()>=Date.parse(matureAt),'ORIGINAL_BOOKING_NOT_MATURE');
  assert(output.startsWith(path.join(root,'.local/qa18')+path.sep));
  const checkout=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  assert.equal(execFileSync('git',['diff','--name-only','4291f1a5d22f0ef9cd75d358f9226c4269b198bf','--','晶晶日上工程交接包/01_源码','contracts'],{cwd:root,encoding:'utf8'}),'');
  const evidence={product,checkout,booking_id:bookingId,order_id:orderId,matures_at:matureAt,started_at:new Date().toISOString(),checks:[],requests:[]};
  await fs.mkdir(output,{recursive:true});
  await fs.writeFile(path.join(output,'RUN_ONCE'),'Original natural T+1', {flag:'wx'});
  const priorDir=process.argv[3]&&path.resolve(process.argv[3]);
  const prior=priorDir&&await read(path.join(priorDir,'RESULT.json'));
  if(prior){
    assert.equal(prior.checkout,checkout);
    assert.equal(prior.booking_id,bookingId);
    assert.equal(prior.order_id,orderId);
    assert.equal(prior.result,'FAIL');
    assert(prior.agreement&&prior.settlement);
    assert.equal(prior.requests.at(-1).error,'FINANCE_NOT_FOUND');
    const calls=prior.requests.filter(row=>row.method==='POST'&&row.path==='/finance/agreements/'+prior.agreement+'/settlements');
    assert.equal(calls.length,2);
    assert(calls.every(r=>r.http_status===200&&r.record===prior.settlement&&r.operation_sha256===calls[0].operation_sha256));
    evidence.resume={agreement:prior.agreement,settlement:prior.settlement,original_retry_requests:2,operation_sha256:calls[0].operation_sha256};
  }
  const save=()=>fs.writeFile(path.join(output,'RESULT.json'),JSON.stringify(evidence,null,2)+'\n');
  const check=async (name,details={})=>{evidence.checks.push({name,...details});await save();console.log('PASS '+name);};
  let clone,server;
  try{
    clone=await cloneRecords({source,directory:path.join(root,'.local/stock-sandbox',source),out:output,actors:[...participants,reviewer,foreign],proof:evidence,resume:prior?{...prior,directory:priorDir}:undefined});
    const {db,disk,roles,secret,expires}=clone;
    const checkpoint=await read(path.join(root,'.local/qa18/s1-closeout-20261127/03/checkpoint.json'));
    assert.equal(checkpoint.environment,source);
    assert.equal(checkpoint.booking_id,bookingId);
    assert.equal(checkpoint.order_id,orderId);
    const [[existing]]=await db.execute("SELECT COUNT(*) count FROM finance_records WHERE kind='AGREEMENT' AND JSON_UNQUOTE(JSON_EXTRACT(data_json,'$.source_id'))=?",[orderId]);
    assert.equal(Number(existing.count),prior?1:0,'Existing original agreement must be resumed');
    const grantApi=load('src/modules/governance/operator-access');
    const [grants]=await db.execute("SELECT object_version FROM governance_operator_grants WHERE account_id=? AND action_code='FINANCE_REVIEW'",[roles[reviewer].account_id]);
    assert(grants.length<=1);
    await grantApi.maintainOperatorGrant(db,{account_id:roles[reviewer].account_id,action:'FINANCE_REVIEW',enabled:true,
      expected_version:grants[0]?.object_version||0,expires_at:new Date(expires).toISOString(),authority_ref:'synthetic:pm04-s4a-delta-original-trial',
      reason:'独立测试副本原预约自然到期清分。本操作仅用于隔离审核，无真实付款能力。'});
    server=load('src/http/account-api').createAccountApi({db,secret,supplyStorageFactory:disk.storageFactory}).listen(0,'127.0.0.1');
    await new Promise((ok,fail)=>{server.once('listening',ok);server.once('error',fail);});
    const api='http://127.0.0.1:'+server.address().port+'/api/v1';
    async function call(role,endpoint,{body,version,op,party=true,status=200,contentType,code}={}){
      const actor=roles[role];
      const r=await fetch(api+endpoint,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+actor.bearer_token,
        ...party?{'X-Acting-Party':actor.party_id}:{},...version?{'If-Match':'"'+version+'"'}:{},
        ...body===undefined?{}:{'Idempotency-Key':op||randomUUID(),'Content-Type':contentType||'application/json'}},
        ...body===undefined?{}:{body:Buffer.isBuffer(body)?body:JSON.stringify(body)},signal:AbortSignal.timeout(12000)});
      const bytes=Buffer.from(await r.arrayBuffer());
      const j=r.headers.get('content-type')?.includes('json')?JSON.parse(bytes):null;
      evidence.requests.push({role,path:endpoint,method:body===undefined?'GET':'POST',http_status:r.status,record:j?.data?.id,
        state:j?.data?.current_status,error:j?.error?.code,sha256:hash(bytes),...op?{operation_sha256:hash(op)}:{}});
      await save();
      assert.equal(r.status,status,endpoint+' '+j?.error?.code);
      if(code)assert.equal(j?.error?.code,code);
      return j?.data??bytes;
    }
    const booking=await call(buyer,'/auditions/records/'+bookingId);
    const order=await call(seller,'/trade/records/'+orderId);
    assert.equal(booking.current_status,'FULFILLED');
    assert.equal(booking.data.order_id,orderId);
    assert.equal(booking.data.fulfilled_at,checkpoint.final_booking.data.fulfilled_at);
    assert.equal(Date.parse(booking.data.fulfilled_at)+86400000,Date.parse(matureAt));
    assert.equal(order.current_status,checkpoint.final_order.current_status);
    assert.deepEqual(order.data.contract,checkpoint.final_order.data.contract);
    assert.deepEqual(order.data.quote,checkpoint.final_order.data.quote);
    const [beforeJournal]=await db.execute('SELECT * FROM trade_journal WHERE order_id=? ORDER BY id',[orderId]);
    assert(beforeJournal.length>=1);
    const allocation=order.data.quote.marketplace_finance.allocation;
    const gross=order.data.financial.net_minor;
    assert.equal(gross,10000);
    assert.equal(allocation.platform_bps,2200);
    assert.equal(allocation.mcn_supply_bps,2000);
    assert.equal(allocation.referral_bps,0);
    await check('original booking and paid snapshot naturally mature',{fulfilled_at:booking.data.fulfilled_at,gross});
    const upload=Buffer.from('隔离合成试镜清分依据。原预约 '+bookingId+'，原订单 '+orderId+'。核对原履约与订单快照。无真实银行凭据。');
    const proof=prior?{id:prior.requests.find(row=>row.path.startsWith('/supply/assets?')&&row.method==='POST')?.record}:
      await call(seller,'/supply/assets?purpose=REVIEW_EVIDENCE&media_type=text%2Fplain',{body:upload,contentType:'application/octet-stream'});
    assert(proof.id);
    const agreement=prior?await call(seller,'/finance/records/'+prior.agreement):await call(seller,'/finance/agreements',{body:{source_type:'ORDER',source_id:orderId,
      previous_agreement_id:null,environment:'SANDBOX',rule_id:order.data.quote.rule_id,evidence_asset_id:proof.id,
      rules:{version:'pm04-s4a-original-audition',settlement_at:matureAt,release_condition:'DELIVERY_ACCEPTED',
        terms:'隔离合成清分。依据原订单现有合同、费用和分账。仅生成独立审核的清分记录。',
        lines:[{line_id:order.data.quote.lines[0].line_id,allocation,deductions:[]}]}}});
    evidence.agreement=agreement.id;
    assert.deepEqual(agreement.data.rules.lines[0].allocation,allocation);
    assert.deepEqual(agreement.data.parties.slice().sort(),participants.map(role=>roles[role].party_id).sort());
    const verification={parties_verified:true,contract_verified:true,amount_verified:true,evidence_verified:true};
    const reviewBody={decision:'APPROVED',reason:'独立查阅原预约、履约据和原订单合同；隔离清分不发起真实付款。',verification};
    async function review(record){
      assert.equal(hash(await call(reviewer,'/finance/records/'+agreement.id+'/evidence/'+proof.id,{party:false})),hash(upload));
      assert.equal((await call(reviewer,'/finance/records/'+record.id,{party:false})).id,record.id);
      const decision=await call(reviewer,'/finance/records/'+record.id+'/reviews',{party:false,version:record.object_version,body:reviewBody});
      assert.equal(decision.current_status,'APPROVED');
      return decision;
    }
    async function confirm(record){
      for(const role of participants){
        const response=await call(role,'/finance/records/'+record.id+'/confirmations',{version:record.object_version,
          body:{content_sha256:record.content_sha256,decision:'APPROVED',reason:'核对本方、当前版本及原单合成清分。'}});
        assert.equal(response.id,record.id);
      }
      const result=await call(seller,'/finance/records/'+record.id+'/confirmations');
      assert.equal(result.items.length,participants.length);
      assert(result.items.every(row=>row.content_sha256===record.content_sha256&&row.decision==='APPROVED'));
    }
    const approved=prior?agreement:await review(agreement);
    assert.equal(approved.current_status,'APPROVED');
    if(!prior)await confirm(approved);
    await check('original agreement independently approved and confirmed');
    const uri='/finance/agreements/'+agreement.id+'/settlements';
    const body={period_reference:'pm04-s4a-audition-20261128',note:'沿已自然到期的原试镜订单提交清分。'};
    const key=randomUUID();
    let first;
    if(prior){
      first=await call(seller,'/finance/records/'+prior.settlement);
      assert.equal(first.current_status,'IN_REVIEW');
      const [[commands]]=await db.execute('SELECT COUNT(*) n FROM finance_commands WHERE result_id=?',[first.id]);
      assert.equal(Number(commands.n),1);
    }else{
      first=await call(seller,uri,{version:approved.object_version,body,op:key});
      const recovery=await call(seller,uri,{version:approved.object_version,body,op:key});
      assert.equal(recovery.id,first.id);
      assert.deepEqual(recovery,first);
    }
    evidence.settlement=first.id;
    const settled=await review(first);
    await confirm(settled);
    const reload=await call(seller,'/finance/records/'+settled.id);
    assert.equal(reload.id,settled.id);
    assert.equal(reload.content_sha256,settled.content_sha256);
    await call(foreign,'/finance/records/'+settled.id,{status:404});
    const balances=await call(seller,'/finance/agreements/'+agreement.id+'/balances');
    assert.equal(balances.received_minor,gross);
    const expected={ [allocation.platform_party_id]:2200,[allocation.supplier_party_id]:6240,
      [allocation.mcn_party_id]:1560,[roles[buyer].party_id]:0 };
    for(const balance of balances.items){
      assert.equal(balance.accrued_minor,expected[balance.party_id]);
      assert.equal(balance.paid_minor,0);
      assert.equal(balance.available_minor,0);
    }
    assert.equal(balances.items.length,4);
    const [settlements]=await db.execute("SELECT id,CAST(created_at AS CHAR) AS created_at FROM finance_records WHERE kind='SETTLEMENT' AND agreement_id=?",[agreement.id]);
    const [entries]=await db.execute("SELECT party_id,amount_minor,category FROM finance_entries WHERE agreement_id=?",[agreement.id]);
    assert.deepEqual(settlements.map(row=>row.id),[settled.id]);
    assert.equal(entries.length,3);
    assert(entries.every(row=>row.category==='ACCRUAL'&&Number(row.amount_minor)===expected[row.party_id]));
    assert(Date.parse(String(settlements[0].created_at).replace(' ','T')+'Z')>=Date.parse(matureAt));
    const [afterJournal]=await db.execute('SELECT * FROM trade_journal WHERE order_id=? ORDER BY id',[orderId]);
    assert.deepEqual(afterJournal,beforeJournal);
    assert.deepEqual(await call(seller,'/trade/records/'+orderId),order);
    assert.deepEqual(await call(buyer,'/auditions/records/'+bookingId),booking);
    await check('one original-key settlement, three exact entries, outsider denied, original paid journal unchanged',
      {entries:entries.map(row=>({party:row.party_id,minor:Number(row.amount_minor)})),payment_dispatched_minor:0});
    evidence.result='PASS';
  }catch(error){
    evidence.result='FAIL';
    evidence.failure=error.message;
    throw error;
  }finally{
    try{
      if(server){server.closeAllConnections();await new Promise(ok=>server.close(ok));}
      await clone?.close();
    }catch(error){evidence.result='FAIL';evidence.cleanup_failure=error.message;throw error;}
    finally {evidence.finished_at=new Date().toISOString();await save();}
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
