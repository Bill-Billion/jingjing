set -e
cd /opt/jjsr
echo "=== MD5(after upload) ==="
md5sum db.js app.js config.js routes/humans.js routes/projects.js routes/samples.js
echo "=== node --check ==="
for f in db.js app.js config.js routes/humans.js routes/projects.js routes/samples.js; do node --check "$f" && echo "SYNTAX_OK $f"; done
echo "=== pm2 restart ==="
pm2 restart jjsr --update-env
sleep 3
echo "=== health ==="
curl -s http://127.0.0.1:3000/api/health; echo
echo "=== schema verify ==="
node _verify_schema.js
echo "=== contacts mounted? no-token -> expect 401 (not 404) ==="
echo -n "POST /api/contacts/apply => "; curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:3000/api/contacts/apply
echo -n "GET  /api/projects/       => "; curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:3000/api/projects/?page=1&size=3"
echo -n "GET  /api/samples/library => "; curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:3000/api/samples/library"
echo "=== pm2 save ==="
pm2 save
echo "=== recent error logs(last 20) ==="
pm2 logs jjsr --lines 30 --nostream --err | tail -20 || true
