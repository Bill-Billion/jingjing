"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID:key,randomBytes}=require('node:crypto'),mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database'),{migrate}=require('../src/infrastructure/database/migrator');
async function run(kind,seed,scenario){
 const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));for(const [k,v]of Object.entries({NODE_ENV:'test',MYSQL_HOST:'127.0.0.1',MYSQL_PORT:'33316',MYSQL_USER:'jx_local',MYSQL_DATABASE:'jx_dev'}))assert.equal(env[k],v);
 const name=`jx_test_${process.pid}_${randomBytes(6).toString('hex')}`,control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});let db,server;const cases=[];
 try{await control.query('CREATE DATABASE '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin');db=await openDatabase({...env,MYSQL_DATABASE:name});await migrate(db);const S=await seed(db);server=require('../src/http/account-api').createAccountApi({db,secret:S.secret,supplyStorageFactory:S.storageFactory}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 async function get(query={}){const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/v1/discovery/matches?'+new URLSearchParams({kind,...query}),{headers:{Authorization:'Bearer '+S.buyer.token}}),value=await r.json();cases.push({method:'GET',path:'/api/v1/discovery/matches',schema:r.status===200?'DiscoveryMatchesResponse':'ErrorResponse',value});assert.equal(r.status,200,JSON.stringify(value));return value.data;}
 async function call(method,url,{who=S.buyer,body,party=null,version=null,operation=key(),schema}={}){
  const res=await fetch('http://127.0.0.1:'+server.address().port+'/api/v1'+url,{method,headers:{Authorization:'Bearer '+who.token,...party?{'X-Acting-Party':party}:{},...body===undefined?{}:{'Content-Type':'application/json','Idempotency-Key':operation},...version===null?{}:{'If-Match':'"'+version+'"'}},...body===undefined?{}:{body:JSON.stringify(body)}});
  const value=await res.json();cases.push({method,path:new URL('http://local/api/v1'+url).pathname,schema:res.status===200?schema:'ErrorResponse',value});return {status:res.status,...value};
 }
 const ok=r=>{assert.equal(r.status,200,JSON.stringify(r));return r.data;};
 await scenario(S,get,{call,ok,db});const out=path.resolve(__dirname,'../../../..','.local/prelaunch-independent-20261109/matches-'+kind+'.json');await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify({synthetic_only:true,cases},null,2));
 }finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}if(db)await db.close();await control.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));await control.end();}
}
test('actual stock catalogue matches budget but cannot grant commercial rights to a personal license',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},()=>run('STOCK',require('./helpers/stock-seed.cjs').seedStock,async(S,get,{call,ok,db})=>{
 const listing=await S.listing();let p=await get({purpose:'PERSONAL_NONCOMMERCIAL',max_price_minor:100});assert.equal(p.items.length,1);assert.equal(p.items[0].item.id,listing.id);assert.equal(p.items[0].item.unit_minor,100);assert.equal((await get({purpose:'COMMERCIAL_LIMITED',commercial_use:'BRAND_PROMOTION'})).items.length,0);assert.equal((await get({max_price_minor:99})).items.length,0);assert.equal((await get({city:'no-such-city'})).items.length,0);
 const preference=async value=>{const p=ok(await call('GET','/privacy/preferences',{schema:'PrivacyPreferencesResponse'}));return ok(await call('PATCH','/privacy/preferences',{body:{personalization:value,marketing:false,rest_reminder_minutes:0},version:p.object_version,schema:'PrivacyPreferencesResponse'}));};
 await preference(true);await preference(false);
 const recommendations=ok(await call('GET','/discovery/recommendations?kind=STOCK',{schema:'DiscoveryRecommendationsResponse'}));assert.equal(recommendations.personalized,false);assert.equal(recommendations.price_personalized,false);
 assert.equal(recommendations.items.find(x=>x.item.id===listing.id).item.unit_minor,100);
 const selected=(await get({purpose:'PERSONAL_NONCOMMERCIAL',max_price_minor:100})).items[0].item;
 const body={listing_id:selected.id,offer_sha256:selected.offer_sha256,channel:'ALIPAY'},operation=key();
 assert.ok(body.offer_sha256);const post=(who=S.buyer,op=operation,payload=body)=>call('POST','/stock/checkout',{who,body:payload,party:who.personal_party_id,operation:op,schema:'TradeRecordResponse'});
 assert.equal((await post(S.buyer,key(),{...body,offer_sha256:'0'.repeat(64)})).error.code,'STOCK_OFFER_CHANGED');
 const order=ok(await post());assert.equal(order.data.quote.total_minor,selected.unit_minor);assert.equal(order.data.financial.received_minor,0);assert.equal(ok(await post()).id,order.id);
 assert.equal((await post(S.buyer,key())).error.code,'STOCK_ORDER_ALREADY_EXISTS');
 assert.equal((await call('POST','/stock/checkout',{who:S.outsider,body,party:S.buyer.personal_party_id,schema:'TradeRecordResponse'})).status,403);
 const closed=await S.stock.status(S.seller.ctx,{party_id:S.seller.personal_party_id,record_id:listing.id,expected_version:listing.object_version,action:'UNLIST',reason:'synthetic unavailable after matching',operation_key:key()});assert.equal(closed.current_status,'UNLISTED');
 assert.equal((await get()).items.length,0);assert.equal((await post(S.buyer2,key())).error.code,'STOCK_NOT_LISTED');
 const [[count]]=await db.execute("SELECT COUNT(*) n FROM trade_records WHERE kind='ORDER' AND JSON_UNQUOTE(JSON_EXTRACT(data_json,'$.quote.stock_video.listing_id'))=?",[listing.id]);assert.equal(Number(count.n),1);

}));
test('actual audition catalogue removes private prices from budget matches and closed booking from results',{skip:!process.env.JX_MYSQL_TEST_ENV_FILE},()=>run('AUDITION',require('./helpers/auditions-seed.cjs').seedAuditions,async(S,get,{call,ok,db})=>{
 let r=await S.auditions.createOffer(S.seller.ctx,{party_id:S.seller.personal_party_id,offer:S.offer,operation_key:key()});r=await S.auditions.reviewOffer(S.reviewer.ctx,{record_id:r.id,expected_version:r.object_version,decision:'APPROVE',reason:'synthetic reviewed catalogue',operation_key:key()});const q={audition_mode:S.offer.mode,max_price_minor:S.offer.unit_minor};assert.equal((await get(q)).items.length,1);
 const selected=(await get(q)).items[0].item;const body={offer_id:selected.id,offer_sha256:selected.offer_sha256,appointment:S.appointment},operation=key();assert.ok(body.offer_sha256);
 const book=(who=S.buyer,op=operation)=>call('POST','/auditions/bookings',{who,body,party:who.personal_party_id,operation:op,schema:'AuditionResponse'});
 let booking=ok(await book());assert.equal(ok(await book()).id,booking.id);assert.equal(booking.current_status,'SAFETY_REVIEW');
 booking=ok(await call('POST','/auditions/bookings/'+booking.id+'/reviews',{who:S.reviewer,body:{decision:'APPROVE',checks:{purpose_verified:true,venue_verified:true,adult_parties_verified:true},reason:'synthetic independent venue review'},version:booking.object_version,schema:'AuditionResponse'}));
 const order=ok(await call('POST','/auditions/checkout',{body:{booking_id:booking.id,booking_sha256:booking.content_sha256},party:S.buyer.personal_party_id,schema:'TradeRecordResponse'}));assert.equal(order.data.quote.total_minor,selected.unit_minor);assert.equal(order.data.financial.received_minor,0);
 assert.equal((await call('GET','/auditions/bookings/'+booking.id+'/contacts',{party:S.buyer.personal_party_id,schema:'AuditionResponse'})).error.code,'AUDITION_CONTACT_NOT_AVAILABLE');
assert.equal((await get({audition_mode:S.offer.mode==='OFFLINE'?'ONLINE_MATERIALS':'OFFLINE'})).items.length,0);
 r=await S.auditions.offerStatus(S.seller.ctx,{party_id:S.seller.personal_party_id,record_id:r.id,expected_version:r.object_version,public_booking:true,public_price:false,operation_key:key()});assert.equal((await get(q)).items.length,0);assert.equal((await get()).items[0].item.unit_minor,null);
 await S.auditions.offerStatus(S.seller.ctx,{party_id:S.seller.personal_party_id,record_id:r.id,expected_version:r.object_version,public_booking:false,public_price:false,operation_key:key()});assert.equal((await get()).items.length,0);assert.notEqual((await book(S.buyer2,key())).status,200);
}));
