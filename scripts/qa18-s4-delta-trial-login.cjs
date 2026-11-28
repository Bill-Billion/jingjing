'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {cloneRecords,load,root,read}=require('./test-fixtures/qa18-s4-delta-clone.cjs');
const {openBrowser,vueArtifact}=require('./test-fixtures/qa18-s4-artifact-browser.cjs');

const source='jx_test_stock_pm03_bc0dc2acab3d0887a8f10285';
const booking='d5c18e8c-ec4a-434c-857e-694757e95316';
const order='1ca81699-247e-446a-883a-0bb54441f8b9';
const out=path.resolve(process.argv[2]||'');
const surface=process.argv[3];
const fixedVue=process.argv[4];
const cityMode=process.argv[5]==='city';
const offerMode=process.argv[5]==='offer';
const offer='63cbd645-a01f-44e2-a1a0-c9554a38a232';
const recordId=offerMode?offer:booking;
const appNow='5902677d92ec11423dab0fa732ef28559ad7c4f0';
const originalBuild='e887301530c24f9751e074cd297535c3aac7cdb9';
const originalProduct='053168fb6e06b80680101702a733357309368809';

async function main(){
  assert(['app','vue'].includes(surface));
  assert(out.startsWith(path.join(root,'.local/qa18')+path.sep));
  const directory=path.join(root,'.local/stock-sandbox',source);
  const original=await read(path.join(directory,'access.json'));
  const evidence={surface,booking,order,offer:offerMode?offer:undefined,product:originalProduct,started_at:new Date().toISOString(),browser_requests:[],checks:[]};
  await fs.mkdir(out,{recursive:true});
  const save=()=>fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify(evidence,null,2)+'\n');
  let clone,server,browser;
  try{
    const buyers=cityMode?['auditions_buyer']:offerMode?['auditions_seller','auditions_buyer2']:['auditions_buyer','auditions_buyer2'];
    clone=await cloneRecords({source,directory,out,actors:buyers,proof:evidence,restoreFiles:false});
    const {db,roles,secret}=clone;
    const authorizedPhones=new Set(buyers.map(r=>original.accounts[r].phone));
    assert.equal(authorizedPhones.size,buyers.length);
    const security=load('src/modules/auth/security').createSecurity(secret);
    for(const role of buyers){
      const phone=original.accounts[role].phone;
      assert.match(phone,/^1[3-9]\d{9}$/);
      // Bind only original synthetic actors in this separate QA database to the new
      // isolated auth HMAC. The actual challenge and session go through product HTTP.
      const [previousBinding]=await db.execute('UPDATE auth_subjects SET account_id=NULL WHERE account_id=?',[roles[role].account_id]);
      assert.equal(previousBinding.affectedRows,1);
      await db.execute('INSERT INTO auth_subjects(phone_hash,account_id) VALUES(?,?)',
        [security.digest('phone',phone),roles[role].account_id]);
    }
    const codes=new Map();
    const sms={async call(method,{phone,code},{request_id}){
      assert.equal(method,'send');
      assert(authorizedPhones.has(phone));
      assert.match(code,/^\d{6}$/);
      assert(!codes.has(request_id));
      codes.set(request_id,code);
      return {accepted:true};
    }};
    server=load('src/http/account-api').createAccountApi({db,secret,sms}).listen(0,'127.0.0.1');
    await new Promise((ok,fail)=>{server.once('listening',ok);server.once('error',fail);});
    const base='http://127.0.0.1:'+server.address().port+'/api/v1';
    const currentBuilds=path.join(path.dirname(out),'builds');
    const app=offerMode?{dir:path.join(root,'晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/build/s4-a-esign-normal03'),
      manifest:path.join(currentBuilds,'app-normal.json'),checkout:appNow,source:appNow}
      :{dir:path.join(root,'晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/build/s4-a2-normal-web'),
      manifest:path.join(root,'.local/qa18/s4-a2-20261127/APP_NORMAL_BUILD_MANIFEST.json'),checkout:originalBuild,source:originalProduct};
    const vue=offerMode?{dir:path.join(currentBuilds,'vue-stock'),manifest:path.join(currentBuilds,'vue-stock.json'),checkout:fixedVue,source:fixedVue}:vueArtifact(out,fixedVue);
    browser=await openBrowser(base,roles,evidence,{app,vue});
    const city='上海';
    const target=cityMode?'/auditions/catalog?city='+encodeURIComponent(city):offerMode?(surface==='app'?'/auditions/offer?offerId='+offer:'/auditions/offers/'+offer):surface==='app'?'/auditions/action?bookingId='+booking+'&action=support':'/auditions/bookings/'+booking+'?action=receipt';
    function response(page,url,method){const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1'+url&&r.request().method()===method,{timeout:12000});pending.catch(()=>{});return pending;}
    async function fillFlutter(page,field,text){
      await field.click();
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.insertText(text);
      assert.equal(await field.inputValue(),text);
      await page.keyboard.press('Tab');
    }
    for(const role of buyers){
      const page=await browser.actor(surface,role,target,{anonymous:true});
      try{
        const phone=original.accounts[role].phone;
        if(surface==='app'){
          const field=page.getByRole('textbox',{name:/手机号/});
          await page.getByRole('button',{name:'前往账号与身份',exact:true}).click();
          const entry=page.getByRole('button',{name:'手机号登录',exact:true});
          if(!await field.isVisible())await entry.click();
          await fillFlutter(page,field,phone);
        }else{
          await page.getByTestId('phone-input').waitFor();
          assert.equal(new URL(page.url()).searchParams.get('redirect'),target);
          await page.getByTestId('phone-input').fill(phone);
        }
        assert(!evidence.browser_requests.some(r=>r.role===role&&r.path==='/api/v1/auditions/records/'+recordId&&r.status===200));
        const challenge=response(page,'/auth/sms-challenges','POST');
        await (surface==='app'?page.getByRole('button',{name:'获取验证码',exact:true}):page.getByTestId('send-code')).click();
        const issued=await challenge;
        assert.equal(issued.status(),200);
        const code=codes.get((await issued.json()).data.challenge_id);
        assert(code,'Fixture SMS must capture a real generated code');
        if(surface==='app'){
          const verification=page.getByRole('textbox',{name:/验证码/});
          await fillFlutter(page,verification,code);
          const agreement=page.getByRole('checkbox',{name:/同意用户协议与隐私政策/});
          const bounds=await agreement.boundingBox();
          assert(bounds);
          await page.mouse.click(bounds.x+Math.min(24,bounds.width/2),bounds.y+bounds.height/2);
          await agreement.and(page.locator('[aria-checked=true]')).waitFor();
        }else await page.getByTestId('code-input').fill(code);
        const readback=response(page,cityMode?'/auditions/catalog':'/auditions/records/'+recordId,'GET');
        const session=response(page,'/auth/sessions','POST');
        await (surface==='app'?page.getByRole('button',{name:'登录并继续',exact:true}):page.getByTestId('submit-login')).click();
        const loggedIn=await session;
        assert.equal(loggedIn.status(),200);
        assert.equal((await loggedIn.json()).data.account.id,roles[role].account_id);
        if(surface==='vue'){
          if(cityMode){
            await page.waitForURL(u=>u.pathname!=='/login');
            evidence.after_login={path:new URL(page.url()).pathname,expected:target};
            assert.equal(new URL(page.url()).pathname+new URL(page.url()).search,target);
          }else await page.waitForURL(u=>u.pathname+u.search===target);
          const selector=page.getByRole('combobox',{name:/选择.*身份|代表谁/}).first();
          if(await selector.isVisible())await selector.selectOption(roles[role].party_id);
        }
        const loaded=await readback;
        const allowed=role===buyers[0];
        assert.equal(loaded.status(),allowed?200:404);
        if(cityMode){
          assert.equal(new URL(loaded.url()).searchParams.get('city'),city);
        }else if(allowed){
          const row=(await loaded.json()).data;
          assert.equal(row.id,recordId);
          assert.equal(row.current_status,offerMode?'PUBLISHED':'FULFILLED');
        }
        if(surface==='app')assert.equal(new URL(page.url()).hash,'#'+target);
        evidence.checks.push({role,anonymous_route_recovered:target,http:loaded.status(),normal_local_session:true,status:cityMode?'CITY_FILTER_PRESERVED':allowed?(offerMode?'PUBLISHED':'FULFILLED'):'DENIED'});
      }catch(error){
        const snapshot=await page.locator('body').ariaSnapshot({timeout:1500}).catch(()=>'');
        const redacted=snapshot.replace(/1[3-9]\d{9}/g,'[PHONE]').replace(/(?<![a-f0-9])\d{6}(?![a-f0-9])/g,'[CODE]');
        await fs.writeFile(path.join(out,role+'.aria.txt'),redacted);
        throw error;
      }finally{await page.context().close();}
    }
    const writes=evidence.browser_requests.filter(r=>r.method!=='GET');
    assert(writes.every(r=>['/api/v1/auth/sms-challenges','/api/v1/auth/sessions'].includes(r.path)));
    evidence.result='PASS';
    console.log('PASS product login resumes the original registered destination and rejects an unrelated private reader');
  }catch(error){evidence.result='FAIL';evidence.failure=error.message.replace(/1[3-9]\d{9}/g,'[PHONE]');throw new Error(evidence.failure);}
  finally{
    try{
      await browser?.close();
      if(server){server.closeAllConnections();await new Promise(ok=>server.close(ok));}
      await clone?.close();
    }catch(error){evidence.result='FAIL';evidence.cleanup_failure=error.message;throw error;}
    finally{evidence.finished_at=new Date().toISOString();await save();}
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
