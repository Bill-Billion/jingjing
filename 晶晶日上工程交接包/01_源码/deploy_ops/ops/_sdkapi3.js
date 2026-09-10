const fs=require('fs');
const f='C:/Users/user/Doubao/chats/2026-08-24/new-chat-3/work/server/server/node_modules/@alicloud/cloudauth20200618/dist/client.d.ts';
const t=fs.readFileSync(f,'utf8');
function block(name){
  const re=new RegExp('(export )?(class|interface) '+name+'[^{]*\\{','g');
  const m=re.exec(t);
  if(!m){console.log('NOT FOUND',name);return;}
  let i=m.index, depth=0, j=t.indexOf('{',m.index);
  for(let k=j;k<t.length;k++){if(t[k]==='{')depth++;else if(t[k]==='}'){depth--;if(depth===0){j=k;break;}}}
  console.log('\n===== '+name+' =====');
  console.log(t.slice(m.index,j+1).split('\n').map(s=>s.trimEnd()).join('\n').slice(0,1600));
}
['ElementSmartVerifyRequest','ElementSmartVerifyResponseBody','InitSmartVerifyRequest','InitSmartVerifyResponseBody','DescribeSmartVerifyRequest','DescribeSmartVerifyResponseBody'].forEach(block);
