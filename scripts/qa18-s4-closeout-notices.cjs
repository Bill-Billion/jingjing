'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {cloneRecords,load,root,read,hash}=require('./test-fixtures/qa18-s4-delta-clone.cjs');
const {openBrowser}=require('./test-fixtures/qa18-s4-artifact-browser.cjs');

const source='jx_test_stock_pm03_bc0dc2acab3d0887a8f10285';
const old=path.join(root,'.local/stock-sandbox',source);
const baseDir=path.join(root,'.local/qa18/s4-a-closeout-20261128');
const appDir=path.join(baseDir,'app-normal-fix');
const vueDir=path.join(root,'.local/qa18/s4-a-remaining-20261128/builds/vue-stock');
const out=path.resolve(process.argv[2]||'');
const requestedSurface=process.argv[3];
const requestedKind=process.argv[4];

async function main(){
  assert(out.startsWith(baseDir+path.sep));
  assert(['app','vue'].includes(requestedSurface));
  assert(['submission','support','invitation'].includes(requestedKind));
  await fs.mkdir(out,{recursive:true});
  await fs.writeFile(path.join(out,'RUN_ONCE'),'original local notice links',{flag:'wx'});
  const original=await read(path.join(old,'access.json'));
  const prior=await read(path.join(root,'.local/qa18/s1-core-20261127/04-notice/checkpoint.json'));
  assert(prior.complete&&prior.environment===source);
  const e={source,case_id:prior.case.id,submission_id:prior.submission.id,started_at:new Date().toISOString(),browser_requests:[],api:[],checks:[]};
  const save=()=>fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify(e,null,2)+'\n');
  let clone,server,browser,activePage;
  try{
    clone=await cloneRecords({source,directory:old,out,actors:requestedSurface==='vue'&&requestedKind==='support'?['notices_reviewer','auditions_outsider']:['notices_seller','notices_buyer2','auditions_outsider'],proof:e,restoreFiles:false});
    const {db,roles,secret}=clone;
    if(requestedSurface==='vue'&&requestedKind==='support'){
      const scoped=roles.notices_reviewer.account_id;
      const [oldGrant]=await db.execute('SELECT object_version FROM governance_operator_grants WHERE account_id=? AND action_code=?',
        [scoped,'NOTICE_SUPPORT']);
      await load('src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:scoped,action:'NOTICE_SUPPORT',
        enabled:true,expected_version:oldGrant[0]?.object_version||0,expires_at:new Date(clone.expires).toISOString(),
        authority_ref:'synthetic:s4-closeout-matching-original-support-role',reason:'Renew the original isolated notice-support actor for this test copy only.'});
    }
    const security=load('src/modules/auth/security').createSecurity(secret);
    const phones=new Set();
    for(const role of Object.keys(roles)){
      const phone=original.accounts[role].phone;
      assert.match(phone,/^1[3-9]\d{9}$/);
      assert(!phones.has(phone));
      phones.add(phone);
      const [oldBinding]=await db.execute('UPDATE auth_subjects SET account_id=NULL WHERE account_id=?',[roles[role].account_id]);
      assert.equal(oldBinding.affectedRows,1);
      await db.execute('INSERT INTO auth_subjects(phone_hash,account_id) VALUES(?,?)',[security.digest('phone',phone),roles[role].account_id]);
    }
    const codes=new Map();
    const sms={async call(method,{phone,code},{request_id}){assert(method==='send'&&phones.has(phone));codes.set(request_id,code);return {accepted:true};}};
    server=load('src/http/account-api').createAccountApi({db,secret,sms}).listen(0,'127.0.0.1');
    await new Promise((ok,fail)=>{server.once('listening',ok);server.once('error',fail);});
    const base='http://127.0.0.1:'+server.address().port+'/api/v1';
    async function probe(role,route){
      const p=roles[role],r=await fetch(base+route,{headers:{Authorization:'Bearer '+p.bearer_token,...requestedSurface==='vue'&&requestedKind==='support'?{}:{'X-Acting-Party':p.party_id}},signal:AbortSignal.timeout(10000)});
      const bytes=Buffer.from(await r.arrayBuffer()),j=JSON.parse(bytes);
      e.api.push({role,route,status:r.status,data_id:j.data?.id,code:j.error?.code,sha256:hash(bytes)});
      return {status:r.status,data:j.data};
    }
    const candidates=[{kind:'submission',id:prior.submission.id},{kind:'support',id:prior.case.id}];
    const [invites]=requestedSurface==='vue'&&requestedKind==='support'?[[]]:await db.execute("SELECT id FROM notice_records WHERE kind='SUBMISSION' AND JSON_UNQUOTE(JSON_EXTRACT(data_json,'$.submission.kind'))='INVITATION' AND (owner_party_id IN(?,?) OR counterparty_id IN(?,?)) ORDER BY created_at DESC LIMIT 8",
      [roles.notices_seller.party_id,roles.notices_buyer2.party_id,roles.notices_seller.party_id,roles.notices_buyer2.party_id]);
    if(invites.length)candidates.push({kind:'invitation',id:invites[0].id});
    const appManifest=await read(appDir+'.json'),vueManifest=await read(vueDir+'.json');
    browser=await openBrowser(base,roles,e,{app:{dir:appDir,manifest:appDir+'.json',checkout:appManifest.checkout,source:appManifest.source},
      vue:{dir:vueDir,manifest:vueDir+'.json',checkout:vueManifest.checkout,source:vueManifest.source}});
    function response(page,route,method='GET',predicate=()=>true){
      const waiting=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1'+route&&r.request().method()===method&&predicate(r),{timeout:14000});
      waiting.catch(()=>{});
      return waiting;
    }
    async function enter(surface,role,id,kind,api){
      const route=surface==='app'?'/notices/record?recordId='+id:'/notices/'+(kind==='support'?'support':'submissions')+'/'+id;
      const p=roles[role],page=await browser.actor(surface,role,route,{anonymous:true});
      activePage=page;
      const challenge=response(page,'/auth/sms-challenges','POST');
      if(surface==='app'){
        await page.getByRole('button',{name:'前往账号与身份',exact:true}).click();
        const phone=page.getByRole('textbox',{name:/手机号/});
        await phone.click();await page.keyboard.insertText(original.accounts[role].phone);await phone.press('Tab');
        await page.getByRole('button',{name:'获取验证码',exact:true}).click();
      }else{
        await page.getByTestId('phone-input').fill(original.accounts[role].phone);
        assert.equal(new URL(page.url()).searchParams.get('redirect'),route);
        await page.getByTestId('send-code').click();
      }
      const ch=await challenge;
      assert.equal(ch.status(),200);
      const code=codes.get((await ch.json()).data.challenge_id);
      assert.match(code,/^\d{6}$/);
      if(surface==='app'){
        await page.getByRole('button',{name:/获取验证码.*重新获取/}).waitFor();
        const input=page.getByRole('textbox',{name:/验证码/});
        await input.click();
        await page.keyboard.press('ControlOrMeta+A');
        await page.keyboard.insertText(code);
        if(await input.inputValue()!==code){
          await input.click();
          await page.keyboard.press('ControlOrMeta+A');
          await input.pressSequentially(code,{delay:50});
        }
        assert(await input.inputValue()===code,'Verification digits did not reach the Flutter field');
        await input.press('Tab');
        const agreement=page.getByRole('checkbox',{name:/同意用户协议与隐私政策/});
        const bounds=await agreement.boundingBox();
        assert(bounds);
        await page.mouse.click(bounds.x+Math.min(24,bounds.width/2),bounds.y+bounds.height/2);
        await agreement.and(page.locator('[aria-checked=true]')).waitFor();
      }else await page.getByTestId('code-input').fill(code);
      const login=response(page,'/auth/sessions','POST');
      const loaded=response(page,'/notices/records/'+id,'GET',r=>r.status()===api.status);
      await (surface==='app'?page.getByRole('button',{name:'登录并继续',exact:true}):page.getByTestId('submit-login')).click();
      const s=await login;
      assert.equal(s.status(),200);
      assert.equal((await s.json()).data.account.id,p.account_id);
      const r=await loaded;
      if(r.status()===200){
        const row=(await r.json()).data;
        assert.equal(row.id,id);
        assert.equal(row.content_sha256,api.data.content_sha256);
      }
      assert.equal(surface==='app'?new URL(page.url()).hash:'#'+new URL(page.url()).pathname+new URL(page.url()).search,'#'+route);
      e.checks.push({surface,role,kind,id,http:r.status(),same_original:true});
      await save();
      await page.context().close();
      activePage=null;
    }
    for(const c of candidates.filter(c=>c.kind===requestedKind)){
      const isOps=requestedSurface==='vue'&&requestedKind==='support';
      const owner=await probe(isOps?'notices_reviewer':'notices_seller','/notices/records/'+c.id);
      const peer=isOps?owner:await probe('notices_buyer2','/notices/records/'+c.id);
      const outsider=await probe('auditions_outsider','/notices/records/'+c.id);
      assert([403,404].includes(outsider.status));
      const role=isOps?'notices_reviewer':owner.status===200?'notices_seller':'notices_buyer2';
      const verdict=isOps||role==='notices_seller'?owner:peer;
      if(verdict.status!==200){e.checks.push({kind:c.kind,id:c.id,original_not_accessible_after_withdrawal:true});continue;}
      await enter(requestedSurface,role,c.id,c.kind,verdict);
      await enter(requestedSurface,'auditions_outsider',c.id,c.kind,outsider);
    }
    e.original_invitation_found=invites.length>0;
    e.result=e.checks.some(x=>x.same_original)?'PASS':'PARTIAL';
  }catch(error){
    e.result='FAIL';e.failure=error.message;
    if(activePage){
      const aria=await activePage.locator('body').ariaSnapshot({timeout:1800}).catch(()=>'');
      await fs.writeFile(path.join(out,'failure.aria.txt'),aria.replace(/(?<!\d)\d{6,11}(?!\d)/g,'[NUM]'));
    }
    throw error;
  }finally{
    try{
      await browser?.close();
      if(server){server.closeAllConnections();await new Promise(ok=>server.close(ok));}
      await clone?.close();
    }finally{e.finished_at=new Date().toISOString();await save();}
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
