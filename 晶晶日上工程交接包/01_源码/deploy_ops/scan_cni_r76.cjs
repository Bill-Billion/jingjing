// 第76轮：梳理其余 CachedNetworkImage 用法（HumanAvatar 已处理），看尺寸约束/是否限解码
const fs = require('fs');
const root = 'C:/Users/user/Doubao/chats/2026-08-24/new-chat-3/work/app/jingjingshangri_app/lib';
function walk(d){let r=[];for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=d+'/'+e.name;if(e.isDirectory())r=r.concat(walk(p));else if(e.name.endsWith('.dart'))r.push(p);}return r;}
for(const f of walk(root)){
  const lines=fs.readFileSync(f,'utf8').split(/\r?\n/);
  lines.forEach((l,i)=>{
    if(/CachedNetworkImage\(/.test(l) && !/human_avatar/.test(f)){
      // 打印该处往后 14 行，观察 width/height/fit/memCache
      const seg=lines.slice(i,i+14).map((x,j)=>'   '+(i+1+j)+': '+x.trimEnd()).join('\n');
      console.log('### '+f.replace(root+'/','')+' @'+(i+1)+'\n'+seg+'\n');
    }
  });
}
