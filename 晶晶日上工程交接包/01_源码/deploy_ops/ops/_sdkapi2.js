const root = 'C:/Users/user/Doubao/chats/2026-08-24/new-chat-3/work/server/server/node_modules/@alicloud/';
const ca = require(root + 'cloudauth20200618');
const C = ca.default || ca.Client;
console.log('=== ALL cloudauth methods ===');
console.log(Object.getOwnPropertyNames(C.prototype).filter(n=>n!=='constructor'&&!n.endsWith('WithOptions')).sort().join('\n'));
const fs=require('fs'),path=require('path');
const dir=root+'cloudauth20200618';
function walk(d){let r=[];for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())r=r.concat(walk(p));else if(/\.d\.ts$/.test(e.name))r.push(p);}return r;}
const dts=walk(dir);
console.log('\n=== d.ts files ===', dts.map(d=>d.replace(dir,'')).join(', '));
for(const f of dts){const t=fs.readFileSync(f,'utf8');const lines=t.split('\n');lines.forEach((l,i)=>{if(/Id2|Meta|Element|initSmartVerify|describeSmartVerify|SmartVerifyRequest|Certify|VerifyResult/i.test(l)&&/public |\w+\(.*\).*Promise|class |interface |Meta|Id2/.test(l)){/*noop*/}});}
// 找身份证二要素相关定义
const joined = dts.map(f=>fs.readFileSync(f,'utf8')).join('\n');
['Id2MetaVerify','Id2','MetaVerify','ElementVerify','elementSmartVerify','initSmartVerify(','describeSmartVerify('].forEach(k=>{const idx=joined.indexOf(k);console.log(`\n--- "${k}" firstIdx=${idx}`);if(idx>=0)console.log(joined.slice(idx,idx+400).replace(/\s+/g,' '));});
