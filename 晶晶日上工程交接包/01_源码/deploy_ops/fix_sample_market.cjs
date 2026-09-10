// 第41轮补充：让在线库 id1/2/3 的 market_data 与 App demo mock 对齐（id4 已就位），统一选剧卡热度行
const path = require('path');
const Database = require('better-sqlite3');
const db = new Database(path.join('/opt/jjsr', 'jingjingshangri.db'));
const up = db.prepare('UPDATE sample_library SET market_data=? WHERE id=?');
const rows = [
  [1, { heat: 9.6, rating: '豆瓣风评向好' }],
  [2, { heat: 8.8, rating: '高燃治愈' }],
  [3, { heat: 9.0, rating: '硬核动作' }],
];
for (const [id, obj] of rows) {
  const r = up.run(JSON.stringify(obj), id);
  console.log('id', id, 'changes', r.changes, JSON.stringify(obj));
}
console.log(db.prepare('SELECT id, genre, title, heat_score, market_data FROM sample_library ORDER BY id').all());
db.close();
console.log('MARKET_DONE');
