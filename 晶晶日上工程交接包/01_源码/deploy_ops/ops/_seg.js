const fs=require('fs');
const base='C:/Users/user/Doubao/chats/2026-08-24/new-chat-3/work/server/server/routes/';
function show(file,a,b){const L=fs.readFileSync(base+file,'utf8').split('\n');console.log('\n===== '+file+' ['+a+'-'+b+'] =====');for(let i=a;i<=b&&i<=L.length;i++)console.log(i+': '+L[i-1]);}
show('videos.js',170,220);
show('endorsement.js',125,165);
