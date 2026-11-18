"use strict";
// Reuse the original public visibility checks in this transaction. Never store
// titles, private details, thumbnails or evidence in a personal collection.
async function read(tx,kind,key){
 if(kind==='ARTIST'){const {p,r}=await require('../artists/public-access').loadPublicListing(tx,key);return {title:r.data.display_name,city:r.data.city};}
 if(kind==='STOCK'){const r=await require('../stock/context').listed(tx,key);return {title:r.data.title,city:r.data.city};}
 const r=await require('../notices/context').liveNotice(tx,key);return {title:r.data.notice.title,city:r.data.notice.city};
}
async function visible(tx,kind,key){try{return await read(tx,kind,key);}catch(e){if([403,404,409].includes(e.status))return null;throw e;}}
module.exports={read,visible};
