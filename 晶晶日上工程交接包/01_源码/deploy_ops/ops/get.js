// SFTP 下载助手: node get.js 远程路径 本地路径
const fs = require('fs');
const { Client } = require('ssh2');
const conn = require('./conn.json');
const [remote, local] = [process.argv[2], process.argv[3]];
if (!remote || !local) { console.error('need remote local'); process.exit(2); }
const cli = new Client();
cli.on('ready', () => {
  cli.sftp((err, sftp) => {
    if (err) { console.error(err.message); process.exit(1); }
    sftp.fastGet(remote, local, (e) => {
      if (e) { console.error('GET_ERR', e.message); process.exit(1); }
      console.log('downloaded', remote, '->', local, fs.statSync(local).size, 'bytes');
      cli.end();
    });
  });
}).on('error', (e) => { console.error('CONN_ERR', e.message); process.exit(3); })
  .connect({ host: conn.host, port: conn.port || 22, username: conn.user, password: conn.pwd, readyTimeout: 20000 });
