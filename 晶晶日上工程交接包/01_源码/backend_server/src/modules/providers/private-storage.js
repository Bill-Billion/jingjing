'use strict';
const { createHash } = require('node:crypto');
const { createAdapter } = require('./adapter');
const { failure } = require('./readiness');
const { createLogger } = require('../../infrastructure/observability');
function objectKey(key) {
  if (typeof key !== 'string' || key.length > 512 || !/^private\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_./-]+$/.test(key) || key.split('/').some(s => !s || s === '.' || s === '..')) throw failure('INVALID_PRIVATE_OBJECT_KEY');
  return key;
}
function settings(env) {
  const values = { region:env.OSS_REGION, bucket:env.OSS_BUCKET, accessKeyId:env.OSS_ACCESS_KEY_ID, accessKeySecret:env.OSS_ACCESS_KEY_SECRET, stsToken:env.OSS_STS_TOKEN };
  const environment = ['SANDBOX','PRODUCTION'].includes(env.OSS_ENVIRONMENT) ? env.OSS_ENVIRONMENT : 'LOCAL';
  const configured = ['development','test','production'].includes(env.NODE_ENV)
    && environment === (env.NODE_ENV === 'production' ? 'PRODUCTION' : 'SANDBOX')
    && !env.OSS_ENDPOINT && /^oss-[a-z0-9-]+$/.test(values.region || '')
    && /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(values.bucket || '')
    && typeof values.accessKeyId === 'string' && values.accessKeyId.length > 0
    && typeof values.accessKeySecret === 'string' && values.accessKeySecret.length > 0;
  const config_revision = createHash('sha256').update(JSON.stringify({values,environment,adapter:'private-oss-v1'})).digest('hex');
  return { values, environment, configured, config_revision };
}
function createPrivateStorage({env=process.env, repository, authorize=async()=>false, clientFactory, logger=createLogger()}={}) {
  const config = settings(env); let client;
  function getClient() {
    if (!config.configured) throw failure('PROVIDER_NOT_CONFIGURED');
    if (!client) {
      const options = {...config.values, secure:true, authorizationV4:true, timeout:10000, retryMax:0};
      client = clientFactory ? clientFactory(options) : new (require('ali-oss'))(options);
    }
    return client;
  }
  const inspect = () => ({implemented:true, configured:config.configured, config_revision:config.config_revision});
  const adapter = createAdapter({provider:{provider_kind:'ObjectStorageProvider',provider_code:'aliyun-oss',capability_code:'private_assets',environment:config.environment},repository,inspect,logger,
    operations:{
      async put({key,body,contentType}) {
        const result = await getClient().put(key,body,{mime:contentType,headers:{'x-oss-object-acl':'private','x-oss-forbid-overwrite':'true'}});
        return {key,size:body.length,sha256:createHash('sha256').update(body).digest('hex'),provider_request_id:result?.res?.headers?.['x-oss-request-id']};
      },
      async get({key}) { const result=await getClient().get(key); return {body:result.content,provider_request_id:result?.res?.headers?.['x-oss-request-id']}; },
      async sign({key,expires}) {
        const url=await getClient().signatureUrlV4('GET',expires,undefined,key);
        if (typeof url !== 'string' || !url.startsWith('https://')) throw failure('INVALID_PRIVATE_URL');
        return {url,expires};
      },
      async remove({key}) { const result=await getClient().delete(key); return {key,provider_request_id:result?.res?.headers?.['x-oss-request-id']}; },
    }});
  async function call(operation, input, context={}) {
    objectKey(input.key);
    let allowed;
    try { allowed = await authorize({operation,key:input.key,context}); }
    catch {
      logger.warn('private_asset_blocked', {...context,provider_code:'aliyun-oss',error_code:'PRIVATE_AUTHORIZATION_UNAVAILABLE'});
      throw failure('PRIVATE_AUTHORIZATION_UNAVAILABLE');
    }
    if (allowed !== true) {
      logger.warn('private_asset_blocked', {...context,provider_code:'aliyun-oss',error_code:'PRIVATE_ASSET_FORBIDDEN'});
      throw Object.assign(failure('PRIVATE_ASSET_FORBIDDEN'),{status:403});
    }
    return adapter.call(operation,input,context);
  }
  return Object.freeze({
    identity:adapter.identity, inspect,
    async put({key,body,contentType='application/octet-stream',isPrivate=true},context) {
      if (isPrivate !== true) throw failure('PRIVATE_STORAGE_ONLY');
      if (!Buffer.isBuffer(body) || body.length > 50*1024*1024) throw failure('INVALID_PRIVATE_BODY');
      if (!/^[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+$/.test(contentType)) throw failure('INVALID_CONTENT_TYPE');
      return call('put',{key,body,contentType},context);
    },
    getBuffer(key,context) { return call('get',{key},context).then(result=>result.body); },
    signedUrl(key,{expires=300}={},context) {
      if (!Number.isInteger(expires) || expires < 1 || expires > 900) return Promise.reject(failure('INVALID_URL_EXPIRY'));
      return call('sign',{key,expires},context);
    },
    remove(key,context) { return call('remove',{key},context); },
    publicUrl() { throw failure('PRIVATE_ASSET_HAS_NO_PUBLIC_URL'); },
  });
}
module.exports={createPrivateStorage,objectKey};
