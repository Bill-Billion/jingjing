"use strict";
const {id,shape,error}=require('../party/policy');
const A=require('../artists/context'),S=require('./sources'),{cursors}=require('./policy');
function createPersonalCenterRepository(db,{resolvePrincipal=async()=>null,secret}={}){
 const actor=A.createActor(resolvePrincipal),cursor=cursors(secret);
 async function section(tx,a,principal,party,category,source,limit,after){
  const def=S.definitions[source],scope=[a.id,party,category,source],position=cursor.decode(scope,after),filter=def.filter({party,account:a.id});
  const conditions=[filter.where],args=[...filter.args];if(def.kind){conditions.push('r.kind=?');args.push(def.kind);}
  if(position){conditions.push('(r.created_at<? OR (r.created_at=? AND r.id<?))');args.push(position.at,position.at,position.id);}
  const [rows]=await tx.execute("SELECT r.id source_id,DATE_FORMAT(r.created_at,'%Y-%m-%d %H:%i:%s.%f') sort_at FROM "+def.table+' r WHERE '+conditions.join(' AND ')+' ORDER BY r.created_at DESC,r.id DESC LIMIT ?',[...args,limit+1]);
  const items=[];for(const row of rows.slice(0,limit)){let value;try{value=await S.read(tx,principal,def,row.source_id,party);}catch(e){if([403,404].includes(e.status||e.statusCode))continue;throw e;}items.push(await S.summarize(tx,def,row,value,party));}
  const last=rows.slice(0,limit).at(-1);return {source,label:def.label,status:'AVAILABLE',items,next_cursor:rows.length>limit?cursor.encode(scope,{at:last.sort_at,id:last.source_id}):null,error_code:null,retryable:false};
 }
 return {async list(ctx,input){shape(input,['party_id','category','source','cursor','limit']);const party=id(input.party_id),category=input.category,limit=input.limit??20;
  if(!['contracts','works','income'].includes(category)||!Number.isInteger(limit)||limit<1||limit>50)throw error('INVALID_PERSONAL_CENTER_QUERY',400);
  const names=Object.keys(S.definitions).filter(s=>S.definitions[s].category===category);
  if(input.source!==undefined&&!names.includes(input.source))throw error('INVALID_PERSONAL_CENTER_SOURCE',400);
  if(input.cursor!==undefined&&!input.source)throw error('CURSOR_SOURCE_REQUIRED',400);
  const selected=input.source?[input.source]:names,principal=await resolvePrincipal(ctx);
  // Each source has its own transaction and retry; never turn a failed source into an empty success.
  const sections=[];for(const source of selected){try{sections.push(await db.withTransaction(async tx=>{const a=await actor(tx,ctx);await A.owner(tx,a,party);return section(tx,a,principal,party,category,source,limit,input.cursor);}));}catch(e){if((e.status||e.statusCode||500)<500)throw e;sections.push({source,label:S.definitions[source].label,status:'UNAVAILABLE',items:[],next_cursor:null,error_code:'PERSONAL_CENTER_SOURCE_UNAVAILABLE',retryable:true});}}
  // Recheck identity after all independent reads, including a wholly failed set.
  await db.withTransaction(async tx=>{const a=await actor(tx,ctx);await A.owner(tx,a,party);});
  return {party_id:party,category,pagination:'PER_SOURCE_CREATED_AT_DESC',sections,partial:sections.some(s=>s.status==='UNAVAILABLE'),notice:category==='income'?'仅已登记并入账的收入核算；每笔分别显示币种和环境；无全账户到账合计':'按来源分类展示；翻页和失败重试请指定来源；文件和办理权限在原业务重新核验'};
 }};
}
module.exports={createPersonalCenterRepository};
