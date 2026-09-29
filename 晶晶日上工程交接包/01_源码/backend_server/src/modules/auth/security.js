 'use strict';
const crypto=require('node:crypto');
const {error,shape,ref,id}=require('../party/policy');
function createSecurity(secret) {
 if(typeof secret!=='string'||! /^[A-Za-z0-9+/]{43}=$/.test(secret)||Buffer.from(secret,'base64').length!==32)throw error('AUTH_SECRET_REQUIRED',503);
 const key=Buffer.from(secret,'base64');
 const digest=(purpose,value)=>crypto.createHmac('sha256',key).update(JSON.stringify([purpose,value])).digest('hex');
 const cipherKey=Buffer.from(digest('encryption','v1'),'hex');
 return Object.freeze({digest,
  seal(value,context){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',cipherKey,iv);c.setAAD(Buffer.from(context));return Buffer.concat([iv,Buffer.concat([c.update(value,'utf8'),c.final()]),c.getAuthTag()]).toString('base64url');},
  open(value,context){const b=Buffer.from(value,'base64url');if(b.length<29)throw error('AUTH_RESULT_UNAVAILABLE',503);const c=crypto.createDecipheriv('aes-256-gcm',cipherKey,b.subarray(0,12));c.setAAD(Buffer.from(context));c.setAuthTag(b.subarray(-16));try{return Buffer.concat([c.update(b.subarray(12,-16)),c.final()]).toString('utf8');}catch{throw error('AUTH_RESULT_UNAVAILABLE',503);}},
  matches(a,b){return typeof a==='string'&&typeof b==='string'&&/^[a-f0-9]{64}$/.test(a)&&/^[a-f0-9]{64}$/.test(b)&&crypto.timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));},
 });
}
function phone(value){if(typeof value!=='string'||!/^1[3-9][0-9]{9}$/.test(value))throw error('INVALID_INPUT',400);return value;}
function config(input={}) {
 shape(input,['challengeMs','resendMs','sessionMs','maxAttempts','phoneSendsPerHour','ipSendsPerHour','totalSendsPerHour','ipLoginsPerMinute']);
 const result={challengeMs:300000,resendMs:60000,sessionMs:86400000,maxAttempts:5,phoneSendsPerHour:5,ipSendsPerHour:20,totalSendsPerHour:100,ipLoginsPerMinute:30,...input};
 for(const [k,v] of Object.entries(result))if(!Number.isSafeInteger(v)||v<1)throw error('INVALID_AUTH_CONFIG',503);
 if(result.challengeMs>600000||result.resendMs>result.challengeMs||result.sessionMs>604800000||result.maxAttempts>10)throw error('INVALID_AUTH_CONFIG',503);
 return Object.freeze(result);
}
module.exports={createSecurity,phone,config,error,shape,ref,id};
