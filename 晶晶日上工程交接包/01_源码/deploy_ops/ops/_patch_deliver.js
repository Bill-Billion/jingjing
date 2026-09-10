const fs=require('fs');
const base='C:/Users/user/Doubao/chats/2026-08-24/new-chat-3/work/server/server/routes/';
function patch(file, kind){
  let t=fs.readFileSync(base+file,'utf8');const NL=t.includes('\r\n')?'\r\n':'\n';const log=[];
  // 1) require
  if(!t.includes("require('./review')")){
    t=t.replace(/(const router = express\.Router\(\);\r?\n)/, "$1const { submitReview } = require('./review');"+NL);
    log.push('require');
  }
  // 2) deliver handler async（仅交付那一处）
  const handlerRe=/router\.post\('\/deliver\/:orderNo', auth, \(req, res\) => \{/;
  if(handlerRe.test(t)){ t=t.replace(handlerRe, "router.post('/deliver/:orderNo', auth, async (req, res) => {"); log.push('async'); }
  // 3) 替换 INSERT content_reviews 块为 await submitReview
  const blockRe=new RegExp(
    "  if \\(config\\.content\\.reviewRequired\\) \\{\\r?\\n"+
    "(?:    db\\.prepare\\([\\s\\S]*?\\)\\r?\\n(?:      .*\\r?\\n)?    \\.run\\([^;]*?\\);\\r?\\n|    db\\.prepare\\([\\s\\S]*?\\.run\\([^;]*?\\);\\r?\\n)"+
    "  \\}\\r?\\n"
  );
  const repl="  if (config.content.reviewRequired) {"+NL+
    "    await submitReview('"+kind+"', order.id, req.userId, { url: videoUrl }).catch(() => {});"+NL+
    "  }"+NL;
  if(blockRe.test(t)){ t=t.replace(blockRe,repl); log.push('submit'); }
  fs.writeFileSync(base+file,t,'utf8');
  console.log(file,'CRLF='+(NL==='\r\n'),'->',log.join(','));
}
patch('videos.js','video');
patch('endorsement.js','endorsement');
