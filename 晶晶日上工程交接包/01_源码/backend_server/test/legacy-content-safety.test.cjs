 'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {fixture}=require('./fixtures/legacy-http.cjs');
const {createFieldCipher}=require('../utils/crypto');
const {embedBlindWatermark,verifyBlindWatermark}=require('../utils/watermark');
const key='0123456789abcdef0123456789abcdef';

test('field encryption requires exactly 32 UTF8 bytes without default or truncation',()=>{
 for(const value of [undefined,'','short',key+'extra','中'.repeat(32)]) {
  assert.throws(()=>createFieldCipher({FIELD_ENC_KEY:value}),e=>e.code.startsWith('FIELD_ENCRYPTION_') && !e.message.includes('extra'));
 }
 assert.doesNotThrow(()=>createFieldCipher({FIELD_ENC_KEY:'中'.repeat(10)+'ab'}));
});
test('field encryption reads legacy AES-GCM format, uses fresh IVs, and round trips Unicode',()=>{
 const c=createFieldCipher({FIELD_ENC_KEY:key}),text='合成测试资料🙂';
 const iv=Buffer.alloc(12,7),old=crypto.createCipheriv('aes-256-gcm',Buffer.from(key),iv);
 const encrypted=Buffer.concat([old.update(text),old.final()]);
 assert.equal(c.decrypt(`${iv.toString('hex')}:${old.getAuthTag().toString('hex')}:${encrypted.toString('hex')}`),text);
 const one=c.encrypt(text),two=c.encrypt(text);assert.notEqual(one,two);assert.equal(c.decrypt(one),text);assert.equal(c.decrypt(two),text);
 assert.equal(c.encrypt(null),'');assert.equal(c.decrypt(''),'');
});
test('wrong key or damaged ciphertext is an explicit sanitized error, never an empty identity',()=>{
 const c=createFieldCipher({FIELD_ENC_KEY:key}),cipher=c.encrypt('private synthetic data');
 const wrong=createFieldCipher({FIELD_ENC_KEY:'x'.repeat(32)});
 assert.throws(()=>wrong.decrypt(cipher),{code:'FIELD_DECRYPTION_FAILED'});
 const parts=cipher.split(':');parts[1]='0'.repeat(32);assert.throws(()=>c.decrypt(parts.join(':')),{code:'FIELD_DECRYPTION_FAILED'});
 for(const malformed of ['not-a-cipher',cipher+':extra',cipher.slice(0,-1),{},cipher.replace(':','!')]) {
  assert.throws(()=>c.decrypt(malformed),{code:'FIELD_CIPHERTEXT_INVALID'});
 }
});
test('sample library query works with nullable video links and keeps old data',async(t)=>{
 const {db,request}=await fixture(t);
 db.prepare("INSERT INTO sample_library(genre,title,outline,status) VALUES ('剧情','synthetic old sample','synthetic outline','active')").run();
 const r=await request('GET','/samples/library');assert.equal(r.status,200);
 assert.equal(r.body.library['剧情'][0].video_url,null);
 assert.equal(r.body.library['剧情'][0].title,'synthetic old sample');
});
test('script submission records only metadata digest and never claims external evidence',async(t)=>{
 const {db,request,upstream}=await fixture(t);
 db.prepare("INSERT INTO scriptwriters(id,user_id,pen_name,status) VALUES (1,1,'Synthetic','approved')").run();
 const body={title:'synthetic title',category:'test',synopsis:'synthetic private synopsis',fileUrl:'https://example.invalid/private'};
 const first=await request('POST','/scripts/upload',body),second=await request('POST','/scripts/upload',body);
 assert.equal(first.status,200);assert.equal(first.body.submissionDigest,second.body.submissionDigest);
 assert.equal(first.body.submissionDigest,crypto.createHash('sha256').update(JSON.stringify({title:body.title,synopsis:body.synopsis,fileUrl:body.fileUrl})).digest('hex'));
 assert.equal(first.body.evidenceHash,null);assert.equal(first.body.trustedTimestamp,false);assert.equal(first.body.evidenceStatus,'not_verified');
 assert.equal(db.prepare('SELECT digest_kind FROM scripts WHERE id=?').get(first.body.scriptId).digest_kind,'submission_metadata_v1');
 db.prepare("INSERT INTO scripts(scriptwriter_id,title,evidence_hash,evidence_txid,status) VALUES (1,'historical','old-digest','old-tx','approved')").run();
 const own=await request('GET','/scripts/my');assert.equal(own.body.list.length,3);
 const old=own.body.list.find(x=>x.title==='historical');assert.equal(old.submissionDigest,null);assert.equal(old.recordedDigest,'old-digest');assert.equal(old.digestScope,'legacy_unclassified');assert.equal(old.evidenceStatus,'not_verified');
 assert.deepEqual((await request('GET','/scripts/my',{},2)).body.list,[]);
 for(const role of ['user','admin']) {
  const r=await request('GET','/scripts/browse',{},2,role);assert.equal(r.status,503);assert.equal(r.body.code,'SCRIPT_READING_NOT_READY');assert.equal(JSON.stringify(r.body).includes(body.synopsis),false);
 }
 assert.equal((await request('GET','/scripts/browse',{},null)).status,401);assert.equal(upstream(),0);
});
test('watermark placeholders cannot fabricate success with any configured provider',async()=>{
 const config=require('../config'),before=structuredClone(config.deepfakeProtection);
 try {
  for(const enabled of [false,true])for(const provider of ['', 'c2pa','synthetic']) {
   config.deepfakeProtection.enabled=enabled;config.deepfakeProtection.blindWatermark.provider=provider;
   const r=await embedBlindWatermark('https://example.invalid/private',{orderNo:'private'});
   assert.equal(r.success,false);assert.equal(r.watermarkId,null);assert.equal(r.status,'not_enabled');
   const v=await verifyBlindWatermark('https://example.invalid/private');assert.equal(v.verified,false);assert.equal(v.status,'not_enabled');
  }
 } finally {config.deepfakeProtection=before;}
});
test('all three delivery routes reject before changing orders or contacting providers',async(t)=>{
 const {db,request,upstream}=await fixture(t);
 for(const [table,url,state] of [['sample_orders','/samples/1/deliver','producing'],['video_orders','/videos/deliver/TEST','delivering'],['endorsement_orders','/endorsement/deliver/TEST','delivering']]) {
  db.prepare(`INSERT INTO ${table}(id,order_no,user_id,status) VALUES (1,'TEST',1,?)`).run(state);
  const before=db.prepare(`SELECT * FROM ${table}`).all();
  for(const role of ['user','admin']) {
   const r=await request('POST',url,{videoUrl:'https://example.invalid/fabricated',sampleUrl:'https://example.invalid/fabricated'},1,role);
   assert.equal(r.status,503);assert.equal(r.body.delivered,false);
  }
  assert.equal((await request('POST',url,{},null)).status,401);
  assert.deepEqual(db.prepare(`SELECT * FROM ${table}`).all(),before);
 }
 assert.equal(upstream(),0);
});

