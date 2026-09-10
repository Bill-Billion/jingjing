cd /opt/jjsr && node -e "
const D=require('better-sqlite3');
const db=new D('/opt/jjsr/jingjingshangri.db',{readonly:true});
const cols=db.prepare(\"PRAGMA table_info(sms_verification_codes)\").all().map(c=>c.name);
console.log('COLS:',cols.join(','));
const rows=db.prepare('SELECT * FROM sms_verification_codes ORDER BY rowid DESC LIMIT 8').all();
for(const r of rows){
  const o={...r};
  for(const k of Object.keys(o)){ if(/phone|mobile/i.test(k)&&o[k]) o[k]=String(o[k]).replace(/(\d{3})\d{4}(\d{4})/,'\$1****\$2'); if(/code/i.test(k))o[k]='***'; }
  console.log(JSON.stringify(o));
}
"
