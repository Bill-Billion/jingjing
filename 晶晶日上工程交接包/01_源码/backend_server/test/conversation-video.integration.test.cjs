'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process'),{randomUUID:key,randomBytes,createHash}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
const hash=b=>createHash('sha256').update(b).digest('hex');
test('actual private conversation video and original business notification sources',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},async t=>{
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
 for(const [k,v] of Object.entries({NODE_ENV:'test',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const ffmpeg=process.env.JX_TEST_FFMPEG,ffprobe=process.env.JX_TEST_FFPROBE;assert(ffmpeg&&ffprobe&&path.isAbsolute(ffmpeg)&&path.isAbsolute(ffprobe),'Explicit local media tools required');
 const name='jx_test_conversation_video_'+randomBytes(8).toString('hex'),control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'jx-conversation-video-'));let db,server;const cases=[],records={synthetic_only:true,database:name},binary=[];
 try{
  const media=path.join(temp,'synthetic.mp4');execFileSync(ffmpeg,['-nostdin','-v','error','-f','lavfi','-i','color=c=blue:s=96x64:r=10:d=1','-an','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',media],{windowsHide:true});
  const probe=JSON.parse(execFileSync(ffprobe,['-v','error','-show_streams','-show_format','-of','json',media],{encoding:'utf8',windowsHide:true}));assert.equal(probe.streams[0].codec_name,'h264');assert.equal(Number(probe.format.duration),1);const bytes=await fs.readFile(media);records.media={sha256:hash(bytes),byte_size:bytes.length,codec:'h264',duration_seconds:1};
  await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);
  const S=await require('./helpers/notices-seed.cjs').seedNotices(db),{buyer,seller,reviewer,buyer2}=S;
  const original=await S.commercialQuote(),trade=original.trade,order=await trade.accept(buyer.ctx,{record_id:original.quote.id,party_id:buyer.personal_party_id,expected_version:original.quote.object_version,quote_sha256:original.quote.content_sha256,operation_key:key()});records.order_id=order.id;
  server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api/v1',thread='/gigs/orders/'+order.id+'/conversation';
  async function call(method,url,{u=buyer,party=u?.personal_party_id,body,version,op=key(),schema='CommercialConversationResponse'}={}){
   const response=await fetch(base+url,{method,headers:{...u?{Authorization:'Bearer '+u.token}:{},...party?{'X-Acting-Party':party}:{},...body!==undefined?{'Content-Type':Buffer.isBuffer(body)?'application/octet-stream':'application/json','Idempotency-Key':op}:{},...version?{'If-Match':'"'+version+'"'}:{}},...body!==undefined?{body:Buffer.isBuffer(body)?body:JSON.stringify(body)}:{}});
   const raw=Buffer.from(await response.arrayBuffer());if(!response.headers.get('content-type')?.includes('application/json')){binary.push({method,path:new URL(base+url).pathname,status:response.status,bytes:raw.length,sha256:hash(raw),cache_control:response.headers.get('cache-control')});return{status:response.status,bytes:raw,headers:response.headers};}
   const value=JSON.parse(raw);cases.push({method,path:new URL(base+url).pathname,schema:response.ok?schema:'ErrorResponse',value});return{status:response.status,...value};
  }
  const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.data;},bad=(r,status,code)=>{assert.equal(r.status,status);assert.equal(r.error?.code,code,JSON.stringify(r));};
  const unread=async(u=buyer)=>ok(await call('GET','/operations/notifications/unread',{u,schema:'NotificationUnreadResponse'}));
  const feed=async(u=buyer)=>ok(await call('GET','/operations/notifications/feed?limit=100',{u,schema:'NotificationFeedResponse'})).items;
  const clear=(snapshot_id,channel)=>call('POST','/operations/notifications/read-all',{body:{snapshot_id,channel},schema:'NotificationReadAllResponse'});
  let asset,video,card,initialSnapshot;
  await t.test('real MP4 remains private; unpaid and unowned media cannot become conversation messages',async()=>{
   asset=ok(await call('POST','/supply/assets?purpose=WORK_CONTENT&media_type=video%2Fmp4',{u:seller,body:bytes,schema:'SupplyAssetResponse'}));assert.equal(asset.content_sha256,records.media.sha256);records.asset_id=asset.id;
   bad(await call('POST',thread+'/messages',{u:seller,body:{kind:'MEDIA',asset_id:asset.id}}),409,'COMMERCIAL_CONVERSATION_AWAITING_PAYMENT');
   assert.equal(Number((await db.execute("SELECT COUNT(*) n FROM gig_records WHERE kind='COMMERCIAL_MESSAGE'"))[0][0].n),0);
   const cfg={provider:'ALIPAY',environment:'SANDBOX',app_id:'synthetic.app',merchant_id:'synthetic.merchant',merchant_party_id:seller.personal_party_id,config_revision:'synthetic-video'};
   const payment=await trade.preparePayment(buyer.ctx,{party_id:buyer.personal_party_id,order_id:order.id,installment_key:'full',operation_key:key()},cfg);await trade.applyPayment({...cfg,payment_id:payment.id,currency:'CNY',amount_minor:10001,transaction_id:'synthetic:'+payment.id,status:'SUCCEEDED',product_id:null,app_account_token:null});records.payment_id=payment.id;
   bad(await call('POST',thread+'/messages',{body:{kind:'MEDIA',asset_id:asset.id}}),409,'PRIVATE_MATERIAL_NOT_READY');
   bad(await call('GET',thread+'/messages',{u:buyer2}),404,'GIG_NOT_FOUND');
  });
  await t.test('same video request creates one message and event; original card and exact bytes are recoverable',async()=>{
   const op=key(),body={kind:'MEDIA',asset_id:asset.id};const replies=await Promise.all([1,2,3].map(()=>call('POST',thread+'/messages',{u:seller,body,op})));video=ok(replies[0]);for(const reply of replies)assert.equal(ok(reply).id,video.id);records.video_message_id=video.id;
   assert.equal(video.data.asset.media_type,'video/mp4');assert.equal(video.data.asset.sha256,records.media.sha256);
   bad(await call('POST',thread+'/messages',{u:seller,body:{kind:'TEXT',body:'changed original intent'},op}),409,'IDEMPOTENCY_CONFLICT');
   card=ok(await call('POST',thread+'/messages',{u:seller,body:{kind:'ORDER_CARD'}}));assert.equal(card.data.order_id,order.id);records.card_message_id=card.id;
   const list=ok(await call('GET',thread+'/messages'));assert.equal(list.items.filter(x=>x.id===video.id).length,1);
   const url=thread+'/messages/'+video.id+'/file',download=await call('GET',url);assert.equal(download.status,200);assert.equal(download.headers.get('cache-control'),'no-store');assert.deepEqual(download.bytes,bytes);
   const saved=path.join(temp,'downloaded.mp4');await fs.writeFile(saved,download.bytes);const result=JSON.parse(execFileSync(ffprobe,['-v','error','-show_streams','-show_format','-of','json',saved],{encoding:'utf8',windowsHide:true}));assert.equal(Number(result.format.duration),1);assert.equal(result.streams[0].codec_name,'h264');
   bad(await call('GET',url,{u:buyer2}),404,'GIG_NOT_FOUND');
   assert.equal(Number((await db.execute("SELECT COUNT(*) n FROM ops_events WHERE domain='GIG_MESSAGE' AND record_id=?",[video.id]))[0][0].n),1);
   initialSnapshot=await unread();assert.equal(initialSnapshot.channels.ORDER_CONVERSATIONS,2);
  });
  await t.test('real submission notifications stay separate from message cutoff and conversation read receipt',async()=>{
   const noticeReview=async row=>ok(await call('POST','/notices/records/'+row.id+'/reviews',{u:reviewer,party:null,body:{decision:'APPROVE',reason:'synthetic independent original-source review',checks:{content_reviewed:true,materials_reviewed:true,no_private_contact:true}},version:row.object_version,schema:'NoticeResponse'}));
   const notice=await noticeReview(ok(await call('POST','/notices/announcements',{body:{rule_id:S.rule.id,notice:S.body},schema:'NoticeResponse'})));
   const submission=await noticeReview(ok(await call('POST','/notices/submissions',{u:seller,body:{rule_id:S.rule.id,submission:{...S.submission,notice_id:notice.id}},schema:'NoticeResponse'})));assert.equal(submission.current_status,'SENT');records.notice_id=notice.id;records.submission_id=submission.id;
   const later=ok(await call('POST',thread+'/messages',{u:seller,body:{kind:'TEXT',body:'Synthetic later original-order update'}}));records.later_message_id=later.id;
   let before=await unread();assert.equal(before.channels.ORDER_CONVERSATIONS,3);assert(before.channels.SUBMISSION_INTENTS>0);
   const cleared=ok(await clear(initialSnapshot.snapshot_id,'ORDER_CONVERSATIONS'));assert.equal(cleared.marked_count,2);
   const after=await unread();assert.equal(after.channels.ORDER_CONVERSATIONS,1);assert.equal(after.channels.SUBMISSION_INTENTS,before.channels.SUBMISSION_INTENTS);
   const current=await feed();assert(current.some(x=>x.record_id===submission.id&&x.target.record_id===submission.id&&x.channel==='SUBMISSION_INTENTS'&&!x.read));assert(current.some(x=>x.record_id===later.id&&x.domain==='GIG_MESSAGE'&&x.target.domain==='GIG_ORDER'&&x.target.record_id===order.id&&x.channel==='ORDER_CONVERSATIONS'&&!x.read));
   const read=ok(await call('POST',thread+'/read',{body:{message_id:later.id}}));assert.equal(read.read_until,later.id);assert.equal((await unread()).channels.ORDER_CONVERSATIONS,0);assert.equal((await unread()).channels.SUBMISSION_INTENTS,before.channels.SUBMISSION_INTENTS);
   assert.equal((await feed(buyer2)).some(x=>[submission.id,video.id,later.id].includes(x.record_id)||x.target.record_id===order.id),false);
  });
  await t.test('lost membership refuses video deep links; independent hiding cannot fall back to public bytes',async()=>{
   const url=thread+'/messages/'+video.id+'/file';await db.execute("UPDATE party_memberships SET current_status='REVOKED' WHERE account_id=? AND party_id=?",[buyer.account_id,buyer.personal_party_id]);
   try{bad(await call('GET',url),403,'GIG_PARTY_FORBIDDEN');assert.equal((await call('GET','/operations/notifications/unread',{schema:'NotificationUnreadResponse'})).status,403);}finally{await db.execute("UPDATE party_memberships SET current_status='ACTIVE' WHERE account_id=? AND party_id=?",[buyer.account_id,buyer.personal_party_id]);}
   ok(await call('POST',thread+'/moderation',{u:reviewer,party:null,body:{message_id:video.id,reason:'Synthetic independent private-message hiding'}}));
   bad(await call('GET',url),404,'GIG_NOT_FOUND');const hidden=ok(await call('GET',thread+'/messages')).items.find(x=>x.id===video.id);assert.equal(hidden.data.hidden,true);assert.equal(hidden.data.asset,undefined);assert.equal(hidden.data.body,null);
   assert.equal((await feed()).some(x=>x.record_id===video.id),false);
  });
 }finally{
  await fs.mkdir(path.resolve(__dirname,'../../../../.local'),{recursive:true});await fs.writeFile(path.resolve(__dirname,'../../../../.local/conversation-video-http.json'),JSON.stringify({synthetic_only:true,records,binary,cases},null,2)+'\n');
  if(server)await new Promise(r=>{server.close(r);server.closeAllConnections();});if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();
  // Remove only this exact test-created temporary directory after proving its parent/prefix.
  const absolute=path.resolve(temp);assert.equal(path.dirname(absolute),path.resolve(os.tmpdir()));assert(path.basename(absolute).startsWith('jx-conversation-video-'));await fs.rm(absolute,{recursive:true});
 }
});
