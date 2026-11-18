'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createSearch,query,matches,cities}=require('../src/modules/discovery/search');
const account=randomUUID(),secret='synthetic search test secret';
const identity=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
function service(rows){return createSearch({secret,catalogs:{STOCK:async(ctx,{after,limit})=>{const tail=rows.filter(r=>r.id>after);return {items:tail.slice(0,limit),next_cursor:tail.length>limit?tail[limit-1].id:null};}}});}
test('city codes and aliases use identical filters; unknown city remains exact',()=>{
 for(const city of cities)for(const input of [city.code,city.name,city.name+'市'])assert.equal(query({kind:'STOCK',city:input}).city,city.name);
 assert.equal(query({kind:'STOCK',city:'沙市区'}).city,'沙市区');
 for(const input of [{kind:'PRIVATE'},{kind:'STOCK',q:[]},{kind:'STOCK',q:' '},{kind:'STOCK',limit:0},{kind:'STOCK',city:['北京']},{kind:'STOCK',private:true}])assert.throws(()=>query(input));
});
test('literal normalized public search excludes identifiers and non-public fields',()=>{
 assert.equal(matches('STOCK',{title:'ＡＢＣ百分比%',description:'故事',private:'secret'},'abc'),true);
 assert.equal(matches('STOCK',{title:'normal',description:'故事',id:'secret',private:'secret'},'secret'),false);
 assert.equal(matches('STOCK',{title:'normal',description:'故事'},'%'),false);
 assert.equal(matches('ARTIST',{display_name:'张三',tags:['武术'],introduction:'演员'},'武术'),true);
 assert.equal(matches('AUDITION',{title:'试镜',service_area:'朝阳'},'朝阳'),true);
 assert.equal(matches('NOTICE',{notice:{title:'通告',description:'招募'}},'招募'),true);
});
test('search crosses scan budget, returns resumable empty page and finds beyond first 100 without duplicates',async()=>{
 const rows=Array.from({length:124},(_,i)=>({id:identity(i+1),title:i<120?'unrelated':'needle',description:''}));
 const search=service(rows),found=[];let cursor,empty=0;
 do{const page=await search({}, {kind:'STOCK',q:'needle',limit:3,...(cursor?{cursor}:{})},account);if(!page.items.length&&page.next_cursor)empty++;found.push(...page.items.map(i=>i.id));cursor=page.next_cursor;}while(cursor);
 assert.ok(empty>0);assert.deepEqual(found,rows.slice(120).map(i=>i.id));assert.equal(new Set(found).size,4);
});
test('cursor rejects tampering, another account and changed filters; aliases and page size may change',async()=>{
 const search=service(Array.from({length:4},(_,i)=>({id:identity(i+1),title:'needle',description:''})));
 const p=await search({}, {kind:'STOCK',q:'needle',city:'北京',limit:1},account);
 for(const [input,actor] of [[{city:'上海'},account],[{q:'other'},account],[{},randomUUID()],[{cursor:p.next_cursor+'0'},account]])await assert.rejects(search({}, {kind:'STOCK',q:'needle',city:'北京',cursor:p.next_cursor,...input},actor),{code:'INVALID_CURSOR'});
 const next=await search({}, {kind:'STOCK',q:'ＮＥＥＤＬＥ',city:'beijing',cursor:p.next_cursor,limit:2},account);assert.deepEqual(next.items.map(i=>i.id),[identity(2),identity(3)]);
});
test('permission filtering and service failure propagate instead of restoring stale results',async()=>{
 let hidden=false;const search=createSearch({secret,catalogs:{STOCK:async()=>{if(hidden)throw Object.assign(new Error('lost'),{status:503});return {items:[],next_cursor:null};}}});
 assert.deepEqual((await search({}, {kind:'STOCK'},account)).items,[]);hidden=true;await assert.rejects(search({}, {kind:'STOCK'},account),{status:503});
});
