// utils/logger.js - 结构化日志
const config = require('../config');

function log(level, msg, meta = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...meta,
  };
  // 脱敏
  const str = JSON.stringify(entry)
    .replace(/"phone":"(\d{3})\d{4}(\d{4})"/g, '"phone":"$1****$2"')
    .replace(/"id_card":"(\w{4})\w+(\w{4})"/g, '"id_card":"$1**********$2"')
    .replace(/"bank_card":"(\d{4})\d+(\d{4})"/g, '"bank_card":"$1****$2"');
  if (level === 'error') console.error(str);
  else console.log(str);
}

module.exports = {
  info: (msg, meta) => log('info', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  error: (msg, meta) => log('error', msg, meta),
};
