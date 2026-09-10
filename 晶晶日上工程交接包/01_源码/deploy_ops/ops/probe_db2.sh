node -v
ls /opt/jjsr/node_modules | grep -iE "sqlite|better" 
echo "---tables via better-sqlite3---"
cd /opt/jjsr && node -e "try{const D=require('better-sqlite3');const db=new D('/opt/jjsr/jingjingshangri.db',{readonly:true});const t=db.prepare(\"select name from sqlite_master where type='table'\").all();console.log(t.map(x=>x.name).join(','));}catch(e){console.log('ERR',e.message)}"
