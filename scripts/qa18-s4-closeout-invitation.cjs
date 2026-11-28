'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID,randomBytes}=require('node:crypto');
const {load,root,read,hash}=require('./test-fixtures/qa18-s4-delta-clone.cjs');
const {openBrowser}=require('./test-fixtures/qa18-s4-artifact-browser.cjs');
const {seedInvitation}=require('./test-fixtures/qa18-closeout-invitation.cjs');

const lab=path.join(root,'.local/qa18/s4-a-closeout-20261128');
const out=path.resolve(process.argv[2]||'');

async function main(){
  assert(out.startsWith(lab+path.sep));
  await fs.mkdir(out,{recursive:true});
  await fs.writeFile(path.join(out,'RUN_ONCE'),'one reviewed invitation across normal App and Vue login',{flag:'wx'});
  const e={started_at:new Date().toISOString(),requests:[],browser_requests:[],checks:[]};
  const save=()=>fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify(e,null,2)+'\n');
  const env=await read(process.env.JX_MYSQL_TEST_ENV_FILE);
  for(const [k,v] of Object.entries({NODE_ENV:'test',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
  const mysql=load('node_modules/mysql2/promise');
  const control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});
  const name='jx_test_qa18_inv_'+randomBytes(10).toString('hex');
  let db,browser,server,page,created=false;
  try{
    await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');
    created=true;
    db=await load('src/infrastructure/database').openDatabase({...env,MYSQL_DATABASE:name});
    await load('src/infrastructure/database/migrator').migrate(db);
    e.database=name;
    const {S,body,listing,publicConsent}=await seedInvitation(db);
    const actors={buyer:S.buyer,seller:S.seller,primaryOutsider:S.buyer2,secondaryOutsider:S.outsider,reviewer:S.reviewer};
    const roles=Object.fromEntries(Object.entries(actors).map(([name,actor])=>[name,
      {account_id:actor.account_id,party_id:actor.personal_party_id,bearer_token:actor.token}]));
    const security=load('src/modules/auth/security').createSecurity(S.secret);
    const byPhone=new Map();
    const codes=new Map();
    const phones={};
    for(const [i,role] of ['buyer','seller','primaryOutsider','secondaryOutsider'].entries()){
      // Test numbers are accepted by the loopback SMS fixture only.
      const phone='19900000'+String(700+i).padStart(3,'0');
      phones[role]=phone;
      byPhone.set(phone,role);
      await db.execute('INSERT INTO auth_subjects(phone_hash,account_id) VALUES (?,?)',
        [security.digest('phone',phone),roles[role].account_id]);
    }
    const sms={async call(method,{phone,code},{request_id}){
      assert(method==='send'&&byPhone.has(phone));
      codes.set(request_id,code);
      return {accepted:true};
    }};
    server=load('src/http/account-api').createAccountApi({db,secret:S.secret,sms,supplyStorageFactory:S.storageFactory}).listen(0,'127.0.0.1');
    await new Promise((ok,fail)=>{server.once('listening',ok);server.once('error',fail);});
    const api='http://127.0.0.1:'+server.address().port+'/api/v1';
    async function actual(role,uri,{body,version,party=role!=='reviewer',status=200}={}){
      const r=await fetch(api+uri,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+roles[role].bearer_token,
        ...party?{'X-Acting-Party':roles[role].party_id}:{},...body?{'Idempotency-Key':randomUUID(),'Content-Type':'application/json'}:{},
        ...version?{'If-Match':'"'+version+'"'}:{}},...body?{body:JSON.stringify(body)}:{},signal:AbortSignal.timeout(10000)});
      const raw=Buffer.from(await r.arrayBuffer()),j=JSON.parse(raw);
      e.requests.push({role,uri,http:r.status,code:j.error?.code,sha256:hash(raw)});
      await save();
      assert.equal(r.status,status,uri+' '+j.error?.code);
      return j.data||j.error;
    }
    const payload={rule_id:S.rule.id,submission:body};
    let invitation=await actual('buyer','/notices/submissions',{body:payload});
    assert.equal(invitation.current_status,'IN_REVIEW');
    const endpoint='/notices/records/'+invitation.id;
    invitation=await actual('reviewer',endpoint+'/reviews',{version:invitation.object_version,body:{decision:'APPROVE',
      reason:'隔离独立核对邀约正文、公开来源与联系方式限制',
      checks:{content_reviewed:true,materials_reviewed:true,no_private_contact:true}}});
    assert.equal(invitation.current_status,'SENT');
    assert.equal(invitation.data.submission.source_listing_id,listing.id);
    e.business={invitation:invitation.id,listing:listing.id,consent:publicConsent.id};

    const appDir=path.join(lab,'app-normal-fix'),vueDir=path.join(root,'.local/qa18/s4-a-remaining-20261128/builds/vue-stock');
    async function build(dir){const m=await read(dir+'.json');return {dir,manifest:dir+'.json',checkout:m.checkout,source:m.source};}
    browser=await openBrowser(api,roles,e,{app:await build(appDir),vue:await build(vueDir)});
    function received(p,uri,method){
      const pending=p.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1'+uri&&r.request().method()===method,{timeout:14000});
      pending.catch(()=>{});
      return pending;
    }
    for(const [surface,role,expected] of [['app','seller',200],['vue','buyer',200],['app','primaryOutsider',404],['vue','secondaryOutsider',404]]){
      const target=surface==='app'?'/notices/record?recordId='+invitation.id:'/notices/submissions/'+invitation.id;
      page=await browser.actor(surface,role,target,{anonymous:true});
      const issued=received(page,'/auth/sms-challenges','POST');
      if(surface==='app'){
        await page.getByRole('button',{name:'前往账号与身份',exact:true}).click();
        const field=page.getByRole('textbox',{name:/手机号/});
        await field.click();
        await page.keyboard.insertText(phones[role]);
        await field.press('Tab');
        await page.getByRole('button',{name:'获取验证码',exact:true}).click();
      }else{
        await page.getByTestId('phone-input').fill(phones[role]);
        assert.equal(new URL(page.url()).searchParams.get('redirect'),target);
        await page.getByTestId('send-code').click();
      }
      const challenge=await issued;
      assert.equal(challenge.status(),200);
      const otp=codes.get((await challenge.json()).data.challenge_id);
      assert.match(otp,/^\d{6}$/);
      if(surface==='app'){
        await page.getByRole('button',{name:/获取验证码.*重新获取/}).waitFor();
        const field=page.getByRole('textbox',{name:/验证码/});
        await field.click();await page.keyboard.press('ControlOrMeta+A');await page.keyboard.insertText(otp);
        if(await field.inputValue()!==otp){
          await field.click();await page.keyboard.press('ControlOrMeta+A');await field.pressSequentially(otp,{delay:50});
        }
        assert(await field.inputValue()===otp,'Flutter verification control did not receive the code');
        await field.press('Tab');
        const consent=page.getByRole('checkbox',{name:/同意用户协议与隐私政策/});
        const area=await consent.boundingBox();
        assert(area);
        await page.mouse.click(area.x+Math.min(24,area.width/2),area.y+area.height/2);
        await consent.and(page.locator('[aria-checked=true]')).waitFor();
      }else await page.getByTestId('code-input').fill(otp);
      const login=received(page,'/auth/sessions','POST'),detail=received(page,endpoint,'GET');
      await (surface==='app'?page.getByRole('button',{name:'登录并继续',exact:true}):page.getByTestId('submit-login')).click();
      const session=await login;
      assert.equal(session.status(),200);
      assert.equal((await session.json()).data.account.id,roles[role].account_id);
      const r=await detail;
      assert.equal(r.status(),expected);
      if(expected===200){
        const row=(await r.json()).data;
        assert.equal(row.id,invitation.id);
        assert.equal(row.content_sha256,invitation.content_sha256);
      }
      const u=new URL(page.url());
      assert.equal(surface==='app'?u.hash:'#'+u.pathname+u.search,'#'+target);
      e.checks.push({surface,role,result:expected,same_reviewed_invitation:invitation.id});
      await page.context().close();
    }
    const missing=await actual('buyer','/notices/submissions',{
      body:{...payload,submission:{...body,source_listing_id:randomUUID()}},status:404});
    assert.equal(missing.code,'ARTIST_NOT_FOUND');
    const withdrawn=await actual('seller','/artists/people/'+S.seller.person.id+'/records/'+publicConsent.id+'/withdrawals',
      {body:{reason:'隔离合成权利人撤回公开邀约来源'},version:publicConsent.object_version});
    assert.equal(withdrawn.current_status,'WITHDRAWN');
    const unavailable=await actual('buyer','/notices/submissions',{body:payload,status:409});
    assert.equal(unavailable.code,'ARTIST_CONSENT_REQUIRED');
    e.checks.push({original_listing:listing.id,consent_withdrawn:true,real_new_invitation_denied:true});
    const [[record]]=await db.execute("SELECT COUNT(*) n FROM notice_records WHERE kind='SUBMISSION'");
    assert.equal(Number(record.n),1);
    e.result='PASS';
  }catch(error){
    e.result='FAIL';e.failure=error.message;
    if(page)await fs.writeFile(path.join(out,'FAILURE.aria.txt'),(await page.locator('body').ariaSnapshot().catch(()=>'')).replace(/(?<!\d)\d{5,11}(?!\d)/g,'[NUM]'));
    throw error;
  }finally{
    try{
      await browser?.close();
      if(server){server.closeAllConnections();await new Promise(ok=>server.close(ok));}
      await db?.close();
      if(created&&/^jx_test_qa18_inv_[a-f0-9]{20}$/.test(name))await control.query('DROP DATABASE '+mysql.escapeId(name));
    }finally{await control.end();e.finished_at=new Date().toISOString();await save();}
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
