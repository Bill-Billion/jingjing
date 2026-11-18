'use strict';
const path=require('node:path');
// Structured test events, not response bodies or credentials. Node's TAP remains
// the full diagnostic log; this index never turns module checks into acceptance.
module.exports=async function* reporter(source){
 for await(const event of source){
  if(!['test:pass','test:fail'].includes(event.type))continue;
  const d=event.data;
  yield JSON.stringify({name:d.name,file:d.file?path.relative(process.cwd(),d.file).split(path.sep).join('/'):null,
   line:d.line??null,nesting:d.nesting??0,status:d.skip?'SKIP':d.todo?'TODO':event.type==='test:pass'?'PASS':'FAIL',
   duration_ms:d.details?.duration_ms??null,error_code:d.details?.error?.code??null})+'\n';
 }
};
