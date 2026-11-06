'use strict';
const {createHmac,timingSafeEqual}=require('node:crypto');
const {error}=require('../party/policy');
const {digest}=require('../governance/content');
const A=require('../artists/context'),S=require('./search'),sources=require('../collections/source');
const VERSION='CITY_ACTIVITY_V1';
const city=v=>(v||'').normalize('NFKC').replace(/市$/,'').toLowerCase();
const itemCity=(kind,item)=>city(kind==='NOTICE'?item.notice.city:item.city);
const itemId=item=>item.id||item.listing_id;
function rank(kind,items,profile){
 return items.map((item,index)=>{const c=itemCity(kind,item),b=profile.purchased.has(c),h=profile.browsed.has(c);return {item,index,priority:profile.enabled?(b?2:h?1:0):0,reasons:profile.enabled?(b?['RECENT_PURCHASE_CITY']:h?['RECENT_BROWSING_CITY']:['PUBLIC_CATALOG']):['PUBLIC_CATALOG']};}).sort((a,b)=>b.priority-a.priority||a.index-b.index);
}
function createRecommendations({db,resolvePrincipal,catalogs,secret}){
 const actor=A.createActor(resolvePrincipal),mac=s=>createHmac('sha256',secret).update('recommendation:'+s).digest();
 async function profile(ctx){return db.withTransaction(async tx=>{
  const a=await actor(tx,ctx),p=await A.one(tx,'SELECT * FROM privacy_preferences WHERE account_id=?',[a.id]);let enabled=false;
  if(p){const d=A.parse(p.data_json);if(digest(d)!==p.data_sha256)throw error('STORED_CONTENT_MISMATCH',503);enabled=d.personalization===true;}
  const result={account:a.id,version:p?.object_version||0,enabled,browsed:new Set(),purchased:new Set()};
  // Opt-out never queries either browsing or transaction history.
  if(enabled){
   const settings=await A.one(tx,'SELECT * FROM personal_collection_settings WHERE account_id=?',[a.id]);
   if(settings?.history_enabled){const [rows]=await tx.execute("SELECT target_kind,target_id FROM personal_collection_entries WHERE account_id=? AND collection='HISTORY' AND expires_at>CURRENT_TIMESTAMP(3) ORDER BY sequence_id DESC LIMIT 100",[a.id]);for(const r of rows){const v=await sources.visible(tx,r.target_kind,r.target_id);if(v?.city)result.browsed.add(city(v.city));}}
   const [rows]=await tx.execute("SELECT t.data_json,t.data_sha256,s.listing_id FROM trade_records t JOIN stock_purchases s ON s.order_id=t.id JOIN parties p ON p.id=t.buyer_party_id WHERE p.kind='PERSON' AND p.personal_account_id=? ORDER BY t.created_at DESC,t.id LIMIT 100",[a.id]);
   for(const r of rows){const d=A.parse(r.data_json);if(digest(d)!==r.data_sha256)throw error('STORED_CONTENT_MISMATCH',503);if(!d.financial||!Number.isSafeInteger(d.financial.received_minor)||!Number.isSafeInteger(d.financial.refunded_minor)||d.financial.refunded_minor<0||d.financial.received_minor-d.financial.refunded_minor<=0)continue;const v=await sources.visible(tx,'STOCK',r.listing_id);if(v?.city)result.purchased.add(city(v.city));}
  }
  result.hash=digest([a.id,result.version,enabled,[...result.browsed].sort().map(c=>digest(c)),[...result.purchased].sort().map(c=>digest(c))]);return result;
 });}
 function decode(cursor,scope){if(cursor===undefined)return 0;try{if(typeof cursor!=='string'||cursor.length>800)throw 0;const [body,signature,...rest]=cursor.split('.');if(rest.length||!/^[a-f0-9]{64}$/.test(signature)||!timingSafeEqual(mac(body),Buffer.from(signature,'hex')))throw 0;const d=JSON.parse(Buffer.from(body,'base64url').toString());if(d.scope!==scope)throw error('RECOMMENDATION_CHANGED',409);if(!Number.isSafeInteger(d.offset)||d.offset<1||d.offset>500)throw 0;return d.offset;}catch(e){if(e.code==='RECOMMENDATION_CHANGED')throw e;throw error('INVALID_CURSOR',400);}}
 return async(ctx,input)=>{
  const p=S.query(input),before=await profile(ctx),items=[];let after='',more=null;
  // Public catalogs recheck visibility/consent. The limit is explicit to clients.
  for(let n=0;n<5;n++){const page=await catalogs[p.kind](ctx,{after,limit:100,...p.city?{city:p.city}:{}});items.push(...page.items.filter(x=>S.matches(p.kind,x,p.q)));more=page.next_cursor;if(!more)break;if(more===after)throw error('SEARCH_CURSOR_STALLED',503);after=more;}
  const current=await profile(ctx);if(current.hash!==before.hash)throw error('RECOMMENDATION_CHANGED',409);
  const ranked=rank(p.kind,items,current),scope=digest([VERSION,current.hash,p.kind,p.city,p.q,ranked.map(x=>digest([itemId(x.item),itemCity(p.kind,x.item),x.priority]))]),offset=decode(input.cursor,scope),selected=ranked.slice(offset,offset+p.limit);
  let next=null;if(offset+p.limit<ranked.length){const body=Buffer.from(JSON.stringify({scope,offset:offset+p.limit})).toString('base64url');next=body+'.'+mac(body).toString('hex');}
  return {kind:p.kind,city:p.city||null,q:p.q||null,algorithm_version:VERSION,personalized:current.enabled,principle:current.enabled?'RECENT_PURCHASE_CITY_THEN_BROWSING_CITY_THEN_CATALOG':'PUBLIC_CATALOG_ORDER',items:selected.map(x=>({item:x.item,reasons:x.reasons})),next_cursor:next,candidate_limit:500,catalog_truncated:!!more,price_personalized:false};
 };
}
module.exports={createRecommendations,rank,VERSION};
