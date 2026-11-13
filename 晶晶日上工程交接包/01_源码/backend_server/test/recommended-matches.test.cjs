'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID:key}=require('node:crypto');
const {createRecommendedMatches,createRecommendations}=require('../src/modules/discovery/recommendations'),{digest}=require('../src/modules/governance/content');
function fixture(){
 const account=key(),data={personalization:false};let version=0,change=false;
 const db={withTransaction:async fn=>fn({execute:async sql=>{if(sql.includes('identity_accounts'))return [[{id:account,current_status:'ACTIVE'}]];if(sql.includes('privacy_preferences'))return [[{object_version:version,data_json:data,data_sha256:digest(data)}]];throw Error('Disabled personalization read private activity: '+sql);}})};
 const entries=Array.from({length:600},(_,i)=>({id:key(),city:'synthetic',title:'public',description:'synthetic',unit_minor:i<100?200:100,license:{scope:'PERSONAL_NONCOMMERCIAL'}}));
 const catalog=async(ctx,{after,limit})=>{if(change){version++;change=false;}const start=Number(after||0);return {items:entries.slice(start,start+limit),next_cursor:start+limit<entries.length?String(start+limit):null};};
 const options={db,resolvePrincipal:async()=>({subject_ref:'synthetic:test'}),catalogs:{STOCK:catalog},secret:'synthetic matching test key'};
 return {match:createRecommendedMatches(options),recommend:createRecommendations(options),entries,change:()=>{change=true;}};
}
test('bounded matching filters all scanned candidates before paging and never reads opted-out activity',async()=>{
 const f=fixture(),ids=[];let cursor;do{const p=await f.match({}, {kind:'STOCK',max_price_minor:100,limit:100,...cursor?{cursor}:{}});assert.equal(p.personalized,false);assert.equal(p.catalog_truncated,true);assert.equal(p.candidate_limit,500);assert.equal(p.requires_business_validation,true);assert.equal(p.price_personalized,false);assert.ok(p.items.every(x=>x.item.unit_minor===100&&x.reasons.includes('PUBLIC_PRICE_WITHIN_BUDGET')));ids.push(...p.items.map(x=>x.item.id));cursor=p.next_cursor;}while(cursor);
 assert.deepEqual(ids,f.entries.slice(100,500).map(x=>x.id));assert.equal(new Set(ids).size,400);
 assert.equal((await f.match({}, {kind:'STOCK',purpose:'COMMERCIAL_LIMITED',commercial_use:'BRAND_PROMOTION'})).items.length,0);
 await assert.rejects(f.match({}, {kind:'STOCK',min_halo:1}),{code:'MATCH_FILTER_NOT_APPLICABLE'});
});
test('matching cursor binds filters, account and endpoint; preference changes during reading reject stale output',async()=>{
 const f=fixture(),input={kind:'STOCK',max_price_minor:100,limit:1};const p=await f.match({},input);
 await assert.rejects(f.match({}, {...input,max_price_minor:101,cursor:p.next_cursor}),{code:'RECOMMENDATION_CHANGED'});
 await assert.rejects(fixture().match({}, {...input,cursor:p.next_cursor}),{code:'RECOMMENDATION_CHANGED'});
 await assert.rejects(f.recommend({}, {kind:'STOCK',cursor:p.next_cursor}),{code:'RECOMMENDATION_CHANGED'});
 const original=await f.recommend({}, {kind:'STOCK',limit:1});await assert.rejects(f.match({}, {...input,cursor:original.next_cursor}),{code:'RECOMMENDATION_CHANGED'});
 await assert.rejects(f.match({}, {...input,cursor:p.next_cursor+'x'}),{code:'INVALID_CURSOR'});
 f.change();await assert.rejects(f.match({},input),{code:'RECOMMENDATION_CHANGED'});
});
