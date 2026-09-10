const fs=require('fs');
const base='C:/Users/user/Doubao/chats/2026-08-24/new-chat-3/work/server/server/node_modules/@alicloud/';
function dump(pkg, names){
  const f=base+pkg+'/dist/client.d.ts';
  const t=fs.readFileSync(f,'utf8');
  for(const name of names){
    const re=new RegExp('(export )?(class|interface) '+name+'[^{]*\\{');
    const m=re.exec(t);
    if(!m){console.log('NOT FOUND',pkg,name);continue;}
    let depth=0,j=t.indexOf('{',m.index);
    for(let k=j;k<t.length;k++){if(t[k]==='{')depth++;else if(t[k]==='}'){depth--;if(depth===0){j=k;break;}}}
    console.log('\n== '+pkg.split('/')[0]+' :: '+name+' ==');
    console.log(t.slice(m.index,j+1).split('\n').filter(l=>l.includes('?:')||l.includes('class ')).map(s=>s.trim()).join('\n').slice(0,900));
  }
}
dump('cloudauth20200618',['ElementSmartVerifyResponseBodyResultObject','InitSmartVerifyResponseBodyResultObject','DescribeSmartVerifyResponseBodyResultObject']);
dump('green20220302',['TextModerationRequest','TextModerationResponseBody','TextModerationResponseBodyResult','ImageModerationRequest','ImageModerationResponseBody','VideoModerationRequest','VideoModerationResponseBody','VideoModerationResultRequest','VideoModerationResultResponseBody']);
