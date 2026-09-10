echo "===NGINX_UPLOADS==="; sed -n '40,62p' /etc/nginx/sites-enabled/jjsr
echo "===MIME_MP4==="; grep -i "mp4" /etc/nginx/mime.types
echo "===SAMPLE_TABLE==="; cd /opt/jjsr && node -e 'const db=require("better-sqlite3")("jingjingshangri.db");const cols=db.prepare("PRAGMA table_info(sample_library)").all();console.log("COLS",cols.map(c=>c.name+":"+c.type).join("|"));console.log("ROWS",db.prepare("select count(*) c from sample_library").get().c);console.log("DATA",JSON.stringify(db.prepare("select id,genre,title,status,cover_url from sample_library order by id").all()));'
echo "===UPLOAD_TEST==="; ls -la /opt/jjsr/uploads/avatars | head -5
echo "===NODE_VER==="; node -v
