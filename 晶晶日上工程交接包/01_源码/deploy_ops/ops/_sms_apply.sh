cd /opt/jjsr || exit 1
TS=$(date +%Y%m%d_%H%M%S)
mkdir -p backups
cp .env backups/.env.before_sms_$TS
echo "backup=backups/.env.before_sms_$TS"

sed -i 's#^SMS_SIGN_NAME=.*#SMS_SIGN_NAME=万霖新媒体#' .env
sed -i 's#^SMS_LOGIN_TEMPLATE_ID=.*#SMS_LOGIN_TEMPLATE_ID=S1T_1y2pbfeyk8cg2#' .env
sed -i 's#^SMS_ENABLED=.*#SMS_ENABLED=true#' .env
grep -q '^SMS_SIGN_NAME=' .env || echo 'SMS_SIGN_NAME=万霖新媒体' >> .env
grep -q '^SMS_LOGIN_TEMPLATE_ID=' .env || echo 'SMS_LOGIN_TEMPLATE_ID=S1T_1y2pbfeyk8cg2' >> .env
grep -q '^SMS_ENABLED=' .env || echo 'SMS_ENABLED=true' >> .env

echo '=== after (target keys only) ==='
grep -E '^SMS_(SIGN_NAME|LOGIN_TEMPLATE_ID|ENABLED)=' .env

pm2 restart jjsr >/dev/null 2>&1
sleep 2
echo '=== health ==='
curl -s http://127.0.0.1:3000/api/health
echo
pm2 describe jjsr | grep -E 'status|restarts|unstable' | head -4
