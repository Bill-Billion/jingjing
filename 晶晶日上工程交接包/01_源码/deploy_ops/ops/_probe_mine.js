process.chdir('/opt/jjsr');
const http = require('http');
const db = require('/opt/jjsr/db');
const { signToken } = require('/opt/jjsr/middleware/auth');
const row = db.prepare('SELECT id,name,price,status,user_id FROM humans LIMIT 3').all();
console.log('RAW HUMANS =', JSON.stringify(row));
const token = signToken({ userId: 1, role: 'user' });
http.get({ host: '127.0.0.1', port: 3000, path: '/api/humans?mine=1', headers: { Authorization: 'Bearer ' + token } }, (r) => {
  let d = ''; r.on('data', c => d += c); r.on('end', () => { console.log('MINE BODY =', d); process.exit(0); });
}).on('error', e => { console.log('ERR', e.message); process.exit(1); });
