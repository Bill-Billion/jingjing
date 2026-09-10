const fs=require('fs');
const m='C:/Users/user/Doubao/chats/2026-08-24/new-chat-3/work/server/server/node_modules/@alicloud/green20220302/dist/models/';
const files=['TextModerationRequest.d.ts','TextModerationResponseBody.d.ts','ImageModerationRequest.d.ts','ImageModerationResponseBody.d.ts','VideoModerationRequest.d.ts','VideoModerationResponseBody.d.ts','VideoModerationResultRequest.d.ts','VideoModerationResultResponseBody.d.ts'];
for(const f of files){
  try{const t=fs.readFileSync(m+f,'utf8');
    console.log('\n##### '+f);
    console.log(t.split('\n').filter(l=>l.includes('?:')||l.includes('class ')).map(s=>s.trim()).join('\n').slice(0,1100));
  }catch(e){console.log(f,'ERR',e.message);}
}
