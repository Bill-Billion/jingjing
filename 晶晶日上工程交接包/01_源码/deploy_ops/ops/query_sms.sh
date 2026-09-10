cd /opt/jjsr || exit 1
node -e '
const D=require("better-sqlite3");
const db=new D("jingjingshangri.db",{readonly:true});
const t="sms_verification_codes";
let cols=[];
try{ cols=db.prepare("PRAGMA table_info("+t+")").all().map(c=>c.name); }catch(e){ console.log("NO_TABLE",e.message); process.exit(0); }
console.log("COLS:",cols.join(","));
const rows=db.prepare("SELECT * FROM "+t+" ORDER BY id DESC LIMIT 5").all();
for(const r of rows){
  const p=String(r.phone||r.mobile||r.recipient||"");
  const m=p.length>=7?p.slice(0,3)+"****"+p.slice(-4):"##";
  const o={};
  for(const c of cols){
    if(/code|hash|token|secret|^key|access/i.test(c)) continue;
    if(/msg_id|message|provider|status|error|err|reason|created|sent|_at$|^id$|phone|mobile|channel/i.test(c)){
      let s=(r[c]==null)?"-":String(r[c]);
      if(/phone|mobile/.test(c)) s=m;
      if(s.length>70) s=s.slice(0,70);
      o[c]=s;
    }
  }
  console.log(JSON.stringify(o));
}
'
echo "---- recent sms/error logs ----"
pm2 logs jjsr --lines 80 --nostream 2>/dev/null | grep -iE "sms|RE:[0-9]|volc|error|fail|exception" | tail -15
echo "---- done ----"
