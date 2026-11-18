'use strict';
const {createHmac,timingSafeEqual}=require('node:crypto'),A=require('../artists/context'),C=require('./context'),P=require('./distance-policy');
const {id,ref,shape,label,error}=require('../party/policy'),{catalogCityValues,catalogCities}=require('../party/catalog-city');
function summary(offerId,row){return {offer_id:offerId,object_version:row?.object_version||0,enabled:!!row?.enabled,notice_version:P.NOTICE_VERSION,updated_at:row?A.instant(row.updated_at):null};}
function createDistance({db,resolvePrincipal,secret}){
 const actor=A.createActor(resolvePrincipal);
 const mac=(text,scope)=>createHmac('sha256',secret).update(JSON.stringify(['audition-distance-v1',scope,text])).digest();
 function decode(value,scope){if(value===undefined)return {distance_km:-1,id:''};try{if(typeof value!=='string'||value.length>512)throw 0;const [text,hash,extra]=value.split('.');if(extra||!text||!/^[A-Za-z0-9_-]+$/.test(text)||!/^[a-f0-9]{64}$/.test(hash)||!timingSafeEqual(mac(text,scope),Buffer.from(hash,'hex')))throw 0;const p=JSON.parse(Buffer.from(text,'base64url').toString());shape(p,['distance_km','id']);if(!Number.isInteger(p.distance_km)||p.distance_km<0||p.distance_km>500)throw 0;id(p.id);return p;}catch{throw error('INVALID_CURSOR',400);}}
 async function owned(tx,a,i){const r=await C.load(tx,i.record_id,'OFFER'),p=await A.person(tx,r.data.offer.person_id);await A.self(tx,a,p,i.party_id);return r;}
 return {
 async read(ctx,i){shape(i,['record_id','party_id']);return db.withTransaction(async tx=>{const a=await actor(tx,ctx),r=await owned(tx,a,i),row=await A.one(tx,'SELECT * FROM audition_distance_locations WHERE offer_id=? FOR SHARE',[r.id]);return {...summary(r.id,row),grid:row?.enabled?{latitude_grid:row.latitude_grid,longitude_grid:row.longitude_grid}:null};});},
 async set(ctx,i){
  shape(i,['record_id','party_id','expected_version','enabled','grid','consent','operation_key']);ref(i.operation_key);
  if(typeof i.enabled!=='boolean'||!Number.isInteger(i.expected_version)||i.expected_version<0||i.expected_version>4294967294)throw error('INVALID_INPUT',400);
  let point=null;if(i.enabled){P.consent(i.consent);point=P.grid(i.grid);}else if(i.grid!==undefined||i.consent!==undefined)throw error('INVALID_INPUT',400);
  return db.withTransaction(async tx=>{
   const a=await actor(tx,ctx),r=await owned(tx,a,i);
   if(i.enabled){if(r.current_status!=='PUBLISHED'||r.data.offer.mode!=='OFFLINE'||!r.data.offer.public_booking)throw error('AUDITION_DISTANCE_NOT_PUBLIC',409);await require('./offer-context').usable(tx,r);}
   const current=await A.one(tx,'SELECT * FROM audition_distance_locations WHERE offer_id=? FOR UPDATE',[r.id]);
   await C.command(tx,a,'DISTANCE_LOCATION',i,async()=>{
    if((current?.object_version||0)!==i.expected_version)throw error('VERSION_CONFLICT',412);
    const at=await A.now(tx),next=i.expected_version+1;
    await tx.execute('INSERT INTO audition_distance_locations(offer_id,object_version,enabled,latitude_grid,longitude_grid,consent_account_id,notice_version,updated_at) VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE object_version=VALUES(object_version),enabled=VALUES(enabled),latitude_grid=VALUES(latitude_grid),longitude_grid=VALUES(longitude_grid),consent_account_id=VALUES(consent_account_id),notice_version=VALUES(notice_version),updated_at=VALUES(updated_at)',[r.id,next,i.enabled?1:0,point?.latitude_grid??null,point?.longitude_grid??null,a.id,P.NOTICE_VERSION,at.slice(0,23).replace('T',' ')]);
    // Audit references the unchanged offer, never the point or request body.
    await C.audit(tx,a,r,i.enabled?'AUDITION_DISTANCE_CONSENTED':'AUDITION_DISTANCE_WITHDRAWN');
    return {offer_id:r.id,object_version:next,enabled:i.enabled,notice_version:P.NOTICE_VERSION,updated_at:at};
   });
   // Do not revive a previous location after withdrawal when an old key returns.
   return summary(r.id,await A.one(tx,'SELECT * FROM audition_distance_locations WHERE offer_id=? FOR SHARE',[r.id]));
  });
 },
 async search(ctx,i){
  shape(i,['origin','consent','max_distance_km','city','q','cursor','limit']);P.consent(i.consent);const origin=P.grid(i.origin),limit=i.limit??20,max=i.max_distance_km;
  if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(max)||max<1||max>500)throw error('INVALID_DISTANCE_FILTER',400);
  if(i.city!==undefined)label(i.city,100);if(i.q!==undefined)label(i.q,100);
  const city=i.city?(catalogCities.find(c=>c.code===i.city.trim())?.name||catalogCityValues(i.city.trim())[0]):'',q=i.q?i.q.trim().normalize('NFKC').toLowerCase():'';
  return db.withTransaction(async tx=>{
   const a=await actor(tx,ctx),scope=[a.id,origin,max,city,q],items=[];let after=decode(i.cursor,scope),more=null;
   const rad=Math.PI/18000,lat=origin.latitude_grid*rad,lon=origin.longitude_grid*rad;
   const distance='CEILING(ROUND(6371*ACOS(LEAST(1,GREATEST(-1,SIN(?)*SIN(l.latitude_grid*PI()/18000)+COS(?)*COS(l.latitude_grid*PI()/18000)*COS(l.longitude_grid*PI()/18000-?)))),6))';
   // Bounded scans keep a continuation even when eligibility filters empty a page.
   for(let batch=0;batch<10;batch++){
    const capacity=limit-items.length;
    const rows=(await tx.execute("SELECT * FROM (SELECT r.*,l.object_version location_version,l.latitude_grid,l.longitude_grid,"+distance+" distance_km FROM audition_distance_locations l JOIN audition_records r ON r.id=l.offer_id WHERE l.enabled=1 AND l.notice_version=? AND r.kind='OFFER' AND r.current_status='PUBLISHED' AND JSON_UNQUOTE(JSON_EXTRACT(r.data_json,'$.offer.mode'))='OFFLINE'"+(city?" AND JSON_UNQUOTE(JSON_EXTRACT(r.data_json,'$.offer.city')) IN ("+catalogCityValues(city).map(()=>'?').join(',')+")":'')+") candidates WHERE distance_km<=? AND (distance_km>? OR (distance_km=? AND id>?)) ORDER BY distance_km,id LIMIT ?",[lat,lat,lon,P.NOTICE_VERSION,...(city?catalogCityValues(city):[]),max,after.distance_km,after.distance_km,after.id,capacity+1]))[0];
    for(const raw of rows.slice(0,capacity)){
     try{
      const r=await C.load(tx,raw.id,'OFFER','FOR SHARE'),location=await A.one(tx,'SELECT * FROM audition_distance_locations WHERE offer_id=? FOR SHARE',[r.id]);
      if(!location?.enabled||location.object_version!==raw.location_version||r.current_status!=='PUBLISHED'||r.data.offer.mode!=='OFFLINE'||!r.data.offer.public_booking||!r.data.offer.slots.some(s=>s.ends_at>new Date().toISOString()))continue;
      await require('./offer-context').usable(tx,r);const item=C.publicOffer(r);
      if(!require('../discovery/search').matches('AUDITION',item,q))continue;
      items.push({offer:item,distance_km:Number(raw.distance_km)});
     }catch(e){if(![403,404,409].includes(e.status))throw e;}
    }
    const last=rows[Math.min(capacity,rows.length)-1];more=rows.length>capacity?{distance_km:Number(last.distance_km),id:last.id}:null;
    if(!more||items.length===limit)break;after=more;
   }
   let cursor=null;if(more){const text=Buffer.from(JSON.stringify(more)).toString('base64url');cursor=text+'.'+mac(text,scope).toString('hex');}
   return {basis:'DECLARED_SERVICE_AREA_GRID',approximate:true,distance_unit:'KM_CEILING',city:city||null,max_distance_km:max,items,next_cursor:cursor};
  });
 }
 };
}
module.exports={createDistance};
