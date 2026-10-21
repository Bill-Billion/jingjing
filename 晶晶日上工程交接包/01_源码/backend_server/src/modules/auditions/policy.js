"use strict";
const {shape,id,ref,label,error}=require('../party/policy');
const {list}=require('../artists/policy'),{amount,copy,instant}=require('../trade/policy');
function integer(v,min,max){if(!Number.isSafeInteger(v)||v<min||v>max)throw error('INVALID_AUDITION_RULE',400);return v;}
function terms(v){
 shape(v,['version','accept_hours','acceptance_hours','photo_count','video_count','payment_window_minutes','terms']);ref(v.version);label(v.terms,8000);
 integer(v.accept_hours,1,168);integer(v.acceptance_hours,1,720);integer(v.photo_count,1,30);integer(v.video_count,1,5);integer(v.payment_window_minutes,1,1440);return copy(v);
}
function appointment(v){
 shape(v,['mode','city','venue','address','starts_at','ends_at','purpose']);if(!['OFFLINE','ONLINE_MATERIALS'].includes(v.mode))throw error('INVALID_AUDITION_MODE',400);
 for(const k of ['city','venue','address','purpose'])label(v[k],k==='purpose'?2000:300);
 instant(v.starts_at);instant(v.ends_at);if(v.starts_at>=v.ends_at||Date.parse(v.ends_at)-Date.parse(v.starts_at)>86400000)throw error('INVALID_APPOINTMENT',400);
 if(v.mode==='OFFLINE'&&/酒店房间|宾馆房间|客房|陪侍|色情|hotel.room/i.test(v.address+' '+v.venue+' '+v.purpose))throw error('UNSAFE_AUDITION_REQUEST',400);
 return copy(v);
}
function offer(v){
 shape(v,['person_id','avatar_id','public_consent_id','rule_id','title','city','service_area','mode','public_booking','public_price','unit_minor','slots','terms']);
 for(const k of ['person_id','avatar_id','public_consent_id','rule_id'])id(v[k]);for(const k of ['title','city','service_area','terms'])label(v[k],k==='terms'?8000:300);
 if(!['OFFLINE','ONLINE_MATERIALS'].includes(v.mode)||typeof v.public_booking!=='boolean'||typeof v.public_price!=='boolean')throw error('INVALID_AUDITION_OFFER',400);amount(v.unit_minor);
 if(!Array.isArray(v.slots)||!v.slots.length||v.slots.length>60)throw error('INVALID_AUDITION_SLOTS',400);
 v.slots.forEach(s=>{shape(s,['starts_at','ends_at']);instant(s.starts_at);instant(s.ends_at);if(s.starts_at>=s.ends_at)throw error('INVALID_AUDITION_SLOTS',400);});return copy(v);
}
function media(v,rules){shape(v,['photos','videos','consent_id']);id(v.consent_id);list(v.photos,id,30);list(v.videos,id,5);if(v.photos.length!==rules.photo_count||v.videos.length!==rules.video_count||new Set([...v.photos,...v.videos]).size!==v.photos.length+v.videos.length)throw error('AUDITION_DELIVERY_COUNT_MISMATCH',400);return copy(v);}
function cleanMessage(v){label(v,4000);if(/https?:|www\.|微信|加微|私下转账|站外付款|1[3-9]\d{9}/i.test(v))throw error('MESSAGE_REQUIRES_MODERATION',400);return v;}
function conversation(d,order,at){if(d.dispute||d.reschedule)return 'FROZEN';if(['CANCELLED','REFUND_REQUIRED','REFUNDED','FULFILLED'].includes(d.status))return 'ARCHIVED';if(!d.accepted_at)return 'AWAITING_ACCEPTANCE';if(order.current_status!=='PAID'||order.data.financial.refunded_minor>0)return 'AWAITING_VERIFIED_PAYMENT';return 'OPEN';}
module.exports={integer,terms,appointment,offer,media,cleanMessage,conversation};
