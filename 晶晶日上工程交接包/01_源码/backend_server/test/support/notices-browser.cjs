'use strict';
// Optional real Vue surface for the SAME ordinary-notice integration database.
// Invitations, payment observations, uploads and independent review remain API/fixture steps.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {createRequire}=require('node:module'),{pathToFileURL}=require('node:url'),{execFileSync}=require('node:child_process');
async function start({base,buyer,fixtures}){
 const root=path.resolve(__dirname,'../../../../..'),webRoot=path.join(root,'晶晶日上工程交接包/01_源码/frontend_ops_workspace'),wr=createRequire(path.join(webRoot,'package.json'));
 const out=path.join(root,'.local/pm01-w14-browser');await fs.mkdir(out,{recursive:true});
 const {preview}=await import(pathToFileURL(wr.resolve('vite'))),{chromium}=wr('playwright-core');
 let web,browser,page,completed=false;const checks=[],errors=[];
 async function close(){
  await browser?.close();if(web)await new Promise(r=>web.httpServer.close(r));
  await fs.writeFile(path.join(out,'result.json'),JSON.stringify({completed,checks,errors,synthetic_only:true,finished_at:new Date().toISOString(),limits:['Same notice/order/project; browser customer preview, stage acceptance and download only','Prerequisites, uploads and independent review use HTTP/helpers; payment receipts simulated','Generated color video verifies playback bytes, not commercial branding or creative quality; no native/live service']},null,2));
 }
 try{
  web=await preview({root:webRoot,configFile:false,preview:{host:'127.0.0.1',port:5330,strictPort:true,proxy:{'/api':{target:new URL(base).origin}}}});
  browser=await chromium.launch({headless:true,...process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}});
  const c=await browser.newContext({viewport:{width:1280,height:1000},acceptDownloads:true});
  await c.addInitScript(({token,party})=>{sessionStorage.setItem('ops.session.token',token);sessionStorage.setItem('ops.session.selected',party)},{token:buyer.token,party:buyer.personal_party_id});
  page=await c.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  const video=path.join(out,'synthetic.mp4');
  execFileSync(process.env.JX_TEST_FFMPEG||'ffmpeg',['-y','-f','lavfi','-i','color=c=blue:s=160x120:d=1','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',video],{stdio:'ignore',windowsHide:true});
  const media=await fs.readFile(video);
  execFileSync(process.env.JX_TEST_FFMPEG||'ffmpeg',['-y','-f','lavfi','-i','color=c=green:s=160x120:d=1','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',video],{stdio:'ignore',windowsHide:true});
  const previewMedia=await fs.readFile(video);
  const goto=async url=>{await page.goto('http://127.0.0.1:5330'+url);await page.waitForLoadState('networkidle');};
  return {
   media,previewMedia,
   async accept(version){
    await goto('/production/versions/'+version.id);await page.getByTestId('production-read-preview').click();
    if(version.data.stage==='SCRIPT')await page.locator('.production-text-preview').waitFor();else await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);
    for(const check of version.data.stage==='SCRIPT'?['script']:['script','specification','audio','branding'])await page.getByTestId('production-check-'+check).check();
    await page.getByTestId('production-feedback-decision').selectOption('ACCEPT');await page.getByTestId('production-feedback-note').fill('Synthetic customer acceptance, no real quality certification');
    const wait=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname.endsWith('/feedback'));
    await page.getByTestId('production-feedback-submit').click();const response=await wait,value=await response.json();assert.equal(response.status(),200,JSON.stringify(value));
    fixtures.push({method:'POST',path:new URL(response.url()).pathname,schema:'ProductionRecordResponse',value});
    await page.waitForLoadState('networkidle');await page.screenshot({path:path.join(out,version.data.stage+'.png'),fullPage:true});
    checks.push({stage:version.data.stage,version_id:version.id,project_id:version.project_id,result:'PASS'});
   },
   async download(id,expected){
    await goto('/production/versions/'+id);assert.equal(await page.getByTestId('production-download-final').isDisabled(),false);
    const wait=page.waitForEvent('download');await page.getByTestId('production-download-final').click();const download=await wait;
    assert.equal(await download.failure(),null);assert.deepEqual(await fs.readFile(await download.path()),expected);checks.push({name:'same-final-browser-download',version_id:id,result:'PASS'});
   },
   async refunded(id){
    await goto('/production/versions/'+id);assert.equal(await page.getByTestId('production-download-final').isDisabled(),true);
    assert.deepEqual(errors,[]);checks.push({name:'same-final-refunded-disabled',version_id:id,result:'PASS'});completed=true;
    await page.screenshot({path:path.join(out,'refunded.png'),fullPage:true});
   },
   close
  };
 }catch(e){errors.push(e.message);await close();throw e;}
}
module.exports={start};
