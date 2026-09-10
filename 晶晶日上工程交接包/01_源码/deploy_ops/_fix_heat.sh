cd /opt/jjsr
node -e 'const D=require("better-sqlite3");const db=new D("jingjingshangri.db");const r=db.prepare("UPDATE sample_library SET heat_score=88 WHERE id=4").run();console.log("changed",r.changes);console.log(db.prepare("SELECT id,genre,title,heat_score FROM sample_library ORDER BY id").all());db.close();'
echo FIX_DONE
