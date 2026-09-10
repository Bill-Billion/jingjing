// services/providers/aliyunClient.js
// 阿里云 OpenAPI 客户端统一工厂（实人认证 cloudauth + 内容安全 green）。
// 原则：缺 AK/SK 或 SDK 加载失败时返回 null，由调用方安全降级，绝不抛未捕获异常、绝不假装已接通。
const config = require('../../config');
const logger = require('../../utils/logger');

let _cloudauth = null;
let _green = null;
let _tried = false;

function credentials() {
  const a = config.aliyun || {};
  return {
    ok: !!(a.accessKeyId && a.accessKeySecret),
    accessKeyId: a.accessKeyId || '',
    accessKeySecret: a.accessKeySecret || '',
  };
}

function load() {
  if (_tried) return;
  _tried = true;
  if (!credentials().ok) return; // 未配置：保持 null，调用方降级
  try {
    const OpenApi = require('@alicloud/openapi-client');
    const CAMod = require('@alicloud/cloudauth20200618');
    const GRMod = require('@alicloud/green20220302');
    const CAClient = CAMod.default || CAMod.Client;
    const GRClient = GRMod.default || GRMod.Client;
    const a = config.aliyun;

    const caConfig = new OpenApi.Config({
      accessKeyId: a.accessKeyId,
      accessKeySecret: a.accessKeySecret,
      protocol: 'https',
      endpoint: a.cloudauth.endpoint,
      regionId: a.cloudauth.regionId,
    });
    const grConfig = new OpenApi.Config({
      accessKeyId: a.accessKeyId,
      accessKeySecret: a.accessKeySecret,
      protocol: 'https',
      endpoint: a.green.endpoint,
      regionId: a.green.regionId,
    });
    _cloudauth = new CAClient(caConfig);
    _green = new GRClient(grConfig);
  } catch (e) {
    logger.error('aliyun_client_init_fail', { error: e.message });
    _cloudauth = null;
    _green = null;
  }
}

/** 凭证齐全且两个客户端都成功初始化 */
function ready() {
  load();
  return credentials().ok && !!_cloudauth && !!_green;
}

function cloudauthClient() {
  load();
  return _cloudauth;
}

function greenClient() {
  load();
  return _green;
}

module.exports = { ready, cloudauthClient, greenClient, credentials };
