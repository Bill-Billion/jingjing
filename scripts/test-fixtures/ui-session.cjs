 'use strict';
const http=require('node:http'),fs=require('node:fs');
const [role,url,state,upstream]=process.argv.slice(2);
if(role==='exit') process.exit(23);
if(role==='fail') process.exit(24);
if(role==='check') {
  fetch(url+'/health').then(async r=>{if(r.status!==200||(await r.json()).data.current_status!=='UP')process.exitCode=25;}).catch(()=>{process.exitCode=26;});
} else {
 const server=http.createServer(async(req,res)=>{
  if(role==='api') {res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:{current_status:'UP'}}));}
  else if(role==='wrong-proxy') {res.writeHead(502);res.end('wrong upstream');}
  else {try {const r=await fetch(upstream+req.url);res.writeHead(r.status,{'Content-Type':'application/json'});res.end(await r.text());}catch {res.writeHead(502);res.end();}}
 });
 server.listen(Number(new URL(url).port),'127.0.0.1',()=>{
  if(role==='api')fs.writeFileSync(state,JSON.stringify({testOnly:true,apiUrl:url,pid:process.pid}),{flag:'wx'});
 });
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.closeAllConnections();server.close(()=>process.exit(0));});
}
