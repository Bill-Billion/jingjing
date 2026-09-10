const Database = require('/opt/jjsr/node_modules/better-sqlite3');
const db = new Database('/opt/jjsr/jingjingshangri.db', { readonly: true });
for (const t of ['users', 'sample_library', 'humans', 'talent_deposits', 'authorization_agreements']) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(t);
  console.log('==== ' + t + ' ====');
  console.log(row ? row.sql : 'MISSING');
}
console.log('==== sample_library rows ====');
const all = db.prepare('SELECT id, genre, title, substr(characters,1,60) ch, substr(tags,1,60) tg, substr(market_data,1,60) md FROM sample_library').all();
all.forEach(r => console.log(JSON.stringify(r)));
db.close();
