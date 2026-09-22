// app.js - 晶晶日上后端服务入口（V12 火山对接：AI异步任务重启恢复）
const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
if (config.env === 'production' || process.env.FIELD_ENC_KEY !== undefined) {
  require('./utils/crypto').assertFieldEncryptionConfigured();
}
require('./db');
const pkg = require('./package.json');

const app = express();
app.use(require('./src/infrastructure/observability').requestContext());
// Legacy SQLite routes are not the migrated MySQL application. Never report them ready.
app.use(require('./src/http/operations').createOperationsRouter());

// 安全中间件
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'");
  if (config.env === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// CORS 白名单
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || config.cors.origin.length === 0 || config.cors.origin.includes(origin)) {
      cb(null, true);
    } else {
      cb(new Error('CORS blocked'));
    }
  },
  credentials: true,
}));

// body解析；verify 保留原始字节，供供应商回调（AI webhook/支付回调）做 HMAC 验签
app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buf) => { if (buf && buf.length) req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 静态文件（生产环境用OSS，本地仅开发）
if (['development','test'].includes(config.env)) app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '7d',
  setHeaders: (res) => { res.setHeader('X-Content-Type-Options', 'nosniff'); },
}));

// 全局限流
const limits = require('./middleware/rateLimit');
app.use('/api/', limits.api);

// 路由
app.use('/api/auth', require('./routes/auth'));
app.use('/api/humans', require('./routes/humans'));
app.use('/api/videos', require('./routes/videos'));
app.use('/api/payment', require('./routes/payment'));
app.use('/api/pay', require('./routes/pay')); // V12.4 支付宝 APP 支付骨架（独立于旧 payment 占位链路）
app.use('/api/projects', require('./routes/projects'));
app.use('/api/theater', require('./routes/theater'));
app.use('/api/endorsement', require('./routes/endorsement'));
app.use('/api/settlement', require('./routes/settlement'));
app.use('/api/identity', require('./routes/identity'));
app.use('/api/mcn', require('./routes/mcn'));
app.use('/api/compliance', require('./routes/compliance'));
app.use('/api/face-verify', require('./routes/faceverify')); // V12.5 阿里云人脸核身（init/result）
app.use('/api/review', require('./routes/review'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/samples', require('./routes/samples'));
app.use('/api/orders', require('./routes/orders')); // V12 统一订单聚合
app.use('/api/messages', require('./routes/messages'));
app.use('/api/contacts', require('./routes/contacts')); // 联系方式双向申请（购买后申请→艺人同意→解锁）
// V5.0 新增路由
app.use('/api/scene-templates', require('./routes/sceneTemplates'));
app.use('/api/order-reviews', require('./routes/orderReviews'));
app.use('/api/share', require('./routes/share'));
app.use('/api/packages', require('./routes/packages'));
app.use('/api/scripts', require('./routes/scripts'));
// 火山引擎 AI：文案 / TTS / 声音复刻 / 文生图 / 视频异步（V12）
app.use('/api/ai', require('./routes/ai'));

// 健康检查（轻量，公网可达，不泄露上游配置细节）
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: '晶晶日上API', version: pkg.version, time: new Date().toISOString() });
});

// 全局错误处理
app.use((err, req, res, next) => {
  const logger = require('./utils/logger');
  logger.error('unhandled_error', { error: err.message, stack: err.stack?.slice(0, 500), path: req.path });
  if (err.message === 'CORS blocked') return res.status(403).json({ message: '来源不被允许' });
  res.status(err.status || 500).json({ message: err.message || '服务器内部错误' });
});

// R0.6: API does not own periodic jobs. Start the independent MySQL Worker explicitly.

app.listen(config.port, '0.0.0.0', () => {
  const logger = require('./utils/logger');
  // Legacy visual recovery is disabled until its domain adapter supports durable jobs.
  logger.info('server_started', { port: config.port, env: config.env, version: pkg.version });
  console.log(`晶晶日上 API ${pkg.version} 已启动 [${config.env}] http://localhost:${config.port}`);
});
