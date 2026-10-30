'use strict';
const {createHmac,timingSafeEqual}=require('node:crypto');
const {shape,label,id,error}=require('../party/policy');
const {catalogCityValues,catalogCities:cities}=require('../party/catalog-city');
const kinds=Object.freeze(['ARTIST','STOCK','AUDITION','NOTICE']);
const normalize=value=>value.normalize('NFKC').toLowerCase();
function query(input){
 shape(input,['kind','city','q','cursor','limit']);
 if(!kinds.includes(input.kind))throw error('INVALID_SEARCH_KIND',400);
 const limit=input.limit===undefined?20:input.limit;
 if(!Number.isInteger(limit)||limit<1||limit>100)throw error('INVALID_LIMIT',400);
 let city='',q='';
 if(input.city!==undefined){label(input.city,100);const name=input.city.trim();city=cities.find(c=>c.code===name)?.name||catalogCityValues(name)[0];}
 if(input.q!==undefined){label(input.q,100);q=normalize(input.q.trim());}
 return {kind:input.kind,city,q,limit};
}
// Only explicit public fields participate. IDs, prices, consent and private
// records must not become searchable through generic object serialization.
function matches(kind,item,q){
 if(!q)return true;
 const fields=kind==='ARTIST'?[item.display_name,item.introduction,...item.tags]:
  kind==='STOCK'?[item.title,item.description]:kind==='AUDITION'?[item.title,item.service_area]:
  [item.notice.title,item.notice.description];
 return fields.filter(x=>typeof x==='string').some(x=>normalize(x).includes(q));
}
function createSearch({catalogs,secret}){
 const mac=(encoded,scope)=>createHmac('sha256',secret).update(JSON.stringify(['discovery-v1',scope,encoded])).digest();
 function decode(cursor,scope){
  if(cursor===undefined)return '';
  try{
   if(typeof cursor!=='string'||cursor.length>512)throw 0;
   const parts=cursor.split('.');if(parts.length!==2||!/^[A-Za-z0-9_-]+$/.test(parts[0])||!/^[a-f0-9]{64}$/.test(parts[1]))throw 0;
   if(!timingSafeEqual(mac(parts[0],scope),Buffer.from(parts[1],'hex')))throw 0;
   return id(Buffer.from(parts[0],'base64url').toString('utf8'));
  }catch{throw error('INVALID_CURSOR',400);}
 }
 return async(ctx,input,accountId)=>{
  id(accountId);const p=query(input),scope=[accountId,p.kind,p.city,p.q],items=[];
  let after=decode(input.cursor,scope),more=null;
  // Bound work without treating an empty filtered page as end of catalogue.
  // Reading at most the remaining output capacity avoids discarding matches.
  for(let batch=0;batch<10;batch++){
   const page=await catalogs[p.kind](ctx,{after,limit:p.limit-items.length,...(p.city?{city:p.city}:{})});
   items.push(...page.items.filter(item=>matches(p.kind,item,p.q)));
   more=page.next_cursor;
   if(!more||items.length===p.limit)break;
   if(more===after)throw error('SEARCH_CURSOR_STALLED',503);
   after=more;
  }
  let next=null;if(more){const encoded=Buffer.from(id(more)).toString('base64url');next=encoded+'.'+mac(encoded,scope).toString('hex');}
  return {kind:p.kind,city:p.city||null,q:p.q||null,items,next_cursor:next};
 };
}
module.exports={cities,kinds,query,matches,createSearch};
