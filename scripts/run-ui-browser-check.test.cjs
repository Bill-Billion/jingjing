 'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net');
const {runSession}=require('./run-ui-browser-check.cjs');
const fixture=path.join(__dirname,'test-fixtures/ui-session.cjs');
async function port() {const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
async function options(t,changes={}) {
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'jx-ui-session-'));
 t.after(()=>{assert.equal(path.dirname(folder),os.tmpdir());assert(path.basename(folder).startsWith('jx-ui-session-'));fs.rmSync(folder,{recursive:true,force:true});});
 const apiUrl=`http://127.0.0.1:${await port()}`,webUrl=`http://127.0.0.1:${await port()}`,statePath=path.join(folder,'state.json');
 const child=args=>({file:fixture,args});
 return {apiUrl,webUrl,statePath,logDir:folder,timeoutMs:2000,checkTimeoutMs:2000,
  api:child(['api',apiUrl,statePath]),web:child(['web',webUrl,statePath,apiUrl]),check:child(['check',webUrl]),...changes};
}
async function isFree(url) {const s=net.createServer();await new Promise((r,j)=>{s.once('error',j);s.listen(Number(new URL(url).port),'127.0.0.1',r);});await new Promise(r=>s.close(r));}
test('完整检查后关闭实际进程，下一组可复用同一网页端口',async t=>{
 const a=await options(t);await runSession(a);await isFree(a.apiUrl);await isFree(a.webUrl);
 const b=await options(t);b.webUrl=a.webUrl;b.web.args[1]=a.webUrl;b.check.args[1]=a.webUrl;
 await runSession(b);await isFree(b.apiUrl);await isFree(b.webUrl);
});
test('浏览器检查失败仍清理两个服务',async t=>{
 const a=await options(t);a.check.args=['fail'];await assert.rejects(runSession(a),/BROWSER_CHECK_FAILED/);await isFree(a.apiUrl);await isFree(a.webUrl);
});
test('网页提前退出立即报错，不误把旧服务当新服务',async t=>{
 const a=await options(t);a.web.args=['exit'];await assert.rejects(runSession(a),/TEST_SERVICE_EXITED_BEFORE_READY/);await isFree(a.apiUrl);
});
test('网页代理不能访问后端时不启动浏览器检查',async t=>{
 const a=await options(t);a.web.args[0]='wrong-proxy';await assert.rejects(runSession(a),/TEST_PROXY_READINESS_TIMEOUT/);assert(!fs.existsSync(path.join(a.logDir,'check.log')));await isFree(a.apiUrl);await isFree(a.webUrl);
});
test('端口被其他进程使用时拒绝启动且不杀该进程',async t=>{
 const a=await options(t);const s=net.createServer();await new Promise(r=>s.listen(Number(new URL(a.webUrl).port),'127.0.0.1',r));
 try{await assert.rejects(runSession(a),/TEST_PORT_ALREADY_IN_USE/);assert(s.listening);assert(!fs.existsSync(a.statePath));}finally{await new Promise(r=>s.close(r));}
});
test('已有运行状态不覆盖，避免使用陈旧测试身份',async t=>{
 const a=await options(t);fs.writeFileSync(a.statePath,'preserve');await assert.rejects(runSession(a),/STALE_TEST_STATE_REFUSED/);assert.equal(fs.readFileSync(a.statePath,'utf8'),'preserve');
});
