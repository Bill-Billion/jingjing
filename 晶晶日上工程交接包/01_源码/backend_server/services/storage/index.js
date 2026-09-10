// services/storage/index.js - 存储适配层（StorageProvider）
// 统一 put / getBuffer(私有读) / signedUrl / publicUrl / remove。
// 默认 localDriver（=现有本地 uploads，行为完全不变）；OSS_ENABLED=true 且凭证齐全时用 ossDriver，
// 缺依赖或缺 AK/SK/Bucket 时优雅降级回本地并只告警一次——绝不硬编码密钥、绝不假装已接 OSS。
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const logger = require('../../utils/logger');

/**
 * @typedef {Object} PutResult
 * @property {string} key   存储内相对键，如 ai/123_abc.png
 * @property {string} url   访问 URL（本地为 /uploads/.. 相对路径；OSS 为签名/公网 URL）
 *
 * @typedef {Object} StorageProvider
 * @property {string} driver
 * @property {(p:{key:string, body:Buffer, contentType?:string, isPrivate?:boolean})=>Promise<PutResult>} put
 * @property {(key:string)=>Promise<Buffer>} getBuffer
 * @property {(key:string, expiresSec?:number)=>Promise<string>} signedUrl
 * @property {(key:string)=>string} publicUrl
 * @property {(key:string)=>Promise<void>} remove
 */

// ---------------- 本地磁盘驱动（现状，默认） ----------------
const localRoot = path.resolve(config.upload.dir);
const localDriver = {
  driver: 'local',
  async put({ key, body }) {
    const full = path.join(localRoot, key);
    await fs.promises.mkdir(path.dirname(full), { recursive: true });
    await fs.promises.writeFile(full, body);
    return { key, url: this.publicUrl(key) };
  },
  async getBuffer(key) {
    return fs.promises.readFile(path.join(localRoot, key));
  },
  // 本地通过 Express 静态目录同源公开，签名 URL 即其相对 URL（行为不变）
  async signedUrl(key) { return this.publicUrl(key); },
  publicUrl(key) { return `${config.upload.urlPrefix}/${key}`; },
  async remove(key) {
    try { await fs.promises.unlink(path.join(localRoot, key)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  },
};

// ---------------- 阿里云 OSS 驱动（预留，缺凭证/依赖即降级） ----------------
let ossClient = null;
let ossTried = false;
function ossSettings() {
  return {
    region: process.env.OSS_REGION || '',
    bucket: process.env.OSS_BUCKET || '',
    accessKeyId: process.env.OSS_ACCESS_KEY_ID || '',
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || '',
    endpoint: process.env.OSS_ENDPOINT || '',
    cdnBase: process.env.OSS_CDN_BASE || '', // 配置后公共读对象走 CDN 域名
  };
}
function ossConfigured() {
  const s = ossSettings();
  return !!(s.region && s.bucket && s.accessKeyId && s.accessKeySecret);
}
function buildOssClient() {
  if (ossTried) return ossClient;
  ossTried = true;
  const s = ossSettings();
  let OSS;
  try { OSS = require('ali-oss'); }
  catch (e) {
    logger.warn('oss_driver_unavailable', { reason: '缺少 ali-oss 依赖，切换时执行 npm i ali-oss；本次降级本地存储' });
    return null;
  }
  if (!ossConfigured()) {
    logger.warn('oss_driver_unavailable', { reason: 'OSS_REGION/BUCKET/AK/SK 未配齐，降级本地存储' });
    return null;
  }
  ossClient = new OSS({
    region: s.region,
    bucket: s.bucket,
    accessKeyId: s.accessKeyId,
    accessKeySecret: s.accessKeySecret,
    endpoint: s.endpoint || undefined,
    secure: true,
  });
  return ossClient;
}
const ossDriver = {
  driver: 'oss',
  async put({ key, body, contentType, isPrivate }) {
    const client = buildOssClient();
    if (!client) return localDriver.put({ key, body, contentType, isPrivate });
    const r = await client.put(key, Buffer.from(body), { mime: contentType, headers: isPrivate ? { 'x-oss-object-acl': 'private' } : undefined });
    const url = isPrivate ? await this.signedUrl(key) : (ossSettings().cdnBase ? `${ossSettings().cdnBase}/${key}` : r.url);
    return { key, url };
  },
  async getBuffer(key) {
    const client = buildOssClient();
    if (!client) return localDriver.getBuffer(key);
    const r = await client.get(key);
    return Buffer.isBuffer(r.content) ? r.content : Buffer.from(r.content);
  },
  async signedUrl(key, expiresSec = 3600) {
    const client = buildOssClient();
    if (!client) return localDriver.signedUrl(key);
    return client.signatureUrl(key, { expires: expiresSec });
  },
  publicUrl(key) {
    const s = ossSettings();
    return s.cdnBase ? `${s.cdnBase}/${key}` : `https://${s.bucket}.${s.region}.aliyuncs.com/${key}`;
  },
  async remove(key) {
    const client = buildOssClient();
    if (!client) return localDriver.remove(key);
    await client.delete(key);
  },
};

let warnedFallback = false;
/** 按配置返回驱动（单例语义）。默认本地；OSS 开关开但不可用时降级本地。 */
function getStorage() {
  if (config.upload.oss.enabled) {
    if (buildOssClient()) return ossDriver;
    if (!warnedFallback) { warnedFallback = true; logger.warn('storage_fallback_local'); }
  }
  return localDriver;
}

module.exports = {
  getStorage,
  localDriver,
  ossDriver,
  ossConfigured,
  // 便捷函数：业务侧最常用
  put: (p) => getStorage().put(p),
  publicUrl: (key) => getStorage().publicUrl(key),
};
