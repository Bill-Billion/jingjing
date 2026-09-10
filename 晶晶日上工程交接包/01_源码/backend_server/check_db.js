const db = require('./db');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
tables.forEach(t => {
  const cols = db.prepare(`PRAGMA table_info(${t.name})`).all();
  console.log(`\n=== ${t.name} ===`);
  cols.forEach(c => console.log(`  ${c.name} ${c.type}`));
});
