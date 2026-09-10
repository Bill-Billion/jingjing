echo CONNECTED
echo '--- pm2 ---'
pm2 list 2>/dev/null | head -20
echo '--- avatars ---'
ls -la /opt/jjsr/uploads/avatars 2>/dev/null | head -30
echo '--- banners ---'
ls -la /opt/jjsr/uploads/banners 2>/dev/null | head
echo '--- jjsr dir ---'
ls /opt/jjsr | head -40
echo '--- humans db ---'
cd /opt/jjsr && node -e 'const db=require("./db");console.log(JSON.stringify(db.prepare("SELECT id,name,avatar,price,style FROM humans").all(),null,1))'
echo '--- health ---'
curl -s -m8 http://127.0.0.1:3000/api/health; echo
echo '--- public humans ---'
curl -s -m8 "http://127.0.0.1:3000/api/humans?pageSize=2" | head -c 600; echo
