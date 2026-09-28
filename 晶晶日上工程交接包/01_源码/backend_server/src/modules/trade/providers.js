 'use strict';
const fs=require('node:fs');
const {createHash}=require('node:crypto');
const {createAdapter}=require('../providers/adapter');
const {createReadinessRepository,assertUsable}=require('../providers/readiness');
const {ref,id,error}=require('../party/policy');
const {yuanToMinor,minorToYuan,amount}=require('./policy');
function createTradeProviders(db,env={},testDependencies={}) {
 const repository=testDependencies.readiness||createReadinessRepository(db);
 const environment=env.NODE_ENV==='production'?'PRODUCTION':'SANDBOX';
 const descriptor=code=>({provider_kind:'PaymentProvider',provider_code:code,capability_code:'order_payment',environment});
 function configuration(code) {
  const prefix=code==='ALIPAY'?'TRADE_ALIPAY_':'TRADE_APPLE_';
  const fields=code==='ALIPAY'?['APP_ID','MERCHANT_ID','MERCHANT_PARTY_ID','PRIVATE_KEY','PUBLIC_KEY','NOTIFY_URL','CONFIG_REVISION']:['BUNDLE_ID','APP_APPLE_ID','MERCHANT_PARTY_ID','PRIVATE_KEY','KEY_ID','ISSUER_ID','ROOT_CERT_PATHS','CONFIG_REVISION'];
  const configured=env[prefix+'ENABLED']==='true'&&fields.every(k=>typeof env[prefix+k]==='string'&&env[prefix+k].trim());
  const revision=createHash('sha256').update(JSON.stringify([environment,...fields.map(k=>env[prefix+k]||'')])).digest('hex');
  return {provider:code,environment,app_id:env[prefix+(code==='ALIPAY'?'APP_ID':'BUNDLE_ID')]||'',merchant_id:env[prefix+(code==='ALIPAY'?'MERCHANT_ID':'APP_APPLE_ID')]||'',merchant_party_id:env[prefix+'MERCHANT_PARTY_ID']||'',config_revision:revision,configured:!!configured};
 }
 let alipay,appleClient,appleVerifier;
 function alipayClient(){if(!alipay){const {AlipaySdk}=require('alipay-sdk');alipay=testDependencies.alipay||new AlipaySdk({appId:env.TRADE_ALIPAY_APP_ID,privateKey:env.TRADE_ALIPAY_PRIVATE_KEY,alipayPublicKey:env.TRADE_ALIPAY_PUBLIC_KEY,keyType:'PKCS8',signType:'RSA2',gateway:environment==='PRODUCTION'?'https://openapi.alipay.com/gateway.do':'https://openapi-sandbox.dl.alipaydev.com/gateway.do',timeout:10000});}return alipay;}
 function apple(){if(!appleClient||!appleVerifier){const lib=require('@apple/app-store-server-library');const target=environment==='PRODUCTION'?lib.Environment.PRODUCTION:lib.Environment.SANDBOX;appleClient=testDependencies.appleClient||new lib.AppStoreServerAPIClient(env.TRADE_APPLE_PRIVATE_KEY,env.TRADE_APPLE_KEY_ID,env.TRADE_APPLE_ISSUER_ID,env.TRADE_APPLE_BUNDLE_ID,target);const roots=testDependencies.appleVerifier?[]:JSON.parse(env.TRADE_APPLE_ROOT_CERT_PATHS).map(p=>fs.readFileSync(p));const appId=Number(env.TRADE_APPLE_APP_APPLE_ID);if(!Number.isSafeInteger(appId)||appId<1)throw error('APPLE_APP_ID_REQUIRED',503);appleVerifier=testDependencies.appleVerifier||new lib.SignedDataVerifier(roots,true,target,env.TRADE_APPLE_BUNDLE_ID,appId);}return {client:appleClient,verifier:appleVerifier};}
 const snake=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k.replace(/[A-Z]/g,x=>'_'+x.toLowerCase()),v]));
 function alipayProof(raw,notify=false){const r=snake(raw),config=configuration('ALIPAY');if(notify&&(r.app_id!==config.app_id||r.seller_id!==config.merchant_id))throw error('PAYMENT_PROOF_MISMATCH',409);const status={WAIT_BUYER_PAY:'PENDING',TRADE_SUCCESS:'SUCCEEDED',TRADE_FINISHED:'SUCCEEDED',TRADE_CLOSED:'CLOSED'}[r.trade_status];if(!status)throw error('UNKNOWN_PROVIDER_STATUS',503);return {provider:'ALIPAY',environment,app_id:config.app_id,merchant_id:config.merchant_id,payment_id:id(r.out_trade_no),currency:'CNY',amount_minor:yuanToMinor(r.total_amount),transaction_id:r.trade_no||null,status,product_id:null,app_account_token:null};}
 async function appleProof(signed,notificationType=null){const r=await apple().verifier.verifyAndDecodeTransaction(signed),config=configuration('APPLE');if(r.bundleId!==config.app_id||r.environment!==(environment==='PRODUCTION'?'Production':'Sandbox')||r.type!=='Consumable'||r.inAppOwnershipType!=='PURCHASED'||r.quantity!==1||r.currency!=='CNY'||!Number.isSafeInteger(r.price)||r.price%10!==0)throw error('PAYMENT_PROOF_MISMATCH',409);ref(r.transactionId);id(r.appAccountToken);let status=notificationType==='REFUND_REVERSED'?'REVIEW_REQUIRED':'SUCCEEDED';if(r.revocationDate!==undefined){status=r.revocationType==='REFUND_FULL'||notificationType==='REFUND'&&r.revocationType!=='REFUND_PRORATED'&&r.revocationType!=='FAMILY_REVOKE'?'REFUNDED':'REVIEW_REQUIRED';}return {provider:'APPLE',environment,app_id:config.app_id,merchant_id:config.merchant_id,payment_id:r.appAccountToken,currency:r.currency,amount_minor:amount(r.price/10),transaction_id:r.transactionId,status,product_id:r.productId,app_account_token:r.appAccountToken};}
 function build(code){const config=configuration(code),inspection=()=>({implemented:true,configured:config.configured,config_revision:config.config_revision});
  const operations=code==='ALIPAY'?{
   create:async p=>{if(!/^https:\/\//.test(env.TRADE_ALIPAY_NOTIFY_URL)||p.currency!=='CNY')throw error('PAYMENT_CONFIGURATION_INVALID',503);const order_string=alipayClient().sdkExecute('alipay.trade.app.pay',{notifyUrl:env.TRADE_ALIPAY_NOTIFY_URL,bizContent:{outTradeNo:p.id,totalAmount:minorToYuan(p.amount_minor),subject:p.title,productCode:'QUICK_MSECURITY_PAY',timeoutExpress:p.payment_window_minutes+'m'}});if(typeof order_string!=='string'||!order_string)throw Error('INVALID_CHECKOUT');return {kind:'ALIPAY_APP',order_string};},
   query:async p=>{const r=snake(await alipayClient().exec('alipay.trade.query',{bizContent:{outTradeNo:p.id}},{validateSign:true}));if(r.code!=='10000'||r.out_trade_no!==p.id)throw Error('UNCONFIRMED_QUERY');return alipayProof(r);},
   refund:async r=>{const result=snake(await alipayClient().exec('alipay.trade.refund',{bizContent:{outTradeNo:r.payment_id,tradeNo:r.transaction_id,outRequestNo:r.id,refundAmount:minorToYuan(r.amount_minor),refundReason:r.reason}},{validateSign:true}));if(result.code!=='10000'||result.out_trade_no!==r.payment_id||result.trade_no!==r.transaction_id)throw Error('UNCONFIRMED_REFUND');return {status:'PENDING'};},
  }: {
   create:async p=>({kind:'APPLE_STOREKIT2',product_id:ref(p.apple_product_id),app_account_token:p.id}),
   query:async p=>{ref(p.transaction_id);const r=await apple().client.getTransactionInfo(p.transaction_id);const proof=await appleProof(r.signedTransactionInfo);if(proof.transaction_id!==p.transaction_id)throw Error('TRANSACTION_MISMATCH');return proof;},
   refund:async()=>({status:'AWAITING_APPLE_REQUEST'}),
  };
  const adapter=createAdapter({provider:descriptor(code==='ALIPAY'?'alipay':'apple'),repository,inspect:async()=>inspection(),operations});
  return {config,assertReady:()=>assertUsable(repository,adapter.identity,inspection()),call:adapter.call.bind(adapter),
   async notification(body){await assertUsable(repository,adapter.identity,inspection());if(code==='ALIPAY'){if(body.sign_type!=='RSA2'||!alipayClient().checkNotifySign(body,true))throw error('INVALID_PAYMENT_SIGNATURE',401);return alipayProof(body,true);}const n=await apple().verifier.verifyAndDecodeNotification(body.signedPayload);if(!['ONE_TIME_CHARGE','REFUND','REVOKE','REFUND_REVERSED'].includes(n.notificationType)||!n.data?.signedTransactionInfo)throw error('UNSUPPORTED_APPLE_EVENT',400);return appleProof(n.data.signedTransactionInfo,n.notificationType);},
   async refundQuery(r){await assertUsable(repository,adapter.identity,inspection());if(code==='APPLE')return adapter.call('query',{...r,payment_id:r.payment_id,id:r.payment_id});const q=snake(await alipayClient().exec('alipay.trade.fastpay.refund.query',{bizContent:{outTradeNo:r.payment_id,tradeNo:r.transaction_id,outRequestNo:r.id}},{validateSign:true}));if(q.code!=='10000'||q.out_trade_no!==r.payment_id||q.trade_no!==r.transaction_id||q.out_request_no!==r.id)throw Error('UNCONFIRMED_REFUND_QUERY');return {provider:code,environment,app_id:config.app_id,merchant_id:config.merchant_id,refund_id:r.id,payment_id:r.payment_id,transaction_id:q.trade_no,currency:'CNY',amount_minor:yuanToMinor(q.refund_amount),status:q.refund_status==='REFUND_SUCCESS'?'SUCCEEDED':'PENDING'};}
  };
 }
 const providers={ALIPAY:build('ALIPAY'),APPLE:build('APPLE')};
 return {get(code){if(!Object.hasOwn(providers,code))throw error('INVALID_PAYMENT_CHANNEL',400);return providers[code];},configuration};
}
module.exports={createTradeProviders};
