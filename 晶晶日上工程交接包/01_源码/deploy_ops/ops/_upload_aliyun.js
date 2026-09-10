// 一次性上传 V12.5 阿里云合规全部后端文件，并核对字节数
const fs = require('fs');
const path = require('path');
const { Client } = require('ssh2');
const conn = require('./conn.json');
const LOCAL_ROOT = 'C:/Users/user/Doubao/chats/2026-08-24/new-chat-3/work/server/server';
const REMOTE_ROOT = '/opt/jjsr';
const FILES = [
  'config.js', 'app.js', 'package.json', 'package-lock.json', '.env.example',
  'services/providers/aliyunClient.js',
  'services/providers/idVerify.js',
  'services/providers/faceVerify.js',
  'services/providers/moderation.js',
  'utils/contentModeration.js',
  'routes/identity.js',
  'routes/compliance.js',
  'routes/faceverify.js',
  'routes/review.js',
  'routes/videos.js',
  'routes/endorsement.js',
  'scripts/aliyun_compliance_selftest.js',
];
const cli = new Client();
const mkdirp = (sftp, p) => new Promise((res) => {
  const parts = p.replace(/^\//, '').split('/'); let cur = '';
  const next = () => { if (!parts.length) return res(); cur += '/' + parts.shift(); sftp.mkdir(cur, () => next()); };
  next();
});
cli.on('ready', () => {
  cli.sftp(async (err, sftp) => {
    if (err) { console.error(err.message); process.exit(1); }
    let ok = 0, bad = 0;
    for (const rel of FILES) {
      const lp = path.join(LOCAL_ROOT, rel.split('/').join(path.sep));
      const rp = REMOTE_ROOT + '/' + rel;
      if (!fs.existsSync(lp)) { console.log('LOCAL_MISSING', rel); bad++; continue; }
      const localStat = fs.statSync(lp);
      await mkdirp(sftp, path.posix.dirname(rp));
      await new Promise((resolve) => {
        sftp.fastPut(lp, rp, (e) => {
          if (e) { console.log('PUT_ERR', rel, e.message); bad++; return resolve(); }
          sftp.stat(rp, (er, st) => {
            const match = st && st.size === localStat.size;
            console.log((match ? 'OK ' : 'SIZE_MISMATCH '), rel, st ? st.size : '?', '/', localStat.size);
            if (match) ok++; else bad++;
            resolve();
          });
        });
      });
    }
    console.log('UPLOAD DONE ok=' + ok + ' bad=' + bad);
    cli.end();
    process.exit(bad ? 1 : 0);
  });
}).on('error', (e) => { console.error('CONN_ERR', e.message); process.exit(3); })
  .connect({ host: conn.host, port: conn.port || 22, username: conn.user, password: conn.pwd, readyTimeout: 20000 });
