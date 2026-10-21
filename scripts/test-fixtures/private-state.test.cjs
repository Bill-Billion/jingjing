"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {protectPrivateState}=require('./private-state.cjs');
test('repeated private-file protection preserves current-user read/write after replacing test state',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'jx-private-state-'));const file=path.join(dir,'state.json');
 try{
   await fs.writeFile(file,'first synthetic state');await protectPrivateState(file);
   await fs.writeFile(file,'replacement synthetic state');await protectPrivateState(file);
   assert.equal(await fs.readFile(file,'utf8'),'replacement synthetic state');
   if(process.platform!=='win32')assert.equal((await fs.stat(file)).mode&0o777,0o600);
 }finally{await fs.rm(file,{force:true});await fs.rmdir(dir);}
});
