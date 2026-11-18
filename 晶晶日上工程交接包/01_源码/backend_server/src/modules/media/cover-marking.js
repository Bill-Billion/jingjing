'use strict';
const {error}=require('../party/policy');

function previewMarking(tags={}) {
 const keys=['ai_label','marking_policy_sha256','marking_variant'];
 if(!keys.some(k=>Object.hasOwn(tags,k)))return null;
 if(typeof tags.ai_label!=='string'||!tags.ai_label.trim()||tags.ai_label.length>100||/[\x00-\x1f]/.test(tags.ai_label)
  ||!/^[a-f0-9]{64}$/.test(tags.marking_policy_sha256||'')||tags.marking_variant!=='preview')throw error('MEDIA_OUTPUT_NOT_VERIFIED',503);
 return {ai_label:tags.ai_label,marking_policy_sha256:tags.marking_policy_sha256,marking_variant:'preview'};
}

// Internal label metadata carried in a JPEG COM segment, not a legal-certification format.
// Insert before the first scan, retaining APP headers and encoded pixels unchanged.
function embedComment(body,comment) {
 const text=Buffer.from(comment,'utf8');
 if(!Buffer.isBuffer(body)||body.length<4||body[0]!==255||body[1]!==216||text.length<1||text.length>2048)throw error('MEDIA_OUTPUT_NOT_VERIFIED',503);
 let pos=2;
 while(pos+4<=body.length){
  const start=pos;
  if(body[pos++]!==255)break;
  while(body[pos]===255)pos++;
  const marker=body[pos++];
  if(marker===0xda){
   const segment=Buffer.alloc(4);segment[0]=255;segment[1]=254;segment.writeUInt16BE(text.length+2,2);
   return Buffer.concat([body.subarray(0,start),segment,text,body.subarray(start)]);
  }
  if(marker===0xd8||marker===0xd9||marker===0||marker===1||(marker>=0xd0&&marker<=0xd7)||pos+2>body.length)break;
  const length=body.readUInt16BE(pos);if(length<2||pos+length>body.length)break;pos+=length;
 }
 throw error('MEDIA_OUTPUT_NOT_VERIFIED',503);
}

function readComment(body) {
 if(!Buffer.isBuffer(body)||body.length<4||body[0]!==255||body[1]!==216)throw error('MEDIA_OUTPUT_NOT_VERIFIED',503);
 let pos=2,comment=null;
 while(pos+4<=body.length){
  if(body[pos++]!==255)break;
  while(body[pos]===255)pos++;
  const marker=body[pos++];
  if(marker===0xda)return comment;
  if(marker===0xd8||marker===0xd9||marker===0||marker===1||(marker>=0xd0&&marker<=0xd7)||pos+2>body.length)break;
  const length=body.readUInt16BE(pos);if(length<2||pos+length>body.length)break;
  if(marker===0xfe)comment=body.subarray(pos+2,pos+length).toString('utf8');
  pos+=length;
 }
 throw error('MEDIA_OUTPUT_NOT_VERIFIED',503);
}

module.exports={previewMarking,embedComment,readComment};
