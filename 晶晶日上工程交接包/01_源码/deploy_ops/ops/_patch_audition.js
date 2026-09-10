const fs=require('fs');
const f='C:/Users/user/Doubao/chats/2026-08-24/new-chat-3/work/app/jingjingshangri_app/lib/pages/audition/audition_page.dart';
let t=fs.readFileSync(f,'utf8');
const reps=[
  ['演示环境：正式版将在此进行眨眼/转头活体检测',
   '当前为离线演示；正式授权签署时，服务端将以阿里云实人核身结论为准'],
  ['演示环境：真人验证通过（正式版以活体SDK结果为准）',
   '真人验证步骤完成（离线演示；正式签署以服务端阿里云核身为准）'],
  ['// 演示版真人验证（正式版需接入持牌活体 SDK，此处仅做流程演示，不采集生物特征）',
   '// 真人验证步骤：后端已接入阿里云实人核身（/api/face-verify + /api/compliance/sign 服务端复验）；\n  // 未配置云端凭证/向导内暂无照片URL时走离线演示，最终是否可签署授权由服务端核身结论强制判定'],
];
let n=0;
for(const [a,b] of reps){ if(t.includes(a)){ t=t.split(a).join(b); n++; } else console.log('MISS:',a.slice(0,20)); }
fs.writeFileSync(f,t,'utf8');
console.log('replaced',n,'/',reps.length);