test('application startup rejects missing production and malformed supplied keys before database access',()=>{
 const {spawnSync}=require('node:child_process');
 const source = `const Module=require('node:module'),original=Module._load;
 Module._load=function(id,parent,...args){
   if(id==='dotenv')return {config(){}};
   if(id==='./db' && parent.filename.endsWith('app.js'))throw Object.assign(Error('DB reached'),{code:'TEST_DB_REACHED'});
   return original.call(this,id,parent,...args);
 };
 try { require('./app'); process.exitCode=1; } catch(e) { process.stdout.write(e.code || 'unexpected-error'); }`;
 for(const [environment,value,expected] of [
  ['production',undefined,'FIELD_ENCRYPTION_NOT_CONFIGURED'],
  ['production','short','FIELD_ENCRYPTION_KEY_INVALID'],
  ['development',key+'suffix','FIELD_ENCRYPTION_KEY_INVALID'],
  ['production',key,'TEST_DB_REACHED'],
  ['development',undefined,'TEST_DB_REACHED'],
 ]) {
  const env={...process.env,NODE_ENV:environment,JWT_SECRET:'synthetic-test-secret'};
  delete env.FIELD_ENC_KEY;if(value!==undefined)env.FIELD_ENC_KEY=value;
  const r=spawnSync(process.execPath,['-e',source],{cwd:require('node:path').resolve(__dirname,'..'),env,encoding:'utf8',windowsHide:true,timeout:10000});
  assert.equal(r.status,0);assert.equal(r.stdout,expected);assert.equal(r.stderr,'');
 }
});
