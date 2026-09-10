const fs=require('fs'),path=require('path');
const dir='C:/Users/user/Doubao/chats/2026-08-24/new-chat-3/work/server/server/node_modules/@alicloud/green20220302';
function walk(d){let r=[];for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())r=r.concat(walk(p));else if(e.name.endsWith('.d.ts'))r.push(p);}return r;}
const files=walk(dir);
console.log('DTS:',files.map(f=>f.replace(dir,'')).join(', '));
for(const f of files){
  const t=fs.readFileSync(f,'utf8');
  // textModeration 方法签名 + 它引用的 Request 类型
  const tm=t.match(/textModeration\(request:[^)]*\)/); 
  const im=t.match(/imageModeration\(request:[^)]*\)/);
  const vm=t.match(/videoModeration\(request:[^)]*\)/);
  const vmr=t.match(/videoModerationResult\(request:[^)]*\)/);
  if(tm||im||vm) console.log('\n#',f.split(path.sep).pop(),'\n ',(tm&&tm[0])||'', '\n ',(im&&im[0])||'','\n ',(vm&&vm[0])||'','\n ',(vmr&&vmr[0])||'');
}
// 找 TextModeration 请求模型
const all=files.map(f=>fs.readFileSync(f,'utf8')).join('\n');
['class TextModerationRequest','class ImageModerationRequest','class VideoModerationRequest','class VideoModerationResultRequest'].forEach(k=>{const i=all.indexOf(k);console.log('\n---',k,'idx',i);if(i>=0)console.log(all.slice(i,i+500).split('\n').filter(l=>l.includes('?:')||l.includes('class')).map(s=>s.trim()).join('\n'));});
