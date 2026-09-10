const fs=require("fs");
const src=String.raw`C:\Users\user\Doubao\chats\2026-08-24\new-chat-3\总纲_用户上传.md`;
const dst=String.raw`C:\Users\user\Doubao\chats\2026-08-24\new-chat-3\work\app\jingjingshangri_app\docs\WORKBUDDY_EXECUTION_PROTOCOL.md`;
let body=fs.readFileSync(src,"utf8").replace(/^\uFEFF/,"");
const header="> 只读治理协议（用户 2026-09-06 下达，未经用户明确授权不得修改核心优先级与 Gate 标准）。每次开发前先读本文件。原档另存于 new-chat-3/总纲_用户上传.md。\n\n---\n\n";
if(!fs.existsSync(dst)){fs.writeFileSync(dst,header+body,"utf8");console.log("PROTOCOL written bytes="+fs.statSync(dst).size);}else{console.log("PROTOCOL exists, skip");}
