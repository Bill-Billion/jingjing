'use strict';
const crypto=require('node:crypto');
const fail=code=>Object.assign(new Error(code),{code});
function canonical(v){if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';}
const hash=v=>crypto.createHash('sha256').update(Buffer.isBuffer(v)||typeof v==='string'?v:canonical(v)).digest('hex');
function name(v){if(typeof v!=='string'||!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(v))throw fail('UNSUPPORTED_IDENTIFIER');return '`'+v+'`';}
function encode(v){if(v===null)return {t:'null'};if(Buffer.isBuffer(v))return {t:'bytes',v:v.toString('base64')};if(typeof v==='bigint')return {t:'integer',v:v.toString()};if(typeof v==='number'){if(!Number.isFinite(v)||Number.isInteger(v)&&!Number.isSafeInteger(v))throw fail('UNSAFE_NUMBER');return {t:'number',v};}if(typeof v==='string')return {t:'text',v};if(typeof v==='object')return {t:'json',v};throw fail('UNSUPPORTED_VALUE');}
function decode(c){if(!c||typeof c!=='object')throw fail('INVALID_CELL');switch(c.t){case 'null':return null;case 'bytes':{const b=Buffer.from(c.v,'base64');if(b.toString('base64')!==c.v)throw fail('INVALID_CELL');return b;}case 'integer':if(typeof c.v!=='string'||!/^[-]?[0-9]+$/.test(c.v))throw fail('INVALID_CELL');return c.v;case 'number':if(typeof c.v!=='number'||!Number.isFinite(c.v)||Number.isInteger(c.v)&&!Number.isSafeInteger(c.v))throw fail('INVALID_CELL');return c.v;case 'text':if(typeof c.v!=='string')throw fail('INVALID_CELL');return c.v;case 'json':return JSON.stringify(c.v);default:throw fail('INVALID_CELL');}}
function tableHash(rows){return hash(rows.map(row=>hash(row)).sort());}
const MAX_BYTES=64*1024*1024,MAX_ROWS=100000;
module.exports={fail,canonical,hash,name,encode,decode,tableHash,MAX_BYTES,MAX_ROWS};
