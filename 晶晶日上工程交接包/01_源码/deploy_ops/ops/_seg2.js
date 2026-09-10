const fs=require('fs');
const base='C:/Users/user/Doubao/chats/2026-08-24/new-chat-3/work/server/server/routes/';
for(const file of ['videos.js','endorsement.js']){
  const L=fs.readFileSync(base+file,'utf8').split('\n');
  console.log('\n##### '+file+' HEAD(1-20)');
  for(let i=1;i<=20;i++)console.log(i+': '+L[i-1]);
  if(file==='endorsement.js'){console.log('--- deliver 104-130');for(let i=104;i<=130;i++)console.log(i+': '+L[i-1]);}
  if(file==='videos.js'){console.log('--- require submitReview? ', L.some(x=>x.includes('submitReview')));}
}
