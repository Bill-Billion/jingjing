'use strict';
const fs = require('node:fs');

function configurationError(message) {
  return Object.assign(new Error(message), { code: 'DB_CONFIGURATION_INVALID' });
}
function integer(env, key, fallback, min, max) {
  const raw = env[key] ?? String(fallback);
  if (!/^\d+$/.test(String(raw)) || Number(raw) < min || Number(raw) > max) {
    throw configurationError(`${key} must be an integer between ${min} and ${max}`);
  }
  return Number(raw);
}
function mysqlConfig(env = process.env) {
  if (!['development', 'test', 'production'].includes(env.NODE_ENV || 'development')) throw configurationError('NODE_ENV must be development, test or production');
  if (env.DB_CLIENT !== 'mysql') throw configurationError('Async database requires DB_CLIENT=mysql; SQLite fallback is forbidden');
  for (const key of ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE']) {
    if (typeof env[key] !== 'string' || !env[key].trim()) throw configurationError(`${key} is required`);
  }
  if (!/^[A-Za-z0-9_]{1,64}$/.test(env.MYSQL_DATABASE)) throw configurationError('MYSQL_DATABASE must be a simple database identifier');
  const mode = env.MYSQL_SSL_MODE || 'disabled';
  if (!['disabled', 'verify_identity'].includes(mode)) throw configurationError('MYSQL_SSL_MODE must be disabled or verify_identity');
  if (env.NODE_ENV === 'production' && (mode !== 'verify_identity' || env.MYSQL_USER === 'root')) {
    throw configurationError('Production requires verified TLS and a non-root MySQL user');
  }
  let ssl;
  if (mode === 'verify_identity') {
    if (!env.MYSQL_SSL_CA) throw configurationError('MYSQL_SSL_CA is required for verified TLS');
    try { ssl = { ca: fs.readFileSync(env.MYSQL_SSL_CA), rejectUnauthorized: true, verifyIdentity: true }; }
    catch { throw configurationError('MYSQL_SSL_CA cannot be read'); }
  }
  return {
    host: env.MYSQL_HOST, port: integer(env, 'MYSQL_PORT', 3306, 1, 65535),
    user: env.MYSQL_USER, password: env.MYSQL_PASSWORD, database: env.MYSQL_DATABASE, ssl,
    connectionLimit: integer(env, 'MYSQL_CONNECTION_LIMIT', 4, 1, 100),
    queueLimit: 100, waitForConnections: true,
    connectTimeout: integer(env, 'MYSQL_CONNECT_TIMEOUT_MS', 5000, 100, 60000),
    charset: 'utf8mb4', timezone: 'Z', dateStrings: true,
    supportBigNumbers: true, bigNumberStrings: true, decimalNumbers: false,
    multipleStatements: false, enableKeepAlive: true,
  };
}
function assertLegacySQLiteAllowed(env = process.env) {
  if (!['development', 'test'].includes(env.NODE_ENV || 'development') || (env.DB_CLIENT && env.DB_CLIENT !== 'sqlite')) {
    throw Object.assign(new Error('Legacy synchronous SQLite entry is local/test only. Use the async MySQL layer; API route migration is not complete.'), { code: 'LEGACY_SQLITE_DISABLED' });
  }
}
module.exports = { mysqlConfig, assertLegacySQLiteAllowed };
