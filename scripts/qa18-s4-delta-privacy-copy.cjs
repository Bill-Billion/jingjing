'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {cloneRecords,load,root,hash}=require('./test-fixtures/qa18-s4-delta-clone.cjs');

const product='053168fb6e06b80680101702a733357309368809';
const source='jx_test_qa18_privacy_170df71eb1fc4e2a6be5';
const caseId='124e64c9-6829-4f71-b2ef-4265a223cdb0';
const output=path.resolve(process.argv[2]||'');
const route='/privacy/requests/'+caseId;
const priorDir=process.argv[3]&&path.resolve(process.argv[3]);
const work='/privacy/operations/requests/'+caseId;
const profileMode=process.argv[4]==='profile';
const termsMode=process.argv[4]==='terms';
const fixedVue=process.argv[5];

async function main(){
  assert(output.startsWith(path.join(root,'.local/qa18')+path.sep));
  const changed=execFileSync('git',['-c','core.quotePath=false','diff','--name-only','4291f1a5d22f0ef9cd75d358f9226c4269b198bf','--','晶晶日上工程交接包/01_源码','contracts'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
  const allowedVue=new Set(['src/views/BusinessView.vue','src/business/directoryCity.ts','src/router/loginRedirect.ts',
    'tools/test-stock-media.mjs','tools/test-business.mjs'].map(p=>'晶晶日上工程交接包/01_源码/frontend_ops_workspace/'+p));
  assert(changed.every(f=>allowedVue.has(f)));
  const evidence={product,checkout:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
    case_id:caseId,started_at:new Date().toISOString(),requests:[],browser_requests:[],checks:[]};
  await fs.mkdir(output,{recursive:true});
  await fs.writeFile(path.join(output,'RUN_ONCE'),'Original synthetic COPY follow-up',{flag:'wx'});
  const save=()=>fs.writeFile(path.join(output,'RESULT.json'),JSON.stringify(evidence,null,2)+'\n');
  const prior=priorDir&&await (async()=>{
    assert(priorDir.startsWith(path.join(root,'.local/qa18')+path.sep));
    const result=JSON.parse(await fs.readFile(path.join(priorDir,'RESULT.json'),'utf8'));
    assert.equal(result.result,'PASS');
    assert.equal(result.case_id,caseId);
    return result;
  })();
  let clone,server,browser;
  try{
    clone=await cloneRecords({source,directory:path.join(root,'.local/qa18/s1-core-20261127/11-privacy'),
      out:output,actors:['buyer','producer','reviewer','outsider'],proof:evidence,resume:prior?{...prior,directory:priorDir}:undefined});
    const {db,disk,roles,secret,expires}=clone;
    const grants=load('src/modules/governance/operator-access');
    for(const [role,action] of [['producer','PRIVACY_HANDLE'],['reviewer','PRIVACY_HANDLE'],['reviewer','PRIVACY_REVIEW']]){
      const [found]=await db.execute('SELECT object_version FROM governance_operator_grants WHERE account_id=? AND action_code=?',[roles[role].account_id,action]);
      await grants.maintainOperatorGrant(db,{account_id:roles[role].account_id,action,enabled:true,expected_version:found[0]?.object_version||0,
        expires_at:new Date(expires).toISOString(),authority_ref:'synthetic:pm04-s4a-delta-original-copy',reason:'原合成申请的本人副本，限独立测试副本办理。'});
    }
    server=load('src/http/account-api').createAccountApi({db,secret,supplyStorageFactory:disk.storageFactory}).listen(0,'127.0.0.1');
    await new Promise((ok,fail)=>{server.once('listening',ok);server.once('error',fail);});
    const base='http://127.0.0.1:'+server.address().port+'/api/v1';
    async function call(role,endpoint,{body,version,status=200,party=false}={}){
      const actor=roles[role];
      const r=await fetch(base+endpoint,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+actor.bearer_token,
        ...party?{'X-Acting-Party':actor.party_id}:{},...version?{'If-Match':'"'+version+'"'}:{},
        ...body===undefined?{}:{'Idempotency-Key':randomUUID(),'Content-Type':Buffer.isBuffer(body)?'application/octet-stream':'application/json'}},
        ...body===undefined?{}:{body:Buffer.isBuffer(body)?body:JSON.stringify(body)},signal:AbortSignal.timeout(12000)});
      const bytes=Buffer.from(await r.arrayBuffer());
      const data=r.headers.get('content-type')?.includes('json')?JSON.parse(bytes):null;
      evidence.requests.push({role,path:endpoint,method:body===undefined?'GET':'POST',status:r.status,error:data?.error?.code,bytes:bytes.length,sha256:hash(bytes)});
      await save();
      assert.equal(r.status,status,endpoint+' '+data?.error?.code);
      return data?.data??bytes;
    }
    const original=await call('buyer',route);
    assert.equal(original.current_status,'FOLLOW_UP');
    assert.equal(original.request.type,'COPY');
    assert.deepEqual(original.request.scopes,['ALL']);
    const oldFiles=original.result.files;
    assert.equal(oldFiles.length,termsMode?4:profileMode?3:prior?2:1);
    for(const file of oldFiles){
      assert.equal(hash(await call('buyer',route+'/evidence/'+file.id+'/content')),file.content_sha256);
      const [[existingFile]]=await db.execute('SELECT created_by FROM supply_assets WHERE id=?',[file.id]);
      assert.equal(existingFile.created_by,roles.producer.account_id,'Only the original handler may retain the prior file in the new response');
    }
    const [initialResponses]=await db.execute('SELECT id,result_sha256 FROM privacy_responses WHERE request_id=? ORDER BY id',[caseId]);
    const [orderRows]=await db.execute("SELECT id,data_sha256 FROM trade_records WHERE kind='ORDER' ORDER BY id");
    const [journalRows]=await db.execute('SELECT * FROM trade_journal ORDER BY id');
    async function transactionCopy(){
      const orders=await call('producer',work+'/transaction-data?section=ORDERS');
      assert.equal(orders.items.length,1);
      assert.equal(orders.next_cursor,null);
      const order=orders.items[0].id;
      const args='&order_id='+order;
      const summary=await call('producer',work+'/transaction-data?section=SUMMARY'+args);
      const copy=await call('producer',work+'/transaction-data?section=CONTRACT'+args);
      const applicantCopy=await call('buyer',route+'/transaction-data?section=CONTRACT'+args);
      assert.deepEqual(copy,applicantCopy);
      assert.equal(copy.items.length,1);
      const contract=copy.items[0];
      assert.equal(contract.copy_kind,'REDACTED_CONTRACT_COPY');
      assert.equal(contract.id,order);
      assert.notEqual(contract.copy_sha256,contract.source_content_sha256);
      assert(!('review' in contract.terms.commitments.quote));
      assert(contract.terms.commitments.quote.lines.every(line=>!('review' in line)));
      assert.equal(summary.items[0].id,order);
      const {received_minor,refunded_minor,net_minor}=summary.items[0].financial;
      assert.equal(received_minor-refunded_minor,net_minor);
      // Scope the response attachment to the applicant's transaction facts and a contract
      // reference. The redacted full copy remains available through the original authorized endpoint.
      const payload={case_id:caseId,scope:['TRANSACTIONS','CONTRACTS'],order_id:order,
        financial:{received_minor,refunded_minor,net_minor},contract:{id:contract.source_contract_id,
          version:contract.contract_version_id,source_sha256:contract.source_content_sha256,
          copy_sha256:contract.copy_sha256,redacted_paths:contract.redacted_paths,signing_method:contract.signing_method}};
      if(termsMode){
        assert.equal(load('src/modules/governance/content').digest(contract.terms),contract.copy_sha256);
        const terms=JSON.stringify(contract.terms);
        assert(!/"(?:object_key|evidence_ref|provider_ref|actor_account_id|created_by|phone|password|token)"\s*:/.test(terms));
        assert(!/[1][3-9][0-9]{9}|[^\s"@]+@[^\s"@]+\.[a-zA-Z]{2,}/.test(terms));
        payload.contract.terms=contract.terms;
        const received=await call('producer',work+'/transaction-data?section=JOURNAL'+args);
        assert.deepEqual(received,await call('buyer',route+'/transaction-data?section=JOURNAL'+args));
        assert.equal(received.next_cursor,null);
        const gross=received.items.filter(row=>row.direction==='RECEIPT').reduce((sum,row)=>sum+row.amount_minor,0);
        const refunded=received.items.filter(row=>row.direction==='REFUND').reduce((sum,row)=>sum+row.amount_minor,0);
        assert.deepEqual([gross,refunded],[received_minor,refunded_minor]);
        payload.account_movements=received.items.map(({direction,currency,amount_minor,created_at})=>({direction,currency,amount_minor,created_at}));
      }
      return {payload,order,outsider:route+'/transaction-data?section=CONTRACT'+args};
    }
    async function storyCopy(){
      const inventory=await call('producer',work+'/data?category=PRIVATE_STORY');
      assert.equal(inventory.items.length,1);
      assert.equal(inventory.next_cursor,null);
      const story=inventory.items[0].id;
      assert.match(story,/^[0-9a-f-]{36}$/);
      const endpoint='/stories/'+story+'/data';
      const sections={};
      for(const section of ['SUBMISSIONS','SUPPLEMENTS','ATTACHMENTS']){
        const query=endpoint+'?section='+section;
        const operator=await call('producer',work+query);
        const applicant=await call('buyer',route+query);
        assert.deepEqual(operator,applicant);
        assert.equal(operator.coverage,'OWN_STORY_RECORDS_ONLY');
        assert.equal(operator.next_cursor,null);
        sections[section]=operator.items;
      }
      assert(sections.SUBMISSIONS.length>=1);
      // This original fixture has its own contained artificial story. Export only these
      // reviewed section copies, without internal uploader/storage/proof references.
      const bytes=JSON.stringify(sections);
      assert(!/"(?:object_key|evidence_ref|provider_ref|account_id|actor_account_id|created_by|phone|password|token)"\s*:/.test(bytes));
      assert(!/[1][3-9][0-9]{9}|[^\s"@]+@[^\s"@]+\.[a-zA-Z]{2,}/.test(bytes));
      return {payload:{case_id:caseId,scope:['PRIVATE_STORY'],story_id:story,sections},story,outsider:route+endpoint+'?section=SUBMISSIONS'};
    }
    async function profileCopy(){
      const options=await call('producer',work+'/copy-options');
      assert.deepEqual(options,await call('buyer',route+'/copy-options'));
      assert.equal(options.request_completion,'NOT_CONFIRMED');
      assert.equal(options.categories.length,7);
      const inventory={};
      for(const {category} of options.categories){
        const end='/data?category='+category;
        const handler=await call('producer',work+end);
        const own=await call('buyer',route+end);
        assert.deepEqual(handler,own);
        assert.equal(own.next_cursor,null,'Incomplete category page '+category);
        inventory[category]=own.items.length;
      }
      const accountSections={};
      for(const section of ['ACCOUNT','PREFERENCES','SESSION_RECORDS','PHONE_CHANGES','FAVORITES','BROWSING_HISTORY']){
        const end='/account-data?section='+section+'&limit=100';
        const handler=await call('producer',work+end);
        const own=await call('buyer',route+end);
        assert.deepEqual(handler,own);
        assert.equal(own.coverage,'OWN_ACCOUNT_RECORDS_ONLY');
        assert.equal(own.request_completion,'NOT_CONFIRMED');
        assert.equal(own.next_cursor,null);
        accountSections[section]=own;
      }
      assert.equal(accountSections.ACCOUNT.items[0].id,roles.buyer.account_id);
      assert.equal(accountSections.SESSION_RECORDS.credential_material,'EXCLUDED');
      assert.equal(accountSections.SESSION_RECORDS.history_complete,false);
      assert(accountSections.SESSION_RECORDS.items.every(row=>Object.keys(row).every(
        key=>['copy_ref','authenticated_at','expires_at','revoked','current_status'].includes(key))));
      const historical=accountSections.SESSION_RECORDS.items.filter(
        item=>item.authenticated_at&&new Date(item.authenticated_at)<new Date('2026-11-28T02:37:36Z'));
      const payload={case_id:caseId,scope:['PROFILE'],
        profile:{display_name:accountSections.ACCOUNT.items[0].display_name,current_status:accountSections.ACCOUNT.items[0].current_status},
        retained_account_activity:{retained_session_summaries:historical.map(({authenticated_at,expires_at,revoked})=>({authenticated_at,expires_at,revoked})),
          phone_change_record_count:accountSections.PHONE_CHANGES.items.length,
          favorite_record_count:accountSections.FAVORITES.items.length,
          retained_browsing_record_count:accountSections.BROWSING_HISTORY.items.length},
        inventory,scope_note:'本次为申请人资料的当前可读目录和留存活动摘要。空项仅表示该副本入口无记录。本人已脱敏的明细可继续按原业务权限查询。'};
      return {payload,inventory,profile_count:historical.length,outsider:route+'/account-data?section=ACCOUNT'};
    }
    const selected=termsMode?await transactionCopy():profileMode?await profileCopy():prior?await storyCopy():await transactionCopy();

    const attachment=Buffer.from(JSON.stringify(selected.payload,null,2)+'\n');
    const asset=await call('producer','/supply/assets?purpose=REVIEW_EVIDENCE&media_type=text%2Fplain',{body:attachment,party:true});
    assert.equal(asset.content_sha256,hash(attachment));
    const candidate=await call('producer',work+'/response',{version:original.object_version,body:{result:{
      response:termsMode?'本次补充原订单的完整脱敏封存合同与本人交易流水，保留前四份答复和原待办；本副本不改变签署与原业务。':profileMode?'本次补充本人账户资料及可读范围盘点，排除凭证、足迹正文、他方资料，保留前三份答复及原待办。':prior?'本次补充本人私人故事的历史正式提交、补件及附件目录，保留此前两份答复。仍需人工核对和外部执行的事项继续跟进。':'本次补充本人原订单的收退款摘要及封存合同脱敏副本索引，保留已有答复文件。完整脱敏合同沿本人资料副本入口读取。其余仍需核对的事项继续跟进。',
      outcome:'INFORMATION_PROVIDED',evidence_asset_ids:[...oldFiles.map(file=>file.id),asset.id],
      retentions:original.result.retentions,remaining_actions:original.result.remaining_actions}}});
    assert.equal(candidate.current_status,'AWAITING_REVIEW');
    await call('buyer',route+'/evidence/'+asset.id+'/content',{status:404});
    assert.equal(hash(await call('reviewer',work+'/evidence/'+asset.id+'/content')),hash(attachment));
    const decision={decision:'APPROVED',reason:termsMode?'独立核对本人原单、完整脱敏封存条款、当事交易分录及文件摘要，不包含内部审核或提供方凭据。':profileMode?'独立核对个人目录、留存活动的凭证排除及原待办，不因空白目录否认外部资料。':prior?'独立核对本人故事历史范围、材料指纹、内部资料排除与原待办保留。':'独立核对原单本人范围、收退款金额、合同内部审核字段的移除与原待办保留。',
      proposal_sha256:candidate.proposal_sha256,evidence_verified:true,third_party_data_redacted:true,remaining_actions_checked:true};
    await call('producer',work+'/review',{version:candidate.object_version,body:decision,status:403});
    const approved=await call('reviewer',work+'/review',{version:candidate.object_version,body:decision});
    assert.equal(approved.current_status,'FOLLOW_UP');
    assert.equal(approved.result.verification.reviewer_account_id,roles.reviewer.account_id);
    assert.deepEqual(approved.result.remaining_actions,original.result.remaining_actions);
    assert.deepEqual(approved.result.retentions,original.result.retentions);
    const final=await call('buyer',route);
    assert.deepEqual(final.result.files.map(x=>x.id).sort(),[...oldFiles.map(file=>file.id),asset.id].sort());
    assert.deepEqual(await call('buyer',route+'/evidence/'+asset.id+'/content'),attachment);
    for(const file of oldFiles)assert.equal(hash(await call('buyer',route+'/evidence/'+file.id+'/content')),file.content_sha256);
    await call('outsider',route+'/evidence/'+asset.id+'/content',{status:404});
    await call('outsider',selected.outsider,{status:404});
    const [finalResponses]=await db.execute('SELECT id,result_sha256 FROM privacy_responses WHERE request_id=? ORDER BY id',[caseId]);
    assert.equal(finalResponses.length,initialResponses.length+1);
    assert.deepEqual(finalResponses.filter(x=>initialResponses.some(y=>x.id===y.id)),initialResponses);
    assert.deepEqual((await db.execute("SELECT id,data_sha256 FROM trade_records WHERE kind='ORDER' ORDER BY id"))[0],orderRows);
    assert.deepEqual((await db.execute('SELECT * FROM trade_journal ORDER BY id'))[0],journalRows);
    if(profileMode||termsMode){
      const {openBrowser,vueArtifact}=require('./test-fixtures/qa18-s4-artifact-browser.cjs');
      const vue=vueArtifact(output,fixedVue,termsMode?'latest':'fixed');
      browser=await openBrowser(base,roles,evidence,{vue});
      for(const surface of ['app','vue']){
        const page=await browser.actor(surface,'buyer',surface==='app'?'/privacy?view=request&recordId='+caseId:route);
        try{
          const label=surface==='app'?'领取这份审核答复附件':'读取本次获准答复附件';
          let action=page.getByRole('button',{name:label,exact:true});
          if(surface==='vue')await page.getByRole('combobox',{name:'本记录列明的私有材料'}).selectOption(asset.id);
          else {
            const files=await action.count();
            if(files!==1)action=action.nth(final.result.files.findIndex(f=>f.id===asset.id));
          }
          const content=route+'/evidence/'+asset.id+'/content';
          const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1'+content,{timeout:10000});
          pending.catch(()=>{});
          await action.click();
          const response=await pending;
          assert.equal(response.status(),200);
          assert.equal(hash(await response.body()),hash(attachment));
          evidence.checks.push({name:'approved original-case attachment received on '+surface,file:asset.id,sha256:hash(attachment)});
        }catch(error){
          await fs.writeFile(path.join(output,surface+'.aria.txt'),await page.locator('body').ariaSnapshot({timeout:1500}).catch(()=>''));
          evidence.checks.push({name:'approved original-case attachment on '+surface,result:'FAIL',error:error.message});
        }finally{await page.context().close();}
      }
    }
    evidence.checks.push({name:termsMode?'complete redacted original contract and scoped journal independently delivered':profileMode?'personal retained access and profile inventory independently delivered':prior?'personal private story history independently delivered':'own transaction and contract attachment independently delivered',order_id:selected.order,story_id:selected.story,file:asset.id,
      bytes:attachment.length,sha256:hash(attachment),inventory:selected.inventory,historical_session_count:selected.profile_count,previous_files:oldFiles.map(file=>({id:file.id,sha256:file.content_sha256})),returned_state:final.current_status,
      prior_responses_preserved:true,original_transaction_rows_preserved:true});
    evidence.result='PASS';
  }catch(error){evidence.result='FAIL';evidence.failure=error.message;throw error;}
  finally{
    try{
      await browser?.close();
      if(server){server.closeAllConnections();await new Promise(ok=>server.close(ok));}
      await clone?.close();
    }catch(error){evidence.result='FAIL';evidence.cleanup_failure=error.message;throw error;}
    finally {evidence.finished_at=new Date().toISOString();await save();}
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
