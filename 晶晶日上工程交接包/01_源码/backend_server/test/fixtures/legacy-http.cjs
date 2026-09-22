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
 const loadedRoutes=new Set(),cache=new Map();
 function lazy(name,create) {if(!cache.has(name))cache.set(name,create());return cache.get(name);}
 const getPayment=()=>lazy('paymentService',()=>load('services/paymentService.js'));
 const deliveryDeps={'../utils/idempotent':{withLock:bump},'../utils/consent':{recordConsent:bump},'../utils/deposit':{checkDepositSufficient:bump,collectDepositFromIncome:bump},'./review':{submitReview:bump},'../middleware/rateLimit':{createOrder:(req,res,next)=>next()}};
 const definitions={samples:()=>load('routes/samples.js'),identity:()=>load('routes/identity.js'),
  payment:()=>load('routes/payment.js',{'../services/paymentService':getPayment(),'../services/providers/appleIap':{verifyReceipt:bump}}),
  pay:()=>load('routes/pay.js'),settlement:()=>load('routes/settlement.js'),face:()=>load('routes/faceverify.js'),
  scripts:()=>load('routes/scripts.js'),mcn:()=>load('routes/mcn.js'),videos:()=>load('routes/videos.js',deliveryDeps),endorsement:()=>load('routes/endorsement.js',deliveryDeps)};
 function router(name) {return lazy(name,()=>{const result=definitions[name]();loadedRoutes.add(name);return result;});}
 const app=express();app.use(express.json());app.use(express.urlencoded({extended:false}));
 for(const name of Object.keys(definitions))app.use('/'+name,(req,res,next)=>router(name)(req,res,next));
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
 return {db,request,get payment(){return getPayment();},alipay,idVerify,get videos(){return router('videos');},loadedRoutes:()=>[...loadedRoutes],upstream:()=>upstream};
}
module.exports={fixture};
