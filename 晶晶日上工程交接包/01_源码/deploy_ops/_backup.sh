set -e
TS=$(date +%Y%m%d_%H%M%S)
BK=/opt/jjsr/backup_$TS
mkdir -p $BK/services $BK/routes
cd /opt/jjsr
cp -p app.js config.js db.js package.json package-lock.json $BK/ 2>/dev/null || true
cp -p services/*.js $BK/services/ 2>/dev/null || true
cp -p routes/ai.js routes/auth.js $BK/routes/ 2>/dev/null || true
echo "backup_at=$BK"
du -sh $BK
ls -1 $BK $BK/services $BK/routes
