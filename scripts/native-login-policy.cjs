// Temporary native acceptance only. Not loaded by the production API.
'use strict';
const fs=require('node:fs');
const ALLOWED=new Set(['POST /api/v1/auth/sms-challenges','POST /api/v1/auth/sessions','DELETE /api/v1/auth/sessions/current','GET /api/v1/me','GET /api/v1/me/parties','GET /api/v1/me/invitations']);
function authorize(config,{method,path,body},now=Date.now()) {
 if(!config.armed||!Number.isFinite(config.expiresAt)||now>=config.expiresAt)return 503;
 if(!ALLOWED.has(method+' '+path))return 404;
 if(method==='POST'&&(!/^1[3-9][0-9]{9}$/.test(config.phone)||body?.phone!==config.phone))return 403;
 return 200;
}
function reserve(file,config,now=Date.now()) {
 if(authorize(config,{method:'POST',path:'/api/v1/auth/sms-challenges',body:{phone:config.phone}},now)!==200)throw Error('TEST_CLOSED');
 if(config.maxRequests!==2||config.maxCostCny!==1||config.automaticRetry!==false)throw Error('INVALID_CONSENT');
 const ledger=JSON.parse(fs.readFileSync(file,'utf8'));
 if(ledger.consentId!==config.consentId||!Array.isArray(ledger.attempts)||ledger.attempts.length>=2)throw Error('TEST_SMS_LIMIT');
 ledger.attempts.push({sequence:ledger.attempts.length+1,reservedAt:new Date(now).toISOString(),state:'REQUEST_RESERVED'});
 const next=file+'.next';fs.writeFileSync(next,JSON.stringify(ledger)+'\n',{mode:0o600});fs.renameSync(next,file);
 return ledger.attempts.length;
}
module.exports={authorize,reserve};
