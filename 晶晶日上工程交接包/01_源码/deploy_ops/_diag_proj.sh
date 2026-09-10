cd /opt/jjsr
echo "===== md5 ====="
md5sum routes/projects.js routes/humans.js routes/samples.js
echo "===== projects.js lines 12-45 ====="
sed -n '12,45p' routes/projects.js
echo "===== sqlite version ====="
node -e 'const D=require("better-sqlite3");const d=new D("jingjingshangri.db");console.log(d.prepare("select sqlite_version() v").get());'
