"use strict";
const {createHmac,timingSafeEqual}=require('node:crypto');
const {error,id}=require('../party/policy');
function cursors(secret){
 if(typeof secret!=='string'||secret.length<32)throw Error('Personal center requires server secret');
 const mac=(scope,body)=>createHmac('sha256',secret).update(JSON.stringify(['personal-center-v1',scope,body])).digest('hex');
 return {
  encode(scope,position){const body=Buffer.from(JSON.stringify(position)).toString('base64url');return body+'.'+mac(scope,body);},
  decode(scope,value){if(value===undefined)return null;try{if(typeof value!=='string'||value.length>700)throw Error();const [body,signature,extra]=value.split('.');if(extra||!body||!signature||!/^[a-f0-9]{64}$/.test(signature)||!timingSafeEqual(Buffer.from(signature),Buffer.from(mac(scope,body))))throw Error();const p=JSON.parse(Buffer.from(body,'base64url').toString());if(Object.keys(p).sort().join(',')!=='at,id'||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}$/.test(p.at))throw Error();id(p.id);return p;}catch{throw error('INVALID_CURSOR',400);}}
 };
}
function money(entries){
 let accrued=0,adjustment=0,paid=0;
 const safe=n=>{if(!Number.isSafeInteger(n))throw error('INCOME_AMOUNT_OVERFLOW',503);return n;};
 for(const e of entries){const amount=safe(Number(e.amount_minor));if(e.category==='ACCRUAL')accrued=safe(accrued+amount);else if(e.category==='ADJUSTMENT')adjustment=safe(adjustment+amount);else if(['PAYOUT','PAYOUT_RETURN'].includes(e.category))paid=safe(paid-amount);else throw error('INCOME_ENTRY_INVALID',503);}
 const balance=safe(safe(accrued+adjustment)-paid);
 return {accrued_minor:accrued,adjustment_minor:adjustment,verified_paid_minor:paid,pending_minor:Math.max(0,balance),recovery_due_minor:Math.max(0,-balance)};
}
module.exports={cursors,money};
