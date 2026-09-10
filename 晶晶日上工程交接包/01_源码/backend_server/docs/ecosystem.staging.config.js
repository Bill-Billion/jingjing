// PM2 Staging 进程配置（与生产 jjsr 隔离）。放到 /opt/jjsr-staging/ 后 pm2 start 本文件。
module.exports = {
  apps: [{
    name: 'jjsr-staging',
    script: 'app.js',
    cwd: '/opt/jjsr-staging',
    node_args: [],
    env: {
      NODE_ENV: 'staging',
      PORT: 3100,
      SQLITE_PATH: '/opt/jjsr-staging/staging.db',
      UPLOAD_URL_PREFIX: '/staging-uploads',
    },
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_memory_restart: '220M',
    error_file: '/root/.pm2/logs/jjsr-staging-error.log',
    out_file: '/root/.pm2/logs/jjsr-staging-out.log',
    time: true,
  }],
};
