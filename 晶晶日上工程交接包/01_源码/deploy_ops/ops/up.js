// SFTP 上传助手: node up.js 本地路径 远程路径
const fs = require('fs');
const { Client } = require('ssh2');
const conn = require('./conn.json');
const [local, remote] = [process.argv[2], process.argv[3]];
if (!local || !remote) { console.error('need local remote'); process.exit(2); }
const cli = new Client();
cli.on('ready', () => {
  cli.sftp((err, sftp) => {
    if (err) { console.error(err.message); process.exit(1); }
    const mkdirp = (p, cb) => {
      const parts = p.replace(/^\//, '').split('/'); let cur = '';
      const next = () => {
        if (!parts.length) return cb();
        cur += '/' + parts.shift();
        sftp.mkdir(cur, () => next());
      };
      next();
    };
    mkdirp(require('path').posix.dirname(remote), () => {
      sftp.fastPut(local, remote, (e) => {
        if (e) { console.error('PUT_ERR', e.message); process.exit(1); }
        sftp.stat(remote, (er, st) => {
          console.log('uploaded', remote, st ? st.size : '?', 'bytes');
          cli.end();
        });
      });
    });
  });
}).on('error', (e) => { console.error('CONN_ERR', e.message); process.exit(3); })
  .connect({ host: conn.host, port: conn.port || 22, username: conn.user, password: conn.pwd, readyTimeout: 20000 });
