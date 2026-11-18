'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module'),path=require('node:path'),fs=require('node:fs');
const express=require('express');
test('legacy customer video generation cannot call a paid provider even with a valid login',async t=>{
 let calls=0;const bump=()=>{calls++;throw Error('UPSTREAM_FORBIDDEN');};
 const filename=path.resolve(__dirname,'../routes/ai.js'),m=new Module(filename),real=Module.createRequire(filename);
 const services=new Proxy({},{get:()=>bump});
 m.filename=filename;m.require=id=>id.startsWith('../services/')?services:id==='../middleware/auth'?{optionalAuth:(req,res,next)=>{req.userId=7;next();}}:real(id);
 m._compile(fs.readFileSync(filename,'utf8'),filename);
 const app=express();app.use(express.json());app.use('/api/ai',m.exports);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 for(const body of [{type:'t2v',prompt:'Synthetic test'}, {type:'i2v',imageUrl:'https://example.invalid/private.jpg',prompt:'Synthetic test'}]){
  const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/ai/video',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal(r.status,410);const v=await r.json();assert.equal(v.code,'MANUAL_PRODUCTION_REQUIRED');assert.equal(v.task,undefined);
 }
 assert.equal(calls,0);
});
