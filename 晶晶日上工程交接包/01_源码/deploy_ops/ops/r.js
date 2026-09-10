// 远程命令执行助手（Node/ssh2），用法: node r.js "cmd"  或  node r.js --file f.sh
// 凭证仅保存在本机工作目录，禁止提交 git / 外传。
const fs = require('fs');
const { Client } = require('ssh2');
const conn = require('./conn.json');
const arg = process.argv[2];
if (!arg) { console.error('need command'); process.exit(2); }
const cmd = arg === '--file' ? fs.readFileSync(process.argv[3], 'utf8') : arg;
const cli = new Client();
cli.on('ready', () => {
  cli.exec(cmd, { pty: false }, (err, stream) => {
    if (err) { console.error(err.message); process.exit(1); }
    let code = 0;
    stream.on('close', (c) => { code = c || 0; cli.end(); process.exit(code); });
    stream.on('data', (d) => process.stdout.write(d));
    stream.stderr.on('data', (d) => process.stderr.write(d));
  });
}).on('error', (e) => { console.error('CONN_ERR', e.message); process.exit(3); })
  .connect({ host: conn.host, port: conn.port || 22, username: conn.user, password: conn.pwd, readyTimeout: 20000, keepaliveInterval: 10000 });
