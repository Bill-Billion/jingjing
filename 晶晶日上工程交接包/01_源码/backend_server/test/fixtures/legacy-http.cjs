'use strict';
// Synthetic SQLite and provider doubles only; HTTP/JWT/SQL/routers are real.
process.env.NODE_ENV='test';process.env.JWT_SECRET='synthetic-legacy-test-jwt-secret-32-plus';
const Module=require('node:module'),path=require('node:path'),fs=require('node:fs'),http=require('node:http');
const Database=require('better-sqlite3'),express=require('express');
const {runMigrations}=require('../../migrations/runner');
const {signToken}=require('../../middleware/auth');
async function fixture(t) {
 const db=new Database(':memory:');runMigrations(db,{logger:{info(){},warn(){},error(){}}});
 db.prepare('INSERT INTO users(id,nickname) VALUES (?,?)').run(1,'synthetic-owner');db.prepare('INSERT INTO users(id,nickname) VALUES (?,?)').run(2,'synthetic-other');
 let upstream=0;
 const bump=()=>{upstream++;throw Error('Unexpected provider call in safety test');};
 const alipay={isConfigured:()=>true,status:()=>({sandbox:true,missing:[]}),fenToYuan:n=>(n/100).toFixed(2),buildAppOrderString:bump,queryTrade:bump,verifyNotify:bump,notifyAppIdMatch:()=>true,isSuccessTradeStatus:s=>s==='TRADE_SUCCESS'};
 const idVerify={ready:()=>false,providerName:()=> 'synthetic',verifyElement:bump};
 const cryptoStub={encrypt:()=> 'synthetic-ciphertext',decrypt:bump,maskBankCard:()=> '****'};
 function load(relative,overrides={}){
  const filename=path.resolve(__dirname,'../..',relative),realRequire=Module.createRequire(filename),loaded=new Module(filename);
  const deps={'../db':db,'../services/alipay':alipay,'../services/providers/idVerify':idVerify,'../services/providers/faceVerify':{ready:()=>true,initVerify:bump,describeVerify:bump},'../utils/crypto':cryptoStub,'../middleware/rateLimit':{withdraw:(req,res,next)=>next()},...overrides};
  loaded.filename=filename;loaded.require=id=>Object.hasOwn(deps,id)?deps[id]:realRequire(id);loaded._compile(fs.readFileSync(filename,'utf8'),filename);return loaded.exports;
 }
 const payment=load('services/paymentService.js');
 const app=express();app.use(express.json());app.use(express.urlencoded({extended:false}));
 app.use('/samples',load('routes/samples.js'));
 app.use('/identity',load('routes/identity.js'));
 app.use('/payment',load('routes/payment.js',{'../services/paymentService':payment,'../services/providers/appleIap':{verifyReceipt:bump}}));
 app.use('/pay',load('routes/pay.js'));
 app.use('/settlement',load('routes/settlement.js'));
 app.use('/face',load('routes/faceverify.js'));
 app.use((err,req,res,next)=>res.status(500).json({error:'fixture-handler-error'}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();});
 function request(method,url,body={},userId=1,role='user'){
  return new Promise((resolve,reject)=>{
   const bytes=Buffer.from(JSON.stringify(body));const headers={'Content-Type':'application/json','Content-Length':bytes.length};
   if(userId!==null)headers.Authorization='Bearer '+signToken({userId,role});
   const req=http.request({hostname:'127.0.0.1',port:server.address().port,method,path:url,headers},res=>{let raw='';res.on('data',x=>raw+=x);res.on('end',()=>{let data;try{data=JSON.parse(raw);}catch{data=raw;}resolve({status:res.statusCode,body:data});});});req.setTimeout(2000,()=>req.destroy(Error('Local test request timed out')));req.on('error',reject);req.end(bytes);
  });
 }
 return {db,request,payment,alipay,idVerify,upstream:()=>upstream};
}
module.exports={fixture};
