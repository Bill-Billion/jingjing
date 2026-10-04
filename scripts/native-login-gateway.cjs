// Isolated acceptance entry. No directory listing, administrator API or production DB.
'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const fromBackend=createRequire(path.resolve(__dirname,'../晶晶日上工程交接包/01_源码/backend_server/package.json'));
const express=fromBackend('express'),{authorize}=require('./native-login-policy.cjs');
function gateway({config,accountApp,apkFile,writeEvidence=()=>{}}) {
 const app=express();app.disable('x-powered-by');app.use(express.json({limit:'8kb'}));
 const deny=(res,status)=>res.status(status).json({meta:{request_id:'native-test'},error:{code:'TEST_ACCESS_RESTRICTED',message:'测试入口未开放或请求超出本轮范围',retryable:false,details:[]}});
 app.use((req,res,next)=>{
  res.setHeader('Cache-Control','no-store');
  if(!config.armed||Date.now()>=config.expiresAt)return deny(res,503);
  if(req.method==='GET'&&req.path==='/health')return res.json({testOnly:true,expiresAt:config.expiresAt});
  if(req.method==='GET'&&req.path==='/download'){
   if(!apkFile||!fs.existsSync(apkFile))return deny(res,503);
   return res.download(apkFile,'jingjing-acceptance.apk');
  }
  if(req.method==='GET'&&req.path==='/')return res.type('html').send('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>安卓登录测试</title><h1>晶晶日上 · 安卓测试包</h1><p>仅用于本轮短信登录，不是正式发布版本。</p><p><a href="/download">下载安卓测试包</a></p><p>安装后输入已约定的测试手机号；验证码只填在App里，不发到聊天。本轮最多2条短信，请勿连续重新申请。</p><p>完成后反馈：能否安装、收到短信、进入“我的”、退出后能否恢复登录页。</p></html>');
  const decision=authorize(config,{method:req.method,path:req.path,body:req.body});
  if(decision!==200)return deny(res,decision);
  res.once('finish',()=>writeEvidence({at:new Date().toISOString(),method:req.method,path:req.path,status:res.statusCode}));
  next();
 });
 app.use(accountApp);app.use((_e,_req,res,_next)=>deny(res,400));return http.createServer(app);
}
module.exports={gateway};
