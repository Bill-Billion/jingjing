'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const{randomUUID,createHash}=require('node:crypto'),{openQaStorage}=require('./qa18-disk-storage.cjs');
test('QA disk storage survives reopening, preserves immutable bytes and refuses corruption',async()=>{
 const dir=path.resolve(__dirname,'../../.local/qa18/storage-tests',randomUUID()),key='private/synthetic.txt',bytes=Buffer.from('Synthetic persistence evidence only');
 const first=await openQaStorage(dir,{seed:new Map([[key,bytes]])});assert.deepEqual(await first.storageFactory().getBuffer(key),bytes);
 const second=await openQaStorage(dir);assert.deepEqual(await second.storageFactory().getBuffer(key),bytes);
 await assert.rejects(second.storageFactory().put({key,body:Buffer.from('different')}),/IMMUTABLE_OBJECT_CONFLICT/);
 await second.storageFactory().put({key,body:bytes});assert.equal(await second.storageFactory().getBuffer('missing'),undefined);
 const filename=createHash('sha256').update(key).digest('hex');await fs.writeFile(path.join(dir,filename),'tampered');
 await assert.rejects(second.storageFactory().getBuffer(key),/INTEGRITY_FAILURE/);
 await assert.rejects(openQaStorage(path.resolve(__dirname,'not-local')),/LOCAL_ONLY/);
 const index=JSON.parse(await fs.readFile(path.join(dir,'STORAGE.private.json'),'utf8'));index[key].file='../../outside';await fs.writeFile(path.join(dir,'STORAGE.private.json'),JSON.stringify(index));
 await assert.rejects(openQaStorage(dir),/INVALID_STORAGE_INDEX/);
});
