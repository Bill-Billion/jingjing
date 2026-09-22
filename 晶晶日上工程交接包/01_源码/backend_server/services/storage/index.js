'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const config = require('../../config');
const { failure } = require('../../src/modules/providers/readiness');
function localAllowed() {
  if (!['development','test'].includes(config.env)) throw failure('LEGACY_STORAGE_DISABLED');
}
async function keyPath(key) {
  localAllowed();
  if (typeof key !== 'string' || key.length > 512 || !/^[a-zA-Z0-9_./-]+$/.test(key) || key.split('/').some(s=>!s || s==='.' || s==='..')) throw failure('INVALID_STORAGE_KEY');
  const root=path.resolve(config.upload.dir), full=path.resolve(root,key);
  if (!full.startsWith(root+path.sep)) throw failure('INVALID_STORAGE_KEY');
  for (let current=full;;current=path.dirname(current)) {
    try { if ((await fs.lstat(current)).isSymbolicLink()) throw failure('STORAGE_SYMLINK_FORBIDDEN'); }
    catch(error) { if (error.code !== 'ENOENT') throw error; }
    if (current === root) break;
  }
  return full;
}
const localDriver={
  driver:'local-public-test-only',
  async put({key,body,isPrivate}) {
    localAllowed();
    if (isPrivate !== false) throw failure('PRIVATE_STORAGE_NOT_ENABLED');
    const full=await keyPath(key);await fs.mkdir(path.dirname(full),{recursive:true});await fs.writeFile(full,body,{flag:'wx'});
    return {key,url:await this.publicUrl(key)};
  },
  async getBuffer(key) { return fs.readFile(await keyPath(key)); },
  async signedUrl() { throw failure('LOCAL_PRIVATE_URL_UNAVAILABLE'); },
  async publicUrl(key) { await keyPath(key);return `${config.upload.urlPrefix.replace(/\/$/,'')}/${key}`; },
  async remove(key) { try { await fs.unlink(await keyPath(key)); } catch(error) { if(error.code!=='ENOENT')throw error; } },
};
function ossConfigured() { return ['OSS_REGION','OSS_BUCKET','OSS_ACCESS_KEY_ID','OSS_ACCESS_KEY_SECRET'].every(name=>!!process.env[name]); }
function getStorage() {
  localAllowed();
  if (config.upload.oss.enabled) throw failure('LEGACY_OSS_REQUIRES_MIGRATION');
  return localDriver;
}
module.exports={getStorage,localDriver,ossConfigured,put:options=>getStorage().put(options),publicUrl:key=>getStorage().publicUrl(key)};
