echo '=== current SMS target keys ==='
grep -E '^SMS_(SIGN_NAME|LOGIN_TEMPLATE_ID|ENABLED)=' /opt/jjsr/.env || echo 'NONE_OF_TARGET_KEYS'
echo '=== all SMS key names only (no secrets) ==='
grep -oE '^SMS_[A-Z_]+=' /opt/jjsr/.env | sort
echo '=== health ==='
curl -s http://127.0.0.1:3000/api/health
echo
echo '=== pm2 jjsr ==='
pm2 describe jjsr | grep -E 'status|restarts' | head -3
