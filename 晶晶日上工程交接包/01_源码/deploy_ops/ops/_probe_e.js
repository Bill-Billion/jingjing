process.chdir('/opt/jjsr');
const http = require('http');
const { signToken } = require('/opt/jjsr/middleware/auth');
const token = signToken({ userId: 1, role: 'user' });
http.get({ host: '127.0.0.1', port: 3000, path: '/api/humans?mine=1', headers: { Authorization: 'Bearer ' + token } }, (r) => {
  let d = ''; r.on('data', c => d += c); r.on('end', () => { console.log(d); process.exit(0); });
}).on('error', e => { console.log('ERR', e.message); process.exit(1); });
