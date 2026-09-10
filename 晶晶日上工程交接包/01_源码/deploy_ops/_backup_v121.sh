set -e
cd /opt/jjsr
TS=$(date +%Y%m%d_%H%M%S)
BK=backup_v121_$TS
mkdir -p $BK/routes
for f in db.js app.js config.js routes/humans.js routes/projects.js routes/samples.js; do cp "$f" "$BK/$f"; done
echo "=== BACKUP_DIR=$BK ==="
ls -la "$BK" "$BK/routes"
echo "=== PM2 ==="
pm2 list | grep -i jjsr || true
echo "=== HEALTH(before) ==="
curl -s http://127.0.0.1:3000/api/health; echo
echo "=== MD5(before) ==="
md5sum db.js app.js config.js routes/humans.js routes/projects.js routes/samples.js
