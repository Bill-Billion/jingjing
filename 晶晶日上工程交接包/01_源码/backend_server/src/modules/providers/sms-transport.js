 'use strict';
const https = require('node:https');
const { failure } = require('./readiness');
const ENDPOINT = 'sms.volcengineapi.com';
const safeRef = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,160}$/.test(value);
function signedRequest(env, { phone, code }) {
  if (!/^1[3-9][0-9]{9}$/.test(phone) || typeof phone !== 'string' || typeof code !== 'string' || !/^[0-9]{6}$/.test(code)) throw failure('INVALID_SMS_INPUT');
  const body = JSON.stringify({ SmsAccount:env.SMS_ACCOUNT, Sign:env.SMS_SIGN_NAME, TemplateID:env.SMS_LOGIN_TEMPLATE_ID, TemplateParam:JSON.stringify({code}), PhoneNumbers:phone });
  // Load only the local signer, never the SDK's HTTP client or retry behavior.
  const Signer = require('@volcengine/openapi/lib/base/sign').default;
  const signed = { method:'POST', pathname:'/', params:{Action:'SendSms',Version:'2020-01-01'}, region:env.SMS_REGION || 'cn-north-1',
    headers:{Host:ENDPOINT,'Content-Type':'application/json; charset=utf-8'}, body };
  new Signer(signed, 'volcSMS').addAuthorization({accessKeyId:env.VOLC_ACCESS_KEY_ID,secretKey:env.VOLC_SECRET_ACCESS_KEY});
  return {body, options:{protocol:'https:',hostname:ENDPOINT,port:443,path:'/?Action=SendSms&Version=2020-01-01',method:'POST',
    headers:{...signed.headers,'Content-Length':Buffer.byteLength(body)},agent:false,rejectUnauthorized:true}};
}
function sendSms(env, input, {signal, request=https.request, timeoutMs=10000}={}) {
  if (signal?.aborted) return Promise.reject(failure('PROVIDER_OUTCOME_UNKNOWN'));
  const {body,options} = signedRequest(env,input);
  return new Promise((resolve,reject) => {
    let settled=false, req, timer;
    const finish=(error,result) => {
      if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);
      if(error){req?.destroy();reject(error);}else resolve(result);
    };
    const uncertain=()=>finish(failure('PROVIDER_OUTCOME_UNKNOWN'));
    const abort=uncertain;
    signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted){uncertain();return;}
    timer=setTimeout(uncertain,timeoutMs);
    try {
      // Native HTTPS does not follow redirects or retry. Exactly one request per invocation.
      req=request(options,res=>{
        if(settled){res.destroy();return;}
        const chunks=[];let size=0;
        res.on('error',uncertain);res.on('aborted',uncertain);
        res.on('close',()=>{if(!res.complete)uncertain();});
        res.on('data',chunk=>{if(settled)return;size+=chunk.length;if(size>65536){uncertain();return;}chunks.push(Buffer.from(chunk));});
        res.on('end',()=>{
          if(settled)return;
          let response;try{response=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{uncertain();return;}
          const ids=response?.Result?.MessageID,meta=response?.ResponseMetadata;
          if(res.statusCode!==200 || meta?.Error || !safeRef(meta?.RequestId) || !Array.isArray(ids) || ids.length!==1 || !safeRef(ids[0])) {
            finish(failure('SMS_ACCEPTANCE_NOT_CONFIRMED'));return;
          }
          finish(null,{accepted:true,provider_request_id:meta.RequestId});
        });
      });
      req.on('error',uncertain);
      if(settled){req.destroy();return;}
      req.setTimeout(timeoutMs,uncertain);
      req.end(body);
    } catch { uncertain(); }
  });
}
module.exports={signedRequest,sendSms};
