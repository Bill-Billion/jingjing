'use strict';
const C=require('./context');
const {id,error}=require('../party/policy');

// Portrait choice belongs to an immutable, reviewed listing, never to a private
// archive or the first uploaded file. Existing listings deliberately have no choice.
async function validatePortrait(tx,listing){
 const selected=listing.data.primary_portrait_asset_id;
 if(selected==null)return;
 id(selected);
 if(!listing.data.preview_asset_ids.includes(selected))throw error('ARTIST_PORTRAIT_NOT_IN_PREVIEW',409);
 const asset=await C.one(tx,'SELECT media_type FROM supply_assets WHERE id=? FOR SHARE',[selected]);
 if(!asset||!['image/jpeg','image/png'].includes(asset.media_type))throw error('ARTIST_PORTRAIT_IMAGE_REQUIRED',409);
}
async function manifest(tx,p,r){
 const items=[];
 for(const assetId of r.data.preview_asset_ids){
  const a=await C.one(tx,'SELECT id,media_type,byte_size,content_sha256 FROM supply_assets WHERE id=? FOR SHARE',[assetId]);
  if(!a)throw error('PRIVATE_MATERIAL_NOT_READY',409);
  items.push({asset_id:a.id,media_type:a.media_type,byte_size:a.byte_size,content_sha256:a.content_sha256,
   media_kind:a.media_type.startsWith('image/')?'IMAGE':a.media_type.startsWith('audio/')?'AUDIO':a.media_type.startsWith('video/')?'VIDEO':'DOCUMENT'});
 }
 return {listing_id:r.id,primary_portrait_asset_id:r.data.primary_portrait_asset_id||null,items};
}
module.exports={validatePortrait,manifest};
