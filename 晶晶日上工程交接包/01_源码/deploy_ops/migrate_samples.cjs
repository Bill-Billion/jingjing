// 一次性迁移：sample_library 增加 video_url；黄帝(id1)挂真实样片；新增七宗罪·人性局(悬疑推理)。幂等可重跑。
const fs = require('fs');
const DB_PATH = '/opt/jjsr/jingjingshangri.db';
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const bk = '/opt/jjsr/backups/db/manual_samples_' + stamp + '.db';
fs.copyFileSync(DB_PATH, bk);
console.log('backup ->', bk);

const Database = require('better-sqlite3');
const db = new Database(DB_PATH);
const cols = db.prepare('PRAGMA table_info(sample_library)').all().map((c) => c.name);
if (!cols.includes('video_url')) {
  db.exec('ALTER TABLE sample_library ADD COLUMN video_url TEXT');
  console.log('added column video_url');
} else {
  console.log('column video_url already exists');
}

// 黄帝史诗·天下合（id1，古装逆袭）：挂真实样片 + 抽帧封面
const up = db.prepare('UPDATE sample_library SET video_url=?, cover_url=? WHERE id=1');
const r1 = up.run('/uploads/samples/huangdi_ttx.mp4', '/uploads/samples/huangdi_ttx_cover.jpg');
console.log('update id1 changes=', r1.changes);

// 七宗罪·人性局（悬疑推理，能力演示样片）：先删同名片再插，保证幂等
db.prepare("DELETE FROM sample_library WHERE genre='悬疑推理' AND title='七宗罪·人性局'").run();
const ins = db.prepare(
  "INSERT INTO sample_library (id,genre,title,outline,characters,tags,market_data,heat_score,cover_url,video_url,sort_order,status,created_at) " +
  "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now','localtime'))"
);
ins.run(
  4,
  '悬疑推理',
  '七宗罪·人性局',
  '以七宗罪为引的人性悬疑样片：欲望、猜忌与反转层层递进，强情绪钩子，适合定制高张力短剧。',
  JSON.stringify([{ name: '局中人' }, { name: '追查者' }]),
  JSON.stringify(['人性悬疑', '强反转', '高张力']),
  JSON.stringify({ heat: 9.2, rating: '节奏紧凑' }),
  8600,
  '/uploads/samples/renxingju_7sins_cover.jpg',
  '/uploads/samples/renxingju_7sins.mp4',
  2,
  'active'
);
console.log('inserted 七宗罪·人性局');

const rows = db
  .prepare('SELECT id,genre,title,heat_score,cover_url,video_url,status FROM sample_library ORDER BY id')
  .all();
console.log(JSON.stringify(rows, null, 1));
db.close();
console.log('MIGRATE_DONE');
