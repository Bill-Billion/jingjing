"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const mysql = require('mysql2/promise'), { randomUUID: key, randomBytes, createHash } = require('node:crypto');
const { run } = require('../src/modules/media/marking');
const { openDatabase } = require('../src/infrastructure/database'), { migrate } = require('../src/infrastructure/database/migrator');
test('actual stock cover and full/preview durations with isolated authorization', { skip: !process.env.JX_MYSQL_TEST_ENV_FILE || !process.env.JX_TEST_FFMPEG }, async t => {
  const env = JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE, 'utf8'));
  for (const [k,v] of Object.entries({ NODE_ENV:'test', DB_CLIENT:'mysql', MYSQL_HOST:'127.0.0.1', MYSQL_PORT:'33316', MYSQL_USER:'jx_local', MYSQL_DATABASE:'jx_dev' })) assert.equal(env[k],v);
  const name = 'jx_test_stock_media_' + randomBytes(6).toString('hex');
  const control = await mysql.createConnection({ host:env.MYSQL_HOST, port:Number(env.MYSQL_PORT), user:env.MYSQL_USER, password:env.MYSQL_PASSWORD, database:env.MYSQL_DATABASE });
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'jx-stock-media-test-'));
  const ffmpeg = process.env.JX_TEST_FFMPEG, ffprobe = process.env.JX_TEST_FFPROBE, fixtures = [];
  let db, server, unconfigured;
  try {
    await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');
    db = await openDatabase({ ...env, MYSQL_DATABASE:name }); await migrate(db);
    const S = await require('./helpers/stock-seed.cjs').seedStock(db);
    const bytes = [];
    for (const [filename,color,duration] of [['full','red',2],['preview','blue',1]]) {
      await run(ffmpeg,['-nostdin','-v','error','-f','lavfi','-i','color=c='+color+':s=320x180:d='+duration,'-c:v','libx264','-threads','1','-y',filename+'.mp4'],{cwd:dir});
      bytes.push(await fs.readFile(path.join(dir,filename+'.mp4')));
    }
    const upload = body => S.supply.upload(S.seller.ctx,{party_id:S.seller.personal_party_id,purpose:'WORK_CONTENT',media_type:'video/mp4',body,operation_key:key()});
    const full = await upload(bytes[0]), preview = await upload(bytes[1]);
    async function listing(approved=true, p=preview) {
      let r = await S.stock.create(S.seller.ctx,{...S.listingInput,file_id:full.id,preview_file_id:p.id,operation_key:key()});
      if(approved){ r=await S.reviewListing(r,'RIGHTS');r=await S.reviewListing(r,'CONTENT'); } return r;
    }
    async function start(config) { const api=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory,supplyEnv:config}).listen(0,'127.0.0.1');await new Promise(r=>api.once('listening',r));return api; }
    server=await start({MEDIA_FFMPEG:ffmpeg,MEDIA_FFPROBE:ffprobe});
    async function get(row,variant='media',{api=server,token=S.buyer.token,party=null}={}) {
      const url='/api/v1/stock/catalog/'+row.id+'/'+variant;
      const res=await fetch('http://127.0.0.1:'+api.address().port+url,{headers:{...(token?{Authorization:'Bearer '+token}:{}),...(party?{'X-Acting-Party':party}:{})}});
      const json=(res.headers.get('content-type')||'').includes('json'),body=json?await res.json():Buffer.from(await res.arrayBuffer());
      if(json)fixtures.push({method:'GET',path:url,schema:res.status===200?'StockPublicMediaResponse':'ErrorResponse',value:body});
      return {status:res.status,body,cache:res.headers.get('cache-control'),type:res.headers.get('content-type')};
    }
    let live, metadata;
    await t.test('review is required and request identity is explicit',async()=>{
      const pending=await listing(false); assert.equal((await get(pending)).status,409);
      live=await listing();assert.equal((await get(live,'media',{token:null})).status,401);
      assert.equal((await get(live,'cover',{party:S.buyer.personal_party_id})).status,400);
    });
    await t.test('durations come from distinct actual files and cover pixels come only from preview',async()=>{
      const info=await get(live);assert.equal(info.status,200,JSON.stringify(info.body));metadata=info.body.data;
      assert.equal(metadata.duration_ms,2000);assert.equal(metadata.preview_duration_ms,1000);
      assert.equal(metadata.preview_width,320);assert.equal(metadata.preview_height,180);
      assert.equal(metadata.cover.source,'REVIEWED_PREVIEW');assert.equal(info.cache,'no-store');
      const cover=await get(live,'cover');assert.equal(cover.status,200);assert.match(cover.type,/image\/jpeg/);assert.equal(cover.cache,'no-store');
      assert.equal(createHash('sha256').update(cover.body).digest('hex'),metadata.cover.content_sha256);
      await fs.writeFile(path.join(dir,'cover.jpg'),cover.body);
      const rgb=await run(ffmpeg,['-v','error','-i','cover.jpg','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{cwd:dir});
      const center=(90*320+160)*3;assert.ok(rgb[center+2]>200&&rgb[center]<30,'cover must show BLUE public preview, never RED private full film');
      assert.equal(JSON.stringify(metadata).includes('object_key'),false);assert.equal(JSON.stringify(metadata).includes(full.id),false);
    });
    await t.test('unlisting blocks metadata and cover despite a warmed cache',async()=>{
      await S.stock.status(S.seller.ctx,{party_id:S.seller.personal_party_id,record_id:live.id,expected_version:live.object_version,action:'UNLIST',reason:'synthetic withdrawal',operation_key:key()});
      assert.equal((await get(live)).status,409);assert.equal((await get(live,'cover')).status,409);
    });
    await t.test('damaged stored bytes do not reuse a cached cover; missing tools never claim success',async()=>{
      const r=await listing();assert.equal((await get(r)).status,200);
      const objectKey=[...S.bytes.keys()].find(k=>k.endsWith('/'+preview.id));assert.ok(objectKey);const original=S.bytes.get(objectKey);
      S.bytes.set(objectKey,Buffer.from('damaged'));assert.equal((await get(r,'cover')).status,503);S.bytes.set(objectKey,original);
      unconfigured=await start({});assert.equal((await get(r,'media',{api:unconfigured})).status,503);
    });
    await t.test('unplayable approved fixture is rejected instead of invented duration',async()=>{
      const bad=await upload(Buffer.from('not a playable MP4'));const r=await listing(true,bad);const res=await get(r);assert.equal(res.status,409);assert.equal(res.body.error.code,'MEDIA_FORMAT_UNSUPPORTED');
    });
    await t.test('withdrawn person authorization blocks both media routes',async()=>{
      const r=await listing();assert.equal((await get(r)).status,200);
      await S.artists.withdraw(S.seller.ctx,{person_id:S.seller.person.id,party_id:S.seller.personal_party_id,record_id:S.consent.id,expected_version:S.consent.object_version,reason:'synthetic withdrawal',operation_key:key()});
      assert.equal((await get(r)).status,409);assert.equal((await get(r,'cover')).status,409);
    });
    const output=path.resolve(__dirname,'../../../..','.local/stock-media-http-fixtures.json');await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify({synthetic_only:true,cases:fixtures},null,2));
  } finally {
    for(const api of [server,unconfigured])if(api)await new Promise(r=>{api.close(r);api.closeAllConnections();});
    if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();
    if(path.dirname(path.resolve(dir))===path.resolve(os.tmpdir())&&path.basename(dir).startsWith('jx-stock-media-test-'))await fs.rm(dir,{recursive:true,force:true});
  }
});
