DB=/opt/jjsr/jingjingshangri.db
echo "=== tables ==="
sqlite3 "$DB" ".tables" 2>&1
echo "=== sms-ish schema ==="
sqlite3 "$DB" ".schema" 2>&1 | grep -iE "sms|code|verif|captcha|sent" | head -30
