// V12.5 只读验证：mine 过滤 + usage-report/after-sales 金额单位为元。不写库。
process.chdir('/opt/jjsr');
const http = require('http');
const db = require('/opt/jjsr/db');
const { signToken } = require('/opt/jjsr/middleware/auth');

function get(path, token) {
  return new Promise((resolve) => {
    const req = http.get({
      host: '127.0.0.1', port: 3000, path,
      headers: token ? { Authorization: 'Bearer ' + token } : {},
      timeout: 8000,
    }, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => resolve({ code: r.statusCode, body: d }));
    });
    req.on('error', (e) => resolve({ code: 0, body: String(e) }));
    req.on('timeout', () => { req.destroy(); resolve({ code: 0, body: 'TIMEOUT' }); });
  });
}

(async () => {
  // 选一个拥有数字人的用户（优先含 pending 的）
  const owner = db.prepare("SELECT user_id, COUNT(*) c, SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) pend FROM humans GROUP BY user_id ORDER BY pend DESC, c DESC LIMIT 1").get();
  console.log('owner =', JSON.stringify(owner));
  if (!owner) { console.log('NO_HUMAN_OWNER; skip mine test'); }
  else {
    const token = signToken({ userId: owner.user_id, role: 'user' });
    const mine = await get('/api/humans?mine=1&pageSize=50', token);
    const mj = JSON.parse(mine.body);
    console.log('MINE code=', mine.code, 'count=', mj.list && mj.list.length,
      'statuses=', JSON.stringify((mj.list || []).map((h) => h.status)),
      'prices=', JSON.stringify((mj.list || []).map((h) => h.price)));
    const first = mj.list && mj.list[0];
    if (first) {
      const ur = await get(`/api/humans/${first.id}/usage-report`, token);
      console.log('USAGE code=', ur.code, 'body=', ur.body.slice(0, 500));
    }
  }
  // after-sales：找一条视频单（任意用户，用属主 token）
  const vo = db.prepare('SELECT id, order_no, user_id FROM video_orders ORDER BY created_at DESC LIMIT 1').get();
  if (vo) {
    const token = signToken({ userId: vo.user_id, role: 'user' });
    const as = await get(`/api/videos/after-sales/${vo.order_no}`, token);
    console.log('AFTERSALES order=', vo.order_no, 'code=', as.code, 'body=', as.body.slice(0, 400));
    const rf = db.prepare('SELECT amount FROM refunds WHERE order_no=?').get(vo.order_no);
    console.log('refund row in db(fen) =', rf ? rf.amount : 'none');
  } else {
    console.log('NO_VIDEO_ORDER; skip after-sales');
  }
  process.exit(0);
})();
